// POST { action: 'start' }                     → { url }  (link de autorização do Mercado Livre, com PKCE)
// POST { action: 'callback', code, state }     → { account: { id, nickname } }
// POST { action: 'disconnect', account_id }    → { ok: true }

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { errorResponse, fail, HttpError, json, readJson, UUID_RE } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/auth.ts'
import { exchangeCode, ML_AUTH, MlError, mlConfig, mlFetch, pkcePair, randomState, storeTokens } from '../_shared/mercadolivre.ts'

/** Limite de lojas do plano ativo (admin: ilimitado; sem plano: 0) */
async function storeLimit(db: SupabaseClient, userId: string): Promise<number> {
  const { data: prof } = await db.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (prof?.role === 'admin') return 1000
  const { data } = await db.from('subscriptions')
    .select('current_period_end, plan:plans(limits)')
    .eq('user_id', userId).in('status', ['active', 'past_due'])
  const now = Date.now()
  let max = 0
  for (const s of (data ?? []) as unknown as { current_period_end: string | null; plan: { limits: Record<string, number> } | null }[]) {
    if (s.current_period_end && new Date(s.current_period_end).getTime() <= now) continue
    max = Math.max(max, Number(s.plan?.limits?.max_stores ?? 1))
  }
  return max
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  const cors = corsHeaders(req)
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Método não permitido.', cors)

  try {
    const user = await requireUser(req)
    const body = await readJson<{ action?: unknown; code?: unknown; state?: unknown; account_id?: unknown }>(req, 4096)
    const db = adminClient()

    // ------------------------------------------------------------ start
    if (body.action === 'start') {
      const { clientId, redirectUri } = mlConfig()
      const limit = await storeLimit(db, user.id)
      if (limit <= 0) throw new HttpError(403, 'subscription_required', 'Ative um plano para conectar sua loja.')
      const { count } = await db.from('ml_accounts').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      if ((count ?? 0) >= limit) throw new HttpError(403, 'store_limit', `Seu plano permite até ${limit} lojas conectadas.`)

      await db.from('ml_oauth_states').delete().lt('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
      const { verifier, challenge } = await pkcePair()
      const state = randomState()
      const { error } = await db.from('ml_oauth_states').insert({ state, user_id: user.id, code_verifier: verifier })
      if (error) throw error

      const url = new URL(ML_AUTH)
      url.search = new URLSearchParams({
        response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
        code_challenge: challenge, code_challenge_method: 'S256',
      }).toString()
      return json(200, { url: url.toString() }, cors)
    }

    // --------------------------------------------------------- callback
    if (body.action === 'callback') {
      const code = typeof body.code === 'string' && /^[\w-]{10,200}$/.test(body.code) ? body.code : null
      const state = typeof body.state === 'string' && /^[\w-]{10,100}$/.test(body.state) ? body.state : null
      if (!code || !state) throw new HttpError(400, 'invalid_request', 'Retorno do Mercado Livre inválido.')

      // O state precisa ser deste usuário, recente e só pode ser usado uma vez
      const { data: st } = await db.from('ml_oauth_states').select('code_verifier, created_at')
        .eq('state', state).eq('user_id', user.id).maybeSingle()
      await db.from('ml_oauth_states').delete().eq('state', state)
      if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) {
        throw new HttpError(400, 'state_expired', 'A autorização expirou. Clique em conectar novamente.')
      }

      let tokens
      try { tokens = await exchangeCode(code, st.code_verifier) } catch (e) {
        if (e instanceof MlError) throw new HttpError(400, 'ml_auth_failed', 'O Mercado Livre não confirmou a autorização. Tente conectar novamente.')
        throw e
      }
      const me = await mlFetch<{ id: number; nickname?: string; site_id?: string }>(tokens.access_token, '/users/me')

      const { data: existing } = await db.from('ml_accounts').select('id').eq('user_id', user.id).eq('ml_user_id', me.id).maybeSingle()
      if (!existing) {
        const limit = await storeLimit(db, user.id)
        const { count } = await db.from('ml_accounts').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
        if ((count ?? 0) >= limit) throw new HttpError(403, 'store_limit', `Seu plano permite até ${limit} lojas conectadas.`)
      }
      const { data: acc, error: accErr } = await db.from('ml_accounts')
        .upsert({ user_id: user.id, ml_user_id: me.id, nickname: me.nickname ?? null, site_id: me.site_id ?? 'MLB', status: 'active', last_error: null },
          { onConflict: 'user_id,ml_user_id' })
        .select('id, nickname').single()
      if (accErr) throw accErr
      await storeTokens(db, acc.id, tokens)
      return json(200, { account: acc }, cors)
    }

    // ------------------------------------------------------- disconnect
    if (body.action === 'disconnect') {
      const id = typeof body.account_id === 'string' && UUID_RE.test(body.account_id) ? body.account_id : null
      if (!id) throw new HttpError(400, 'invalid_request', 'Loja inválida.')
      const { error } = await db.from('ml_accounts').delete().eq('id', id).eq('user_id', user.id)
      if (error) throw error
      return json(200, { ok: true }, cors)
    }

    throw new HttpError(400, 'invalid_action', 'Ação inválida.')
  } catch (err) {
    return errorResponse(err, corsHeaders(req))
  }
})

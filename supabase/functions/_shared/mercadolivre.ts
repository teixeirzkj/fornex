// Cliente da API do Mercado Livre + gestão dos tokens OAuth (guardados no Supabase Vault).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './http.ts'

export const ML_API = 'https://api.mercadolibre.com'
export const ML_AUTH = 'https://auth.mercadolivre.com.br/authorization'

export function mlConfig() {
  const clientId = Deno.env.get('ML_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('ML_CLIENT_SECRET') ?? ''
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')
  if (!clientId || !clientSecret || !appUrl) {
    throw new HttpError(503, 'ml_not_configured', 'A integração com o Mercado Livre ainda não foi configurada.')
  }
  return { clientId, clientSecret, redirectUri: `${appUrl}/app/lojas/callback` }
}

/** Erro da API do ML com as mensagens de validação (cause) já em texto */
export class MlError extends Error {
  constructor(public status: number, message: string, public causes: string[] = []) { super(message) }
}

export async function mlFetch<T = Record<string, unknown>>(
  token: string | null, path: string, init: { method?: string; body?: unknown; form?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let body: string | undefined
  if (init.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(init.form).toString()
  } else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.body)
  }
  const res = await fetch(`${ML_API}${path}`, { method: init.method ?? 'GET', headers, body, signal: AbortSignal.timeout(20000) })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* resposta não-JSON */ }
  if (!res.ok) {
    const causes = Array.isArray(json.cause)
      ? (json.cause as Record<string, unknown>[]).map((c) => String(c.message ?? c.code ?? '')).filter(Boolean)
      : []
    console.error('Mercado Livre', res.status, path, text.slice(0, 600))
    throw new MlError(res.status, String(json.message ?? json.error ?? `HTTP ${res.status}`), causes)
  }
  return json as T
}

/** PKCE: code_verifier aleatório e challenge S256 */
export async function pkcePair() {
  const bytes = crypto.getRandomValues(new Uint8Array(48))
  const verifier = b64url(bytes)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return { verifier, challenge: b64url(digest) }
}

export function randomState() {
  return b64url(crypto.getRandomValues(new Uint8Array(24)))
}

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number; user_id: number }

export async function exchangeCode(code: string, verifier: string) {
  const { clientId, clientSecret, redirectUri } = mlConfig()
  return mlFetch<TokenResponse>(null, '/oauth/token', {
    method: 'POST',
    form: { grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, code_verifier: verifier },
  })
}

export async function storeTokens(db: SupabaseClient, accountId: string, t: TokenResponse) {
  const expiresAt = new Date(Date.now() + (Number(t.expires_in) || 21600) * 1000).toISOString()
  const { error } = await db.rpc('ml_store_tokens', {
    p_account_id: accountId, p_access: t.access_token, p_refresh: t.refresh_token ?? null, p_expires_at: expiresAt,
  })
  if (error) throw error
}

/** Token de acesso válido da loja (renova com o refresh_token quando falta < 10 min). */
export async function getAccessToken(db: SupabaseClient, accountId: string): Promise<string> {
  const { data, error } = await db.rpc('ml_get_tokens', { p_account_id: accountId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { access_token: string | null; refresh_token: string | null; expires_at: string | null } | undefined
  if (!row?.access_token) throw new HttpError(409, 'store_reconnect', 'Reconecte esta loja do Mercado Livre.')

  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0
  if (exp - Date.now() > 10 * 60_000) return row.access_token

  if (!row.refresh_token) {
    await db.from('ml_accounts').update({ status: 'reconnect', last_error: 'Conexão expirada.' }).eq('id', accountId)
    throw new HttpError(409, 'store_reconnect', 'A conexão com esta loja expirou. Reconecte a loja.')
  }
  const { clientId, clientSecret } = mlConfig()
  try {
    const t = await mlFetch<TokenResponse>(null, '/oauth/token', {
      method: 'POST',
      form: { grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: row.refresh_token },
    })
    await storeTokens(db, accountId, t)
    return t.access_token
  } catch (e) {
    if (e instanceof MlError && (e.status === 400 || e.status === 401)) {
      await db.from('ml_accounts').update({ status: 'reconnect', last_error: 'Autorização revogada ou expirada.' }).eq('id', accountId)
      throw new HttpError(409, 'store_reconnect', 'A autorização desta loja expirou. Reconecte a loja.')
    }
    throw e
  }
}

/** Status do anúncio no ML → status interno */
export function mapItemStatus(s: unknown): 'active' | 'paused' | 'closed' | 'under_review' | 'pending' {
  switch (s) {
    case 'active': return 'active'
    case 'paused': return 'paused'
    case 'closed': return 'closed'
    case 'under_review': case 'inactive': return 'under_review'
    default: return 'pending'
  }
}

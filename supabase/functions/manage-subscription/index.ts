// POST { action: 'cancel' } → { ok: true, access_until }
// Cancela a renovação da assinatura do próprio usuário. O acesso
// continua até o fim do período já pago (current_period_end).

import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { errorResponse, fail, HttpError, json, readJson } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/auth.ts'
import { mpFetch } from '../_shared/mercadopago.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  const cors = corsHeaders(req)
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Método não permitido.', cors)

  try {
    const user = await requireUser(req)
    const body = await readJson<{ action?: unknown }>(req)
    if (body.action !== 'cancel') throw new HttpError(400, 'invalid_action', 'Ação inválida.')

    const db = adminClient()
    const { data: sub, error } = await db.from('subscriptions')
      .select('id, status, gateway, gateway_subscription_id, current_period_end')
      .eq('user_id', user.id).in('status', ['pending', 'active', 'past_due', 'paused'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!sub) throw new HttpError(404, 'no_subscription', 'Nenhuma assinatura ativa encontrada.')

    // Vitalício (pagamento único): não há recorrência para cancelar; estorno é tratado pelo suporte
    if (String(sub.gateway_subscription_id ?? '').startsWith('payment:')) {
      throw new HttpError(400, 'contact_support', 'O plano vitalício não possui mensalidade. Para estorno, fale com o suporte.')
    }
    if (sub.gateway === 'manual') {
      throw new HttpError(400, 'contact_support', 'Este acesso foi liberado manualmente. Fale com o suporte para cancelar.')
    }

    if (sub.gateway === 'mercadopago' && sub.gateway_subscription_id) {
      // Lança 503 gateway_not_configured se MP_ACCESS_TOKEN não existir
      await mpFetch(`/preapproval/${encodeURIComponent(sub.gateway_subscription_id)}`, {
        method: 'PUT',
        body: { status: 'cancelled' },
      })
    }

    const now = new Date()
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
    const stillPaid = sub.gateway !== 'none' && sub.status !== 'pending' && periodEnd && periodEnd > now

    const { error: upErr } = await db.from('subscriptions').update({
      cancel_at_period_end: true,
      canceled_at: now.toISOString(),
      ...(stillPaid ? {} : { status: 'canceled' }),
    }).eq('id', sub.id)
    if (upErr) throw upErr

    return json(200, { ok: true, access_until: stillPaid ? periodEnd!.toISOString() : null }, cors)
  } catch (err) {
    return errorResponse(err, cors)
  }
})

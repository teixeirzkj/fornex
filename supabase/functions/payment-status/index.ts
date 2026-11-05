// POST { payment_id } → { status, status_detail }
// Usado pela tela do Pix para saber se o cliente já pagou.
// O status é consultado DIRETO na API do Mercado Pago (nunca confiamos no navegador),
// e o acesso vitalício é liberado aqui mesmo se aprovado — funciona mesmo sem webhook.

import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { errorResponse, fail, HttpError, json, readJson } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/auth.ts'
import { mpFetch } from '../_shared/mercadopago.ts'
import { applyLifetimePayment, parseLifetimeReference } from '../_shared/billing.ts'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  const cors = corsHeaders(req)
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Método não permitido.', cors)

  try {
    const user = await requireUser(req)
    const body = await readJson<{ payment_id?: unknown }>(req, 2048)
    const id = typeof body.payment_id === 'string' || typeof body.payment_id === 'number' ? String(body.payment_id) : ''
    if (!/^\d{1,20}$/.test(id)) throw new HttpError(400, 'invalid_request', 'Pagamento inválido.')

    const pay = await mpFetch<Record<string, unknown>>(`/v1/payments/${id}`)
    const ref = parseLifetimeReference(pay.external_reference)
    // Mesmo erro para "não existe" e "não é seu" (evita enumeração)
    if (!ref || ref.userId !== user.id) throw new HttpError(404, 'not_found', 'Pagamento não encontrado.')

    await applyLifetimePayment(adminClient(), pay)
    return json(200, { status: String(pay.status ?? ''), status_detail: String(pay.status_detail ?? '') }, cors)
  } catch (err) {
    if (err instanceof HttpError && err.code === 'gateway_error') return fail(404, 'not_found', 'Pagamento não encontrado.', corsHeaders(req))
    return errorResponse(err, corsHeaders(req))
  }
})

// POST — Checkout Transparente (Mercado Pago Bricks).
// Corpo: { plan_slug, idempotency_key, payment: { method: 'card'|'pix', token?, payment_method_id, issuer_id?, installments?, payer } }
//
// O navegador NUNCA define o valor: o preço vem da tabela plans.
// Dados do cartão não passam por aqui — só o token gerado pelo Brick do Mercado Pago.
//
// Vitalício (lifetime): pagamento único em /v1/payments (cartão até N parcelas ou Pix).
// Mensal (month): assinatura recorrente em /preapproval com o cartão tokenizado (só cartão).

import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { errorResponse, fail, HttpError, json, readJson } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/auth.ts'
import { addMonths, mpFetch, mpToken } from '../_shared/mercadopago.ts'
import { applyLifetimePayment, lifetimeReference, LIVE_STATUSES } from '../_shared/billing.ts'

const SLUG_RE = /^[a-z0-9-]{2,40}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,20}$/
const TOKEN_RE = /^[A-Za-z0-9-]{8,128}$/
const METHOD_RE = /^[a-z_]{2,30}$/

interface Body {
  plan_slug?: unknown
  idempotency_key?: unknown
  payment?: {
    method?: unknown; token?: unknown; payment_method_id?: unknown; issuer_id?: unknown
    installments?: unknown; payer?: { email?: unknown; identification?: { type?: unknown; number?: unknown } }
  }
}

/** Mensagens amigáveis para recusas de cartão (status_detail do MP) */
const REJECTIONS: Record<string, string> = {
  cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente.',
  cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) incorreto.',
  cc_rejected_bad_filled_date: 'Data de validade incorreta.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
  cc_rejected_call_for_authorize: 'O banco pediu autorização. Ligue para o seu banco e tente novamente.',
  cc_rejected_card_disabled: 'Cartão bloqueado. Ative-o com o seu banco.',
  cc_rejected_duplicated_payment: 'Pagamento duplicado. Você já fez um pagamento com esse valor.',
  cc_rejected_high_risk: 'Pagamento recusado por segurança. Tente outro cartão ou o Pix.',
  cc_rejected_max_attempts: 'Limite de tentativas atingido. Tente outro cartão.',
  cc_rejected_blacklist: 'Pagamento não autorizado. Tente outro cartão ou o Pix.',
  cc_rejected_other_reason: 'O banco recusou o pagamento. Tente outro cartão ou o Pix.',
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  const cors = corsHeaders(req)
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Método não permitido.', cors)

  try {
    const user = await requireUser(req)
    const body = await readJson<Body>(req, 16 * 1024)
    const p = body.payment ?? {}

    // ---------- validação do que veio do navegador ----------
    if (typeof body.plan_slug !== 'string' || !SLUG_RE.test(body.plan_slug)) throw new HttpError(400, 'invalid_plan', 'Plano inválido.')
    if (typeof body.idempotency_key !== 'string' || !UUID_RE.test(body.idempotency_key)) throw new HttpError(400, 'invalid_request', 'Requisição inválida.')
    const method = p.method === 'pix' ? 'pix' : p.method === 'card' ? 'card' : null
    if (!method) throw new HttpError(400, 'invalid_method', 'Forma de pagamento inválida.')
    if (method === 'card' && (typeof p.token !== 'string' || !TOKEN_RE.test(p.token))) throw new HttpError(400, 'invalid_card', 'Dados do cartão inválidos.')
    if (method === 'card' && (typeof p.payment_method_id !== 'string' || !METHOD_RE.test(p.payment_method_id))) throw new HttpError(400, 'invalid_card', 'Bandeira do cartão inválida.')
    const payerEmail = typeof p.payer?.email === 'string' && EMAIL_RE.test(p.payer.email) ? p.payer.email.trim().toLowerCase() : (user.email ?? '')
    const idType = typeof p.payer?.identification?.type === 'string' && /^(CPF|CNPJ)$/.test(p.payer.identification.type) ? p.payer.identification.type : null
    const idNumber = typeof p.payer?.identification?.number === 'string' ? p.payer.identification.number.replace(/\D/g, '') : ''
    const identification = idType && /^\d{11}$|^\d{14}$/.test(idNumber) ? { type: idType, number: idNumber } : undefined

    // ---------- plano e preço (somente do banco) ----------
    const db = adminClient()
    const { data: plan, error: planErr } = await db.from('plans')
      .select('id, slug, name, price_cents, interval, installments, is_active').eq('slug', body.plan_slug).maybeSingle()
    if (planErr) throw planErr
    if (!plan || !plan.is_active || plan.price_cents <= 0 || !['month', 'year', 'lifetime'].includes(plan.interval)) {
      throw new HttpError(400, 'invalid_plan', 'Plano indisponível para contratação.')
    }

    const { data: live, error: liveErr } = await db.from('subscriptions')
      .select('id, status, plan:plans(interval)').eq('user_id', user.id).in('status', ['active', 'past_due', 'paused'])
    if (liveErr) throw liveErr
    const liveRows = (live ?? []) as unknown as { id: string; plan: { interval: string } | null }[]
    if (liveRows.some((s) => s.plan?.interval === 'lifetime') || (liveRows.length > 0 && plan.interval !== 'lifetime')) {
      throw new HttpError(409, 'already_subscribed', 'Você já possui uma assinatura ativa.')
    }
    if (!mpToken()) throw new HttpError(503, 'gateway_not_configured', 'O pagamento online ainda não foi ativado.')

    const amount = plan.price_cents / 100
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

    // =========================================================
    // Vitalício: pagamento único (cartão parcelado ou Pix)
    // =========================================================
    if (plan.interval === 'lifetime') {
      const maxInst = Math.min(Math.max(plan.installments ?? 1, 1), 12)
      const installments = method === 'card' ? Math.min(Math.max(Number(p.installments) || 1, 1), maxInst) : 1
      const payment = await mpFetch<Record<string, unknown>>('/v1/payments', {
        method: 'POST',
        idempotencyKey: body.idempotency_key,
        body: {
          transaction_amount: amount,
          description: `FORNEX — Plano ${plan.name}`,
          external_reference: lifetimeReference(user.id, plan.id),
          statement_descriptor: 'FORNEX',
          notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
          metadata: { user_id: user.id, plan_id: plan.id },
          payer: { email: payerEmail, ...(identification ? { identification } : {}) },
          ...(method === 'card'
            ? { token: p.token, payment_method_id: p.payment_method_id, installments,
                ...(typeof p.issuer_id === 'string' || typeof p.issuer_id === 'number' ? { issuer_id: String(p.issuer_id) } : {}) }
            : { payment_method_id: 'pix', date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString().replace('Z', '-00:00') }),
        },
      })

      await applyLifetimePayment(db, payment) // grava pagamento; libera acesso se aprovado

      const status = String(payment.status ?? '')
      const detail = String(payment.status_detail ?? '')
      const tx = ((payment.point_of_interaction ?? {}) as Record<string, unknown>).transaction_data as Record<string, unknown> | undefined
      return json(200, {
        payment_id: String(payment.id),
        status,
        status_detail: detail,
        message: status === 'rejected' ? (REJECTIONS[detail] ?? 'Pagamento recusado. Tente outro cartão ou o Pix.') : undefined,
        pix: method === 'pix' && tx ? {
          qr_code: tx.qr_code ?? null,
          qr_code_base64: tx.qr_code_base64 ?? null,
          ticket_url: tx.ticket_url ?? null,
          expires_at: payment.date_of_expiration ?? null,
        } : undefined,
      }, cors)
    }

    // =========================================================
    // Mensal/anual: assinatura recorrente com cartão tokenizado
    // =========================================================
    if (method !== 'card') throw new HttpError(400, 'invalid_method', 'A assinatura mensal é cobrada no cartão de crédito.')

    await db.from('subscriptions').update({ status: 'canceled', canceled_at: new Date().toISOString() })
      .eq('user_id', user.id).eq('status', 'pending')
    const { data: sub, error: subErr } = await db.from('subscriptions')
      .insert({ user_id: user.id, plan_id: plan.id, status: 'pending', gateway: 'mercadopago' }).select('id').single()
    if (subErr) throw subErr

    try {
      const pre = await mpFetch<Record<string, unknown>>('/preapproval', {
        method: 'POST',
        idempotencyKey: body.idempotency_key,
        body: {
          reason: `FORNEX — Plano ${plan.name}`,
          external_reference: sub.id,
          payer_email: payerEmail,
          card_token_id: p.token,
          auto_recurring: {
            frequency: plan.interval === 'year' ? 12 : 1,
            frequency_type: 'months',
            transaction_amount: amount,
            currency_id: 'BRL',
          },
          back_url: `${(Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')}/app/assinatura`,
          status: 'authorized',
        },
      })
      const authorized = pre.status === 'authorized'
      const now = new Date()
      const next = typeof pre.next_payment_date === 'string' ? new Date(pre.next_payment_date) : null
      await db.from('subscriptions').update({
        gateway_subscription_id: String(pre.id),
        ...(authorized ? {
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: (next && next > now ? next : addMonths(now, plan.interval === 'year' ? 12 : 1)).toISOString(),
        } : {}),
      }).eq('id', sub.id)
      if (authorized) {
        await db.from('notifications').insert({ user_id: user.id, kind: 'billing', title: 'Assinatura ativada',
          body: `Seu plano ${plan.name} está ativo. A cobrança é renovada automaticamente todo mês.`, link: '/app/assinatura' })
      }
      return json(200, { subscription_id: sub.id, status: authorized ? 'approved' : String(pre.status ?? 'pending') }, cors)
    } catch (e) {
      await db.from('subscriptions').update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('id', sub.id)
      if (e instanceof HttpError && e.status === 400) {
        throw new HttpError(402, 'card_rejected', 'Não foi possível validar o cartão. Confira os dados ou use outro cartão.')
      }
      throw e
    }
  } catch (err) {
    if (err instanceof HttpError && err.code === 'gateway_error' && err.status === 400) {
      return fail(402, 'payment_rejected', 'O Mercado Pago recusou os dados do pagamento. Confira e tente novamente.', corsHeaders(req))
    }
    return errorResponse(err, corsHeaders(req))
  }
})

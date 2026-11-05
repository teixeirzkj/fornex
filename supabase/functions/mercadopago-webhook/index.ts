// Webhook do Mercado Pago (verify_jwt = false em config.toml).
// Configure no painel do MP: URL = https://<projeto>.supabase.co/functions/v1/mercadopago-webhook
// Eventos: "Planos e assinaturas" (subscription_preapproval, subscription_authorized_payment) e "Pagamentos".
// A assinatura secreta do painel vai em MP_WEBHOOK_SECRET.
//
// Status da assinatura é atualizado SOMENTE por aqui (nunca pela resposta do frontend).
// Retorna 200 para eventos tratados/ignorados e 500 para erros transitórios (MP reenvia).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient } from '../_shared/auth.ts'
import { HttpError, json } from '../_shared/http.ts'
import { hmacSha256Hex, timingSafeEqual } from '../_shared/secrets.ts'
import { addMonths, mpFetch } from '../_shared/mercadopago.ts'

type PaymentStatus = 'pending' | 'in_process' | 'approved' | 'rejected' | 'refunded' | 'canceled'

interface SubRow {
  id: string
  user_id: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
  plan: { interval: string; name: string } | null
}

const SUB_COLUMNS = 'id, user_id, status, current_period_start, current_period_end, plan:plans(interval, name)'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Valida x-signature conforme documentação do Mercado Pago. */
async function verifySignature(req: Request, dataId: string): Promise<boolean> {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET')
  if (!secret) return false
  const header = req.headers.get('x-signature') ?? ''
  const requestId = req.headers.get('x-request-id') ?? ''
  let ts = ''
  let v1 = ''
  for (const part of header.split(',')) {
    const [k, v] = part.split('=').map((s) => s?.trim())
    if (k === 'ts') ts = v ?? ''
    if (k === 'v1') v1 = v ?? ''
  }
  if (!ts || !v1) return false
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId
  let manifest = ''
  if (id) manifest += `id:${id};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`
  const expected = await hmacSha256Hex(secret, manifest)
  return timingSafeEqual(expected, v1)
}

function mapPaymentStatus(s: unknown): PaymentStatus {
  switch (s) {
    case 'approved':
    case 'authorized':
    case 'processed':
      return 'approved'
    case 'in_process':
    case 'in_mediation':
    case 'recycling':
      return 'in_process'
    case 'rejected':
      return 'rejected'
    case 'refunded':
    case 'charged_back':
      return 'refunded'
    case 'cancelled':
    case 'canceled':
      return 'canceled'
    default:
      return 'pending'
  }
}

async function findSubscription(db: SupabaseClient, externalRef: unknown, preapprovalId: unknown): Promise<SubRow | null> {
  if (typeof externalRef === 'string' && UUID_RE.test(externalRef)) {
    const { data, error } = await db.from('subscriptions').select(SUB_COLUMNS).eq('id', externalRef).maybeSingle()
    if (error) throw error
    if (data) return data as unknown as SubRow
  }
  if (typeof preapprovalId === 'string' && preapprovalId) {
    const { data, error } = await db.from('subscriptions').select(SUB_COLUMNS)
      .eq('gateway', 'mercadopago').eq('gateway_subscription_id', preapprovalId).maybeSingle()
    if (error) throw error
    if (data) return data as unknown as SubRow
  }
  return null
}

async function notify(db: SupabaseClient, userId: string, title: string, body: string) {
  await db.from('notifications').insert({ user_id: userId, kind: 'billing', title, body, link: '/app/assinatura' })
}

/** Evento de assinatura (preapproval): status geral da recorrência. */
async function handlePreapproval(db: SupabaseClient, id: string) {
  const pre = await mpFetch<Record<string, unknown>>(`/preapproval/${encodeURIComponent(id)}`)
  const sub = await findSubscription(db, pre.external_reference, pre.id)
  if (!sub) return { ignored: 'subscription_not_found' }

  const now = new Date()
  const update: Record<string, unknown> = { gateway_subscription_id: String(pre.id) }
  const nextPayment = typeof pre.next_payment_date === 'string' ? pre.next_payment_date : null

  switch (pre.status) {
    case 'authorized': {
      update.status = 'active'
      if (!sub.current_period_start) update.current_period_start = now.toISOString()
      if (nextPayment && (!sub.current_period_end || new Date(nextPayment) > new Date(sub.current_period_end))) {
        update.current_period_end = nextPayment
      }
      if (sub.status !== 'active') {
        await notify(db, sub.user_id, 'Assinatura ativada',
          `Seu plano ${sub.plan?.name ?? ''} está ativo. Bom proveito!`.replace('  ', ' '))
      }
      break
    }
    case 'paused':
      update.status = 'paused'
      break
    case 'cancelled': {
      update.cancel_at_period_end = true
      update.canceled_at = now.toISOString()
      const end = sub.current_period_end ? new Date(sub.current_period_end) : null
      if (!end || end <= now || sub.status === 'pending') update.status = 'canceled'
      break
    }
    default:
      break // pending: mantém
  }

  const { error } = await db.from('subscriptions').update(update).eq('id', sub.id)
  if (error) throw error
  return { handled: 'preapproval', status: pre.status }
}

/** Registra/atualiza um pagamento e estende o período quando aprovado (idempotente). */
async function recordPayment(db: SupabaseClient, sub: SubRow, p: {
  gatewayPaymentId: string
  amount: unknown
  status: PaymentStatus
  paidAt: string | null
}) {
  const { data: existing, error: exErr } = await db.from('payments').select('id, status')
    .eq('gateway', 'mercadopago').eq('gateway_payment_id', p.gatewayPaymentId).maybeSingle()
  if (exErr) throw exErr

  const amountCents = Math.max(0, Math.round(Number(p.amount ?? 0) * 100)) || 0
  const row = {
    user_id: sub.user_id,
    subscription_id: sub.id,
    gateway: 'mercadopago',
    gateway_payment_id: p.gatewayPaymentId,
    amount_cents: amountCents,
    currency: 'BRL',
    status: p.status,
    description: `FORNEX — ${sub.plan?.name ?? 'Assinatura'}`,
    paid_at: p.status === 'approved' ? (p.paidAt ?? new Date().toISOString()) : null,
  }
  if (existing) {
    const { error } = await db.from('payments').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await db.from('payments').insert(row)
    if (error) throw error
  }

  const newlyApproved = p.status === 'approved' && existing?.status !== 'approved'
  if (newlyApproved) {
    const now = new Date()
    const base = sub.current_period_end && new Date(sub.current_period_end) > now ? new Date(sub.current_period_end) : now
    const months = sub.plan?.interval === 'year' ? 12 : 1
    const { error } = await db.from('subscriptions').update({
      status: 'active',
      current_period_start: sub.current_period_start ?? now.toISOString(),
      current_period_end: addMonths(base, months).toISOString(),
    }).eq('id', sub.id)
    if (error) throw error
    if (sub.status !== 'active') {
      await notify(db, sub.user_id, 'Pagamento confirmado', 'Seu pagamento foi aprovado e o acesso está liberado.')
    }
  }
  if (p.status === 'rejected' && existing?.status !== 'rejected') {
    await notify(db, sub.user_id, 'Pagamento recusado',
      'Não conseguimos processar seu pagamento. Verifique o meio de pagamento no Mercado Pago.')
    if (sub.status === 'active') {
      await db.from('subscriptions').update({ status: 'past_due' }).eq('id', sub.id)
    }
  }
}

/** Cobrança recorrente de uma assinatura. */
async function handleAuthorizedPayment(db: SupabaseClient, id: string) {
  const ap = await mpFetch<Record<string, unknown>>(`/authorized_payments/${encodeURIComponent(id)}`)
  const sub = await findSubscription(db, ap.external_reference, ap.preapproval_id)
  if (!sub) return { ignored: 'subscription_not_found' }
  const payment = (ap.payment ?? {}) as Record<string, unknown>
  await recordPayment(db, sub, {
    gatewayPaymentId: String(payment.id ?? ap.id),
    amount: ap.transaction_amount,
    status: mapPaymentStatus(payment.status ?? ap.status),
    paidAt: typeof ap.debit_date === 'string' ? ap.debit_date : null,
  })
  return { handled: 'authorized_payment' }
}

/**
 * Plano vitalício (pagamento único, external_reference = lifetime:<user_id>:<plan_id>).
 * Aprovado → cria assinatura vitalícia (sem vencimento) e encerra a mensal, se houver.
 * Estornado/chargeback → revoga o acesso vitalício.
 */
async function handleLifetimePayment(db: SupabaseClient, pay: Record<string, unknown>, ref: string) {
  const [, userId, planId] = ref.split(':')
  if (!UUID_RE.test(userId ?? '') || !UUID_RE.test(planId ?? '')) return { ignored: 'invalid_reference' }

  const { data: plan, error: planErr } = await db.from('plans')
    .select('id, name, price_cents, interval').eq('id', planId).maybeSingle()
  if (planErr) throw planErr
  if (!plan || plan.interval !== 'lifetime') return { ignored: 'plan_not_lifetime' }

  const status = mapPaymentStatus(pay.status)
  const gatewayPaymentId = String(pay.id)
  const amountCents = Math.max(0, Math.round(Number(pay.transaction_amount ?? 0) * 100)) || 0
  // Defesa extra: o valor pago precisa cobrir o preço do plano no banco
  if (status === 'approved' && amountCents + 1 < plan.price_cents) {
    console.error('pagamento vitalício abaixo do preço', gatewayPaymentId, amountCents, plan.price_cents)
    return { ignored: 'amount_mismatch' }
  }

  const { data: existing, error: exErr } = await db.from('payments').select('id, status, subscription_id')
    .eq('gateway', 'mercadopago').eq('gateway_payment_id', gatewayPaymentId).maybeSingle()
  if (exErr) throw exErr

  let subscriptionId: string | null = existing?.subscription_id ?? null
  const now = new Date().toISOString()

  if (status === 'approved' && existing?.status !== 'approved') {
    // Encerra assinaturas vivas (ex.: Básico mensal) — inclusive a recorrência no Mercado Pago
    const { data: live, error: liveErr } = await db.from('subscriptions')
      .select('id, gateway, gateway_subscription_id').eq('user_id', userId)
      .in('status', ['pending', 'active', 'past_due', 'paused'])
    if (liveErr) throw liveErr
    for (const s of live ?? []) {
      if (s.gateway === 'mercadopago' && s.gateway_subscription_id && !String(s.gateway_subscription_id).startsWith('payment:')) {
        try {
          await mpFetch(`/preapproval/${encodeURIComponent(s.gateway_subscription_id)}`, { method: 'PUT', body: { status: 'cancelled' } })
        } catch (e) {
          console.error('falha ao cancelar recorrência no MP', s.gateway_subscription_id, e)
        }
      }
      const { error } = await db.from('subscriptions').update({ status: 'canceled', canceled_at: now }).eq('id', s.id)
      if (error) throw error
    }

    const { data: sub, error: subErr } = await db.from('subscriptions').insert({
      user_id: userId, plan_id: plan.id, status: 'active', gateway: 'mercadopago',
      gateway_subscription_id: `payment:${gatewayPaymentId}`,
      current_period_start: now, current_period_end: null,
    }).select('id').single()
    if (subErr) throw subErr
    subscriptionId = sub.id
    await notify(db, userId, 'Acesso vitalício liberado', `Pagamento aprovado! Seu plano ${plan.name} está ativo para sempre.`)
  }

  if ((status === 'refunded' || status === 'canceled') && existing?.status === 'approved' && subscriptionId) {
    await db.from('subscriptions').update({ status: 'canceled', canceled_at: now }).eq('id', subscriptionId)
    await notify(db, userId, 'Acesso vitalício encerrado', 'O pagamento do plano vitalício foi estornado e o acesso foi encerrado.')
  }
  if (status === 'rejected' && existing?.status !== 'rejected') {
    await notify(db, userId, 'Pagamento recusado', 'Não conseguimos aprovar o pagamento do plano vitalício. Tente outro cartão.')
  }

  const row = {
    user_id: userId, subscription_id: subscriptionId, gateway: 'mercadopago', gateway_payment_id: gatewayPaymentId,
    amount_cents: amountCents, currency: 'BRL', status,
    description: `FORNEX — Plano ${plan.name}${Number(pay.installments) > 1 ? ` (${pay.installments}x)` : ''}`,
    paid_at: status === 'approved' ? (typeof pay.date_approved === 'string' ? pay.date_approved : now) : null,
  }
  const { error } = existing
    ? await db.from('payments').update(row).eq('id', existing.id)
    : await db.from('payments').insert(row)
  if (error) throw error
  return { handled: 'lifetime_payment', status }
}

/** Pagamento avulso: vitalício ou ligado a uma assinatura. */
async function handlePayment(db: SupabaseClient, id: string) {
  const pay = await mpFetch<Record<string, unknown>>(`/v1/payments/${encodeURIComponent(id)}`)
  if (typeof pay.external_reference === 'string' && pay.external_reference.startsWith('lifetime:')) {
    return handleLifetimePayment(db, pay, pay.external_reference)
  }
  const meta = (pay.metadata ?? {}) as Record<string, unknown>
  const sub = await findSubscription(db, pay.external_reference, meta.preapproval_id ?? meta.subscription_id)
  if (!sub) return { ignored: 'not_linked_to_subscription' }
  await recordPayment(db, sub, {
    gatewayPaymentId: String(pay.id),
    amount: pay.transaction_amount,
    status: mapPaymentStatus(pay.status),
    paidAt: typeof pay.date_approved === 'string' ? pay.date_approved : null,
  })
  return { handled: 'payment' }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const url = new URL(req.url)
  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    if (text.length > 64 * 1024) return json(413, { error: 'payload_too_large' })
    body = text ? JSON.parse(text) : {}
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const data = (body.data ?? {}) as Record<string, unknown>
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? String(data.id ?? '')
  const topic = String(body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '')

  if (!(await verifySignature(req, dataId))) {
    return json(401, { error: 'invalid_signature' })
  }
  if (!dataId || !/^[\w-]{1,64}$/.test(dataId)) return json(200, { ignored: 'missing_id' })

  const db = adminClient()
  try {
    let result: unknown
    switch (topic) {
      case 'subscription_preapproval':
      case 'preapproval':
        result = await handlePreapproval(db, dataId)
        break
      case 'subscription_authorized_payment':
      case 'authorized_payment':
        result = await handleAuthorizedPayment(db, dataId)
        break
      case 'payment':
        result = await handlePayment(db, dataId)
        break
      default:
        result = { ignored: topic || 'unknown_topic' }
    }
    return json(200, result)
  } catch (err) {
    // 4xx do MP (ex.: recurso inexistente) não adianta reenviar
    if (err instanceof HttpError && err.status === 400) {
      console.error('webhook ignorado', topic, dataId, err.message)
      return json(200, { ignored: 'gateway_rejected' })
    }
    console.error('webhook falhou', topic, dataId, err)
    return json(500, { error: 'processing_failed' })
  }
})

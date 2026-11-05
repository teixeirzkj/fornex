// Regras de cobrança compartilhadas entre process-payment, payment-status e mercadopago-webhook.
// Tudo aqui é idempotente: pode ser chamado várias vezes para o mesmo pagamento.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { mpFetch } from './mercadopago.ts'

export type PaymentStatus = 'pending' | 'in_process' | 'approved' | 'rejected' | 'refunded' | 'canceled'

export const LIVE_STATUSES = ['pending', 'active', 'past_due', 'paused']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function mapPaymentStatus(s: unknown): PaymentStatus {
  switch (s) {
    case 'approved': case 'authorized': case 'processed': return 'approved'
    case 'in_process': case 'in_mediation': case 'recycling': return 'in_process'
    case 'rejected': return 'rejected'
    case 'refunded': case 'charged_back': return 'refunded'
    case 'cancelled': case 'canceled': return 'canceled'
    default: return 'pending'
  }
}

/** external_reference dos pagamentos vitalícios: lifetime:<user_id>:<plan_id> */
export function lifetimeReference(userId: string, planId: string) {
  return `lifetime:${userId}:${planId}`
}

export function parseLifetimeReference(ref: unknown): { userId: string; planId: string } | null {
  if (typeof ref !== 'string' || !ref.startsWith('lifetime:')) return null
  const [, userId, planId] = ref.split(':')
  if (!UUID_RE.test(userId ?? '') || !UUID_RE.test(planId ?? '')) return null
  return { userId, planId }
}

export async function notify(db: SupabaseClient, userId: string, title: string, body: string) {
  await db.from('notifications').insert({ user_id: userId, kind: 'billing', title, body, link: '/app/assinatura' })
}

/** Encerra assinaturas vivas do usuário (inclusive a recorrência no Mercado Pago). */
export async function cancelLiveSubscriptions(db: SupabaseClient, userId: string, exceptId?: string) {
  const now = new Date().toISOString()
  const { data, error } = await db.from('subscriptions')
    .select('id, gateway, gateway_subscription_id').eq('user_id', userId).in('status', LIVE_STATUSES)
  if (error) throw error
  for (const s of data ?? []) {
    if (s.id === exceptId) continue
    const gid = String(s.gateway_subscription_id ?? '')
    if (s.gateway === 'mercadopago' && gid && !gid.startsWith('payment:')) {
      try {
        await mpFetch(`/preapproval/${encodeURIComponent(gid)}`, { method: 'PUT', body: { status: 'cancelled' } })
      } catch (e) {
        console.error('falha ao cancelar recorrência no MP', gid, e)
      }
    }
    const { error: upErr } = await db.from('subscriptions').update({ status: 'canceled', canceled_at: now }).eq('id', s.id)
    if (upErr) throw upErr
  }
}

/**
 * Aplica um pagamento do plano vitalício (vindo da API do MP, nunca do navegador).
 * Aprovado → cria a assinatura vitalícia e encerra a mensal. Estorno → revoga.
 */
export async function applyLifetimePayment(db: SupabaseClient, pay: Record<string, unknown>) {
  const ref = parseLifetimeReference(pay.external_reference)
  if (!ref) return { ignored: 'invalid_reference' as const }
  const { userId, planId } = ref

  const { data: plan, error: planErr } = await db.from('plans')
    .select('id, name, price_cents, interval').eq('id', planId).maybeSingle()
  if (planErr) throw planErr
  if (!plan || plan.interval !== 'lifetime') return { ignored: 'plan_not_lifetime' as const }

  const status = mapPaymentStatus(pay.status)
  const gatewayPaymentId = String(pay.id)
  const amountCents = Math.max(0, Math.round(Number(pay.transaction_amount ?? 0) * 100)) || 0
  // Defesa extra: o valor pago precisa cobrir o preço do plano no banco
  if (status === 'approved' && amountCents + 1 < plan.price_cents) {
    console.error('pagamento vitalício abaixo do preço', gatewayPaymentId, amountCents, plan.price_cents)
    return { ignored: 'amount_mismatch' as const }
  }

  const { data: existing, error: exErr } = await db.from('payments').select('id, status, subscription_id')
    .eq('gateway', 'mercadopago').eq('gateway_payment_id', gatewayPaymentId).maybeSingle()
  if (exErr) throw exErr

  let subscriptionId: string | null = existing?.subscription_id ?? null
  const now = new Date().toISOString()

  if (status === 'approved' && existing?.status !== 'approved') {
    await cancelLiveSubscriptions(db, userId)
    const { data: sub, error: subErr } = await db.from('subscriptions').insert({
      user_id: userId, plan_id: plan.id, status: 'active', gateway: 'mercadopago',
      gateway_subscription_id: `payment:${gatewayPaymentId}`,
      current_period_start: now, current_period_end: null,
    }).select('id').single()
    if (subErr) {
      // Corrida entre webhook e confirmação na página: a outra chamada já liberou
      if (String(subErr.code) === '23505') {
        const { data: again } = await db.from('subscriptions').select('id')
          .eq('gateway', 'mercadopago').eq('gateway_subscription_id', `payment:${gatewayPaymentId}`).maybeSingle()
        subscriptionId = again?.id ?? null
      } else throw subErr
    } else {
      subscriptionId = sub.id
      await notify(db, userId, 'Acesso vitalício liberado', `Pagamento aprovado! Seu plano ${plan.name} está ativo para sempre.`)
    }
  }

  if ((status === 'refunded' || status === 'canceled') && existing?.status === 'approved' && subscriptionId) {
    await db.from('subscriptions').update({ status: 'canceled', canceled_at: now }).eq('id', subscriptionId)
    await notify(db, userId, 'Acesso vitalício encerrado', 'O pagamento do plano vitalício foi estornado e o acesso foi encerrado.')
  }
  if (status === 'rejected' && existing?.status !== 'rejected') {
    await notify(db, userId, 'Pagamento recusado', 'Não conseguimos aprovar o pagamento do plano vitalício. Tente outro cartão ou o Pix.')
  }

  const installments = Number(pay.installments) || 1
  const row = {
    user_id: userId, subscription_id: subscriptionId, gateway: 'mercadopago', gateway_payment_id: gatewayPaymentId,
    amount_cents: amountCents, currency: 'BRL', status,
    description: `FORNEX — Plano ${plan.name}${installments > 1 ? ` (${installments}x)` : ''}${pay.payment_method_id === 'pix' ? ' via Pix' : ''}`,
    paid_at: status === 'approved' ? (typeof pay.date_approved === 'string' ? pay.date_approved : now) : null,
  }
  const { error } = existing
    ? await db.from('payments').update(row).eq('id', existing.id)
    : await db.from('payments').insert(row)
  if (error && String(error.code) !== '23505') throw error
  return { handled: 'lifetime_payment' as const, status, userId }
}

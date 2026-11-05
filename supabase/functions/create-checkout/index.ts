// POST { plan_slug } → { init_point }
// Mensal/anual: assinatura recorrente (preapproval) no Mercado Pago.
// Vitalício: pagamento único parcelável (Checkout Pro / preference).
// O PREÇO é sempre lido do banco — o navegador só informa o slug do plano.

import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { errorResponse, fail, HttpError, json, readJson } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/auth.ts'
import { mpFetch, mpToken } from '../_shared/mercadopago.ts'

const SLUG_RE = /^[a-z0-9-]{2,40}$/

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  const cors = corsHeaders(req)
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Método não permitido.', cors)

  try {
    const user = await requireUser(req)
    const body = await readJson<{ plan_slug?: unknown }>(req)
    if (typeof body.plan_slug !== 'string' || !SLUG_RE.test(body.plan_slug)) {
      throw new HttpError(400, 'invalid_plan', 'Plano inválido.')
    }

    const db = adminClient()
    const { data: plan, error: planErr } = await db.from('plans')
      .select('id, slug, name, price_cents, interval, installments, is_active')
      .eq('slug', body.plan_slug).maybeSingle()
    if (planErr) throw planErr
    if (!plan || !plan.is_active || plan.interval === 'free' || plan.price_cents <= 0) {
      throw new HttpError(400, 'invalid_plan', 'Plano indisponível para contratação online.')
    }

    const { data: live, error: liveErr } = await db.from('subscriptions')
      .select('id, plan:plans(interval)').eq('user_id', user.id).in('status', ['active', 'past_due', 'paused'])
    if (liveErr) throw liveErr
    const liveRows = (live ?? []) as unknown as { id: string; plan: { interval: string } | null }[]
    const hasLifetime = liveRows.some((s) => s.plan?.interval === 'lifetime')
    // Upgrade Básico → Vitalício é permitido; qualquer outra combinação com assinatura viva, não.
    if (hasLifetime || (liveRows.length > 0 && plan.interval !== 'lifetime')) {
      throw new HttpError(409, 'already_subscribed', 'Você já possui uma assinatura ativa.')
    }

    if (!mpToken()) {
      throw new HttpError(503, 'gateway_not_configured',
        'O pagamento online ainda não foi ativado. Configure MP_ACCESS_TOKEN nas secrets do Supabase ou fale com o suporte.')
    }

    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')
    if (!appUrl.startsWith('https://') && !appUrl.startsWith('http://localhost')) {
      throw new HttpError(503, 'gateway_not_configured', 'APP_URL não configurada nas secrets do Supabase.')
    }
    const returnUrl = `${appUrl}/app/assinatura?checkout=retorno`

    // ---------------------------------------------------------------
    // Vitalício: pagamento ÚNICO (Checkout Pro), parcelável no cartão.
    // Não cria assinatura agora — o webhook "payment" cria a assinatura
    // vitalícia somente quando o pagamento for APROVADO.
    // external_reference = lifetime:<user_id>:<plan_id>
    // ---------------------------------------------------------------
    if (plan.interval === 'lifetime') {
      try {
        const pref = await mpFetch<{ id: string; init_point: string }>('/checkout/preferences', {
          method: 'POST',
          idempotencyKey: crypto.randomUUID(),
          body: {
            items: [{
              id: plan.slug,
              title: `FORNEX — Plano ${plan.name}`,
              quantity: 1,
              unit_price: plan.price_cents / 100,
              currency_id: 'BRL',
            }],
            payer: { email: user.email },
            external_reference: `lifetime:${user.id}:${plan.id}`,
            metadata: { user_id: user.id, plan_id: plan.id },
            payment_methods: { installments: Math.min(Math.max(plan.installments ?? 1, 1), 12) },
            back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
            auto_return: 'approved',
            statement_descriptor: 'FORNEX',
          },
        })
        if (!pref.init_point) throw new HttpError(502, 'gateway_error', 'Resposta inválida do Mercado Pago.')
        return json(200, { init_point: pref.init_point }, cors)
      } catch (e) {
        if (e instanceof HttpError) throw new HttpError(502, 'gateway_error', e.message)
        throw new HttpError(502, 'gateway_error', 'Não foi possível iniciar o pagamento. Tente novamente.')
      }
    }

    // Descarta checkouts pendentes abandonados (índice único permite só uma assinatura "viva")
    await db.from('subscriptions').update({ status: 'canceled', canceled_at: new Date().toISOString() })
      .eq('user_id', user.id).eq('status', 'pending')

    const { data: sub, error: subErr } = await db.from('subscriptions')
      .insert({ user_id: user.id, plan_id: plan.id, status: 'pending', gateway: 'mercadopago' })
      .select('id').single()
    if (subErr) throw subErr

    try {
      const preapproval = await mpFetch<{ id: string; init_point: string }>('/preapproval', {
        method: 'POST',
        idempotencyKey: sub.id,
        body: {
          reason: `FORNEX — ${plan.name}`,
          external_reference: sub.id,
          payer_email: user.email,
          auto_recurring: {
            frequency: plan.interval === 'year' ? 12 : 1,
            frequency_type: 'months',
            transaction_amount: plan.price_cents / 100,
            currency_id: 'BRL',
          },
          back_url: returnUrl,
          status: 'pending',
        },
      })
      if (!preapproval.id || !preapproval.init_point) throw new HttpError(502, 'gateway_error', 'Resposta inválida do Mercado Pago.')

      await db.from('subscriptions').update({ gateway_subscription_id: preapproval.id }).eq('id', sub.id)
      return json(200, { init_point: preapproval.init_point }, cors)
    } catch (e) {
      await db.from('subscriptions').update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('id', sub.id)
      if (e instanceof HttpError) throw new HttpError(502, 'gateway_error', e.message)
      throw new HttpError(502, 'gateway_error', 'Não foi possível iniciar o pagamento. Tente novamente.')
    }
  } catch (err) {
    return errorResponse(err, cors)
  }
})

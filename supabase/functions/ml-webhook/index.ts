// Notificações do Mercado Livre (verify_jwt = false). Tópicos: items, orders_v2.
// O ML não assina as notificações; por isso NUNCA confiamos no corpo:
// sempre buscamos o recurso na API do ML com o token da loja correspondente.
// Responde 200 rapidamente (o ML reenvia notificações sem resposta 200).

import { adminClient } from '../_shared/auth.ts'
import { json } from '../_shared/http.ts'
import { getAccessToken, itemReason, mapItemStatus, mlFetch } from '../_shared/mercadolivre.ts'
import { formatBRLServer } from './format.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    if (text.length > 16 * 1024) return json(200, { ignored: 'too_large' })
    body = text ? JSON.parse(text) : {}
  } catch { return json(200, { ignored: 'invalid_json' }) }

  const topic = String(body.topic ?? '')
  const resource = String(body.resource ?? '')
  const mlUserId = Number(body.user_id)
  if (!Number.isFinite(mlUserId) || !/^\/(items\/MLB\d{1,20}|orders\/\d{1,20})$/.test(resource)) return json(200, { ignored: 'unknown_resource' })

  const db = adminClient()
  try {
    const { data: accounts } = await db.from('ml_accounts').select('id, user_id').eq('ml_user_id', mlUserId).eq('status', 'active')
    if (!accounts?.length) return json(200, { ignored: 'unknown_account' })

    for (const acc of accounts) {
      const token = await getAccessToken(db, acc.id)

      if (topic === 'items') {
        const itemId = resource.split('/')[2]
        const { data: listing } = await db.from('ml_listings').select('id').eq('ml_account_id', acc.id).eq('ml_item_id', itemId).maybeSingle()
        if (!listing) continue
        const item = await mlFetch<Record<string, unknown>>(token, `/items/${itemId}`)
        await db.from('ml_listings').update({
          status: mapItemStatus(item.status),
          last_error: itemReason(item),
          available_quantity: Number(item.available_quantity ?? 0),
          price_cents: Math.round(Number(item.price ?? 0) * 100) || undefined,
          permalink: typeof item.permalink === 'string' ? item.permalink : undefined,
          last_synced_at: new Date().toISOString(),
        }).eq('id', listing.id)
      }

      if (topic === 'orders_v2' || topic === 'orders') {
        const order = await mlFetch<Record<string, unknown>>(token, resource)
        const items = (order.order_items ?? []) as { item?: { id?: string; title?: string }; quantity?: number; unit_price?: number }[]
        for (const oi of items) {
          const itemId = oi.item?.id
          if (!itemId) continue
          const { data: listing } = await db.from('ml_listings').select('id, title').eq('ml_account_id', acc.id).eq('ml_item_id', itemId).maybeSingle()
          if (!listing) continue
          // Notificação única por pedido + item
          const title = `Venda no Mercado Livre: ${listing.title}`.slice(0, 140)
          const { data: already } = await db.from('notifications').select('id').eq('user_id', acc.user_id)
            .eq('title', title).ilike('body', `%pedido ${order.id}%`).maybeSingle()
          if (already) continue
          await db.from('notifications').insert({
            user_id: acc.user_id, kind: 'system', title,
            body: `${oi.quantity ?? 1} un. por ${formatBRLServer(Number(oi.unit_price ?? 0))} (pedido ${order.id}). Faça o pedido com o fornecedor para enviar ao comprador.`,
            link: '/app/anuncios',
          })
        }
      }
    }
    return json(200, { ok: true })
  } catch (err) {
    console.error('ml-webhook', topic, resource, err)
    return json(200, { ok: false })
  }
})

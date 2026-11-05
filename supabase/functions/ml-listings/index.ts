// Anúncios no Mercado Livre a partir dos produtos dos fornecedores.
// POST { action: 'publish', account_id, supplier_product_id, markup_percent, listing_type, title? }
// POST { action: 'pause' | 'activate' | 'close' | 'sync', listing_id }

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { errorResponse, fail, HttpError, json, readJson, UUID_RE } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/auth.ts'
import { getAccessToken, mapItemStatus, MlError, mlFetch } from '../_shared/mercadolivre.ts'

const LISTING_COLUMNS = 'id, ml_account_id, supplier_product_id, ml_item_id, permalink, title, price_cents, markup_percent, listing_type, available_quantity, status, last_error, last_synced_at, created_at'

function mlErrorToHttp(e: unknown): never {
  if (e instanceof MlError) {
    const detail = e.causes.length ? e.causes.slice(0, 4).join(' · ') : e.message
    throw new HttpError(422, 'ml_rejected', `O Mercado Livre recusou: ${detail}`)
  }
  throw e
}

const priceWithMarkup = (cents: number, markup: number) => Math.max(100, Math.round(cents * (1 + markup / 100)))

/** Produto visto COM AS PERMISSÕES DO CLIENTE (RLS garante que o plano dá acesso ao fornecedor) */
async function productAsUser(req: Request, productId: string) {
  const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data } = await userDb.from('supplier_products')
    .select('id, supplier_id, name, sku, description, price_cents, stock, image_url, is_active, supplier:suppliers(name)')
    .eq('id', productId).maybeSingle()
  return data as unknown as {
    id: string; supplier_id: string; name: string; sku: string | null; description: string | null
    price_cents: number | null; stock: number | null; image_url: string | null; is_active: boolean; supplier: { name: string } | null
  } | null
}

async function ownedListing(db: SupabaseClient, listingId: unknown, userId: string) {
  if (typeof listingId !== 'string' || !UUID_RE.test(listingId)) throw new HttpError(400, 'invalid_request', 'Anúncio inválido.')
  const { data } = await db.from('ml_listings').select(LISTING_COLUMNS).eq('id', listingId).eq('user_id', userId).maybeSingle()
  if (!data) throw new HttpError(404, 'not_found', 'Anúncio não encontrado.')
  return data
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  const cors = corsHeaders(req)
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Método não permitido.', cors)

  try {
    const user = await requireUser(req)
    const body = await readJson<Record<string, unknown>>(req, 8192)
    const db = adminClient()

    // ============================================================ publicar
    if (body.action === 'publish') {
      const accountId = typeof body.account_id === 'string' && UUID_RE.test(body.account_id) ? body.account_id : null
      const productId = typeof body.supplier_product_id === 'string' && UUID_RE.test(body.supplier_product_id) ? body.supplier_product_id : null
      const markup = Number(body.markup_percent)
      const listingType = body.listing_type === 'gold_pro' ? 'gold_pro' : 'gold_special'
      if (!accountId || !productId) throw new HttpError(400, 'invalid_request', 'Dados inválidos.')
      if (!Number.isFinite(markup) || markup < 0 || markup > 1000) throw new HttpError(400, 'invalid_markup', 'Margem inválida (0% a 1000%).')

      const { data: acc } = await db.from('ml_accounts').select('id, status').eq('id', accountId).eq('user_id', user.id).maybeSingle()
      if (!acc) throw new HttpError(404, 'not_found', 'Loja não encontrada.')
      if (acc.status !== 'active') throw new HttpError(409, 'store_reconnect', 'Reconecte esta loja antes de publicar.')

      const product = await productAsUser(req, productId)
      if (!product || !product.is_active) throw new HttpError(404, 'not_found', 'Produto indisponível no seu plano.')
      if (!product.price_cents) throw new HttpError(422, 'missing_price', 'Este produto não tem preço do fornecedor cadastrado.')
      if (!product.stock || product.stock <= 0) throw new HttpError(422, 'no_stock', 'Este produto está sem estoque no fornecedor.')
      if (!product.image_url) throw new HttpError(422, 'missing_image', 'O Mercado Livre exige ao menos uma foto. Este produto ainda não tem imagem.')

      const { data: dup } = await db.from('ml_listings').select('id, status').eq('ml_account_id', accountId).eq('supplier_product_id', productId).maybeSingle()
      if (dup && dup.status !== 'closed' && dup.status !== 'error') throw new HttpError(409, 'already_published', 'Este produto já está publicado nesta loja.')

      const rawTitle = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : product.name
      const title = rawTitle.replace(/\s+/g, ' ').slice(0, 60)
      const price = priceWithMarkup(product.price_cents, markup)
      const quantity = Math.min(product.stock, 999)
      const token = await getAccessToken(db, accountId)

      // Categoria sugerida pelo próprio Mercado Livre a partir do título
      let categoryId: string | null = null
      try {
        const pred = await mlFetch<{ category_id: string }[]>(token, `/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(title)}`)
        categoryId = Array.isArray(pred) && pred[0]?.category_id ? pred[0].category_id : null
      } catch { /* sem sugestão */ }
      if (!categoryId) throw new HttpError(422, 'no_category', 'O Mercado Livre não encontrou uma categoria para este título. Ajuste o título e tente de novo.')

      let item: Record<string, unknown>
      try {
        item = await mlFetch(token, '/items', {
          method: 'POST',
          body: {
            title,
            category_id: categoryId,
            price: price / 100,
            currency_id: 'BRL',
            available_quantity: quantity,
            buying_mode: 'buy_it_now',
            condition: 'new',
            listing_type_id: listingType,
            pictures: [{ source: product.image_url }],
            attributes: [
              { id: 'BRAND', value_name: (product.supplier?.name ?? 'Genérica').replace(/\s*\(Demo\)\s*$/i, '').slice(0, 60) },
              { id: 'MODEL', value_name: (product.sku || product.name).slice(0, 60) },
              ...(product.sku ? [{ id: 'SELLER_SKU', value_name: product.sku.slice(0, 60) }] : []),
            ],
          },
        })
      } catch (e) {
        await db.from('ml_listings').upsert({
          user_id: user.id, ml_account_id: accountId, supplier_product_id: productId, title, price_cents: price,
          markup_percent: markup, listing_type: listingType, available_quantity: quantity, status: 'error',
          last_error: e instanceof MlError ? (e.causes.join(' · ') || e.message).slice(0, 500) : 'Erro ao publicar',
        }, { onConflict: 'ml_account_id,supplier_product_id' })
        mlErrorToHttp(e)
      }

      if (product.description) {
        try {
          await mlFetch(token, `/items/${item.id}/description`, { method: 'POST', body: { plain_text: product.description.slice(0, 5000) } })
        } catch (e) { console.error('descrição não enviada', item.id, e) }
      }

      const { data: listing, error } = await db.from('ml_listings').upsert({
        user_id: user.id, ml_account_id: accountId, supplier_product_id: productId, ml_item_id: String(item.id),
        permalink: typeof item.permalink === 'string' ? item.permalink : null, title, price_cents: price,
        markup_percent: markup, listing_type: listingType, available_quantity: quantity,
        status: mapItemStatus(item.status), last_error: null, last_synced_at: new Date().toISOString(),
      }, { onConflict: 'ml_account_id,supplier_product_id' }).select(LISTING_COLUMNS).single()
      if (error) throw error
      return json(200, { listing }, cors)
    }

    // ============================================== pausar / ativar / encerrar
    if (body.action === 'pause' || body.action === 'activate' || body.action === 'close') {
      const listing = await ownedListing(db, body.listing_id, user.id)
      if (!listing.ml_item_id) throw new HttpError(409, 'not_published', 'Este anúncio não foi publicado.')
      const token = await getAccessToken(db, listing.ml_account_id)
      const status = body.action === 'pause' ? 'paused' : body.action === 'activate' ? 'active' : 'closed'
      try {
        const item = await mlFetch<Record<string, unknown>>(token, `/items/${listing.ml_item_id}`, { method: 'PUT', body: { status } })
        const { data } = await db.from('ml_listings').update({ status: mapItemStatus(item.status ?? status), last_error: null, last_synced_at: new Date().toISOString() })
          .eq('id', listing.id).select(LISTING_COLUMNS).single()
        return json(200, { listing: data }, cors)
      } catch (e) { mlErrorToHttp(e) }
    }

    // ========================== sincronizar preço/estoque com o fornecedor
    if (body.action === 'sync') {
      const listing = await ownedListing(db, body.listing_id, user.id)
      if (!listing.ml_item_id) throw new HttpError(409, 'not_published', 'Este anúncio não foi publicado.')
      const { data: product } = await db.from('supplier_products').select('price_cents, stock, is_active')
        .eq('id', listing.supplier_product_id ?? '').maybeSingle()
      const token = await getAccessToken(db, listing.ml_account_id)
      const update: Record<string, unknown> = {}
      if (product?.price_cents) update.price = priceWithMarkup(product.price_cents, Number(listing.markup_percent)) / 100
      const stock = product?.is_active ? Math.max(0, Math.min(product?.stock ?? 0, 999)) : 0
      update.available_quantity = stock
      if (stock === 0 && listing.status === 'active') update.status = 'paused'
      try {
        const item = await mlFetch<Record<string, unknown>>(token, `/items/${listing.ml_item_id}`, { method: 'PUT', body: update })
        const { data } = await db.from('ml_listings').update({
          price_cents: update.price ? Math.round(Number(update.price) * 100) : listing.price_cents,
          available_quantity: stock, status: mapItemStatus(item.status), last_error: null,
          permalink: typeof item.permalink === 'string' ? item.permalink : listing.permalink, last_synced_at: new Date().toISOString(),
        }).eq('id', listing.id).select(LISTING_COLUMNS).single()
        return json(200, { listing: data }, cors)
      } catch (e) { mlErrorToHttp(e) }
    }

    throw new HttpError(400, 'invalid_action', 'Ação inválida.')
  } catch (err) {
    return errorResponse(err, corsHeaders(req))
  }
})

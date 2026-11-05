// Webhook para fornecedores enviarem produtos (verify_jwt = false em config.toml).
//
// POST https://<projeto>.supabase.co/functions/v1/integration-webhook?integration_id=<uuid>
// Header:  x-webhook-secret: <valor da secret indicada em config.secret_env>
// Corpo:   { "products": [ {...}, ... ], "deleted": ["external_id", ...] }   ou   [ {...}, ... ]
// Resposta { ok, upserted, skipped, deactivated }

import { adminClient } from '../_shared/auth.ts'
import { errorResponse, fail, HttpError, json, readJson, UUID_RE } from '../_shared/http.ts'
import { readSupplierSecret, timingSafeEqual } from '../_shared/secrets.ts'
import { getPath, mapProduct, type MappedProduct, upsertProducts } from '../_shared/mapping.ts'
import { INTEGRATION_COLUMNS, type IntegrationRow, logIntegration } from '../_shared/integrations.ts'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_ITEMS = 5_000

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Método não permitido.')

  try {
    const id = new URL(req.url).searchParams.get('integration_id') ?? ''
    if (!UUID_RE.test(id)) throw new HttpError(400, 'invalid_request', 'integration_id inválido.')

    const db = adminClient()
    const { data, error } = await db.from('integrations').select(INTEGRATION_COLUMNS).eq('id', id).maybeSingle()
    if (error) throw error
    // Resposta genérica para não revelar quais IDs existem
    if (!data || data.type !== 'webhook') throw new HttpError(401, 'unauthorized', 'Credenciais inválidas.')
    const integration = data as IntegrationRow
    const base = { integration_id: integration.id, supplier_id: integration.supplier_id }

    const expected = readSupplierSecret(integration.config?.secret_env)
    const provided = req.headers.get('x-webhook-secret') ?? ''
    if (!expected || !provided || !timingSafeEqual(provided, expected)) {
      await logIntegration(db, {
        ...base, level: 'warn', event: 'webhook',
        message: expected ? 'Requisição recusada: segredo inválido.' : 'Requisição recusada: secret_env não configurada.',
      })
      throw new HttpError(401, 'unauthorized', 'Credenciais inválidas.')
    }
    if (integration.status !== 'active') {
      throw new HttpError(403, 'integration_inactive', 'Integração não está ativa.')
    }

    const body = await readJson<unknown>(req, MAX_BYTES)
    const obj = (Array.isArray(body) ? { products: body } : (body ?? {})) as { products?: unknown; deleted?: unknown }
    // Lista de produtos: config.items_path (ex.: "data.items"); padrão "products"
    const itemsPath = typeof integration.config?.items_path === 'string' && integration.config.items_path.trim()
      ? integration.config.items_path.trim() : 'products'
    const listed = Array.isArray(body) ? body : getPath(obj, itemsPath)
    const rawProducts = Array.isArray(listed) ? listed : []
    const deleted = Array.isArray(obj.deleted)
      ? obj.deleted.filter((d): d is string => typeof d === 'string' && d.length > 0 && d.length <= 200)
      : []
    if (rawProducts.length > MAX_ITEMS || deleted.length > MAX_ITEMS) {
      throw new HttpError(413, 'payload_too_large', `Envie no máximo ${MAX_ITEMS} itens por requisição.`)
    }

    const cfg = integration.config ?? {}
    const priceUnit = cfg.price_unit === 'cents' ? 'cents' : 'reais'
    const fieldMap = (cfg.field_map && typeof cfg.field_map === 'object' ? cfg.field_map : {}) as Record<string, string>

    const mapped: MappedProduct[] = []
    let invalid = 0
    for (const raw of rawProducts) {
      const p = mapProduct(raw, fieldMap, priceUnit)
      if (p) mapped.push(p)
      else invalid++
    }

    const { upserted, skipped, errors } = await upsertProducts(db, integration.supplier_id, integration.id, mapped)

    let deactivated = 0
    if (deleted.length) {
      const { data: rows, error: delErr } = await db.from('supplier_products')
        .update({ is_active: false })
        .eq('supplier_id', integration.supplier_id).in('external_id', deleted)
        .select('id')
      if (delErr) errors.push(`Desativação: ${delErr.message}`)
      deactivated = rows?.length ?? 0
    }

    const totalSkipped = skipped + invalid
    const status = errors.length && upserted === 0 && deactivated === 0 ? 'error' : (errors.length || totalSkipped ? 'partial' : 'success')
    await db.from('integrations').update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      last_error: status === 'error' ? errors[0] ?? null : null,
    }).eq('id', integration.id)

    await logIntegration(db, {
      ...base, level: status === 'error' ? 'error' : status === 'partial' ? 'warn' : 'info', event: 'webhook',
      items_processed: upserted + deactivated,
      message: `Webhook: ${upserted} atualizados, ${deactivated} desativados, ${totalSkipped} ignorados.`,
      details: { received: rawProducts.length, upserted, deactivated, skipped: totalSkipped, errors: errors.slice(0, 20) },
    })

    return json(status === 'error' ? 500 : 200, { ok: status !== 'error', upserted, skipped: totalSkipped, deactivated })
  } catch (err) {
    return errorResponse(err)
  }
})

// POST { integration_id, dry_run? }      → sincroniza (ou testa) uma integração rest_api ou dslite [admin JWT]
// POST { action: 'dslite_discover', env, secret_env }                 → fornecedores vinculados no DSlite [admin]
// POST { action: 'dslite_import', env, secret_env, fornecedores[], price_field, category_id? } → cria fornecedores [admin]
// POST { run_due: true }                 → sincroniza todas as integrações vencidas        [admin JWT ou x-cron-secret]
//
// Resposta: { ok, dry_run, fetched, upserted, skipped, sample?, errors? }
// (run_due responde { ok, results: [{ integration_id, ok, ... }] })

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { errorResponse, fail, HttpError, json, readJson, UUID_RE } from '../_shared/http.ts'
import { adminClient, getUser, requireAdmin } from '../_shared/auth.ts'
import { isValidSecretName, timingSafeEqual } from '../_shared/secrets.ts'
import { fetchDsliteCatalogPage, listDsliteSuppliers, mapDsliteProduct, parseDsliteConfig } from '../_shared/dslite.ts'
import { getPath, mapProduct, type MappedProduct, upsertProducts } from '../_shared/mapping.ts'
import { INTEGRATION_COLUMNS, type IntegrationRow, logIntegration, parseRestConfig, type RestConfig } from '../_shared/integrations.ts'

const MAX_ITEMS = 10_000
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024

interface SyncResult {
  ok: boolean
  dry_run: boolean
  fetched: number
  upserted: number
  skipped: number
  sample?: MappedProduct[]
  errors?: string[]
}

async function fetchPage(cfg: RestConfig, page: number | null): Promise<unknown[]> {
  const url = new URL(cfg.url)
  if (cfg.pagination && page != null) url.searchParams.set(cfg.pagination.param, String(page))
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'FORNEX-Integration/1.0' }
  if (cfg.secret && cfg.authHeader) headers[cfg.authHeader] = cfg.authScheme ? `${cfg.authScheme} ${cfg.secret}` : cfg.secret

  let res: Response
  try {
    res = await fetch(url, { method: cfg.method, headers, redirect: 'error', signal: AbortSignal.timeout(20000) })
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new HttpError(504, 'timeout', 'A API do fornecedor não respondeu em 20 segundos.')
    throw new HttpError(502, 'upstream_error', 'Não foi possível conectar à API do fornecedor.')
  }
  if (!res.ok) throw new HttpError(502, 'upstream_error', `A API do fornecedor respondeu HTTP ${res.status}.`)
  const text = await res.text()
  if (text.length > MAX_RESPONSE_BYTES) throw new HttpError(502, 'upstream_error', 'Resposta da API do fornecedor muito grande.')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new HttpError(502, 'upstream_error', 'A API do fornecedor não retornou JSON válido.')
  }
  const items = cfg.itemsPath ? getPath(body, cfg.itemsPath) : body
  if (!Array.isArray(items)) {
    throw new HttpError(502, 'upstream_error',
      cfg.itemsPath ? `O caminho "${cfg.itemsPath}" não contém uma lista.` : 'A resposta não é uma lista; defina items_path.')
  }
  return items
}

/**
 * DSlite: lê o catálogo do fornecedor em páginas. Para caber no tempo da função,
 * para após ~100s e guarda a próxima página em config.sync_cursor (retoma na próxima execução).
 */
async function collectDslite(db: SupabaseClient, integration: IntegrationRow, dryRun: boolean) {
  const cfg = parseDsliteConfig(integration.config ?? {})
  const started = Date.now()
  const limit = dryRun ? 20 : 200
  let page = dryRun ? 1 : (cfg.sync_cursor ?? 1)
  const raw: Record<string, unknown>[] = []
  let total = 0
  let finished = false
  while (raw.length < MAX_ITEMS) {
    const res = await fetchDsliteCatalogPage(cfg, page, limit)
    const items = res.produtos ?? []
    total = Number(res.detalhesConsulta?.totalRegistros ?? total)
    raw.push(...items)
    if (dryRun) { finished = true; break }
    if (items.length < limit || (total && page * limit >= total)) { finished = true; break }
    page++
    if (Date.now() - started > 100_000) break // continua na próxima sincronização
  }
  const mapped: MappedProduct[] = []
  let invalid = 0
  for (const item of raw) {
    const p = mapDsliteProduct(item, cfg.price_field)
    if (p) mapped.push(p)
    else invalid++
  }
  if (!dryRun) {
    const nextCursor = finished ? null : page
    await db.from('integrations').update({ config: { ...(integration.config ?? {}), sync_cursor: nextCursor } }).eq('id', integration.id)
  }
  const note = !dryRun && !finished
    ? [`Catálogo grande: sincronizadas até a página ${page - 1} de ${Math.ceil(total / limit) || '?'}. O restante entra na próxima sincronização.`]
    : []
  return { raw, mapped, invalid, note }
}

async function syncOne(db: SupabaseClient, integration: IntegrationRow, dryRun: boolean): Promise<SyncResult> {
  if (integration.type !== 'rest_api' && integration.type !== 'dslite') {
    throw new HttpError(400, 'invalid_type', 'Apenas integrações por API (REST ou DSlite) podem ser sincronizadas.')
  }
  const base = { integration_id: integration.id, supplier_id: integration.supplier_id }

  try {
    let capped: unknown[] = []
    let mapped: MappedProduct[] = []
    let invalid = 0
    let notes: string[] = []

    if (integration.type === 'dslite') {
      const r = await collectDslite(db, integration, dryRun)
      capped = r.raw; mapped = r.mapped; invalid = r.invalid; notes = r.note
    } else {
      const cfg = parseRestConfig(integration.config ?? {})
      // Coleta (com paginação opcional)
      const raw: unknown[] = []
      if (cfg.pagination) {
        for (let i = 0; i < cfg.pagination.maxPages && raw.length < MAX_ITEMS; i++) {
          const items = await fetchPage(cfg, cfg.pagination.start + i)
          if (items.length === 0) break
          raw.push(...items)
          if (dryRun) break // teste usa só a primeira página
        }
      } else {
        raw.push(...(await fetchPage(cfg, null)))
      }
      if (raw.length > MAX_ITEMS) notes = [`Limite de ${MAX_ITEMS} itens atingido; o restante foi ignorado.`]
      capped = raw.slice(0, MAX_ITEMS)
      for (const item of capped) {
        const p = mapProduct(item, cfg.fieldMap, cfg.priceUnit)
        if (p) mapped.push(p)
        else invalid++
      }
    }

    if (dryRun) {
      await logIntegration(db, {
        ...base, level: 'info', event: 'test', items_processed: mapped.length,
        message: `Teste: ${capped.length} itens recebidos, ${mapped.length} válidos.`,
        details: { fetched: capped.length, valid: mapped.length, invalid },
      })
      return { ok: true, dry_run: true, fetched: capped.length, upserted: 0, skipped: invalid, sample: mapped.slice(0, 10) }
    }

    const { upserted, skipped, errors } = await upsertProducts(db, integration.supplier_id, integration.id, mapped)
    const totalSkipped = skipped + invalid
    const status = errors.length && upserted === 0 ? 'error' : (errors.length || totalSkipped ? 'partial' : 'success')
    const allErrors = [...notes, ...errors].slice(0, 20)

    await db.from('integrations').update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      last_error: status === 'error' ? allErrors[0] ?? null : null,
      ...(status === 'error' ? { status: 'error' } : integration.status === 'error' ? { status: 'active' } : {}),
    }).eq('id', integration.id)

    await logIntegration(db, {
      ...base, level: status === 'error' ? 'error' : status === 'partial' ? 'warn' : 'info', event: 'sync',
      items_processed: upserted,
      message: `Sincronização: ${upserted} produtos atualizados, ${totalSkipped} ignorados.`,
      details: { fetched: capped.length, upserted, skipped: totalSkipped, errors: allErrors },
    })

    return {
      ok: status !== 'error', dry_run: false, fetched: capped.length, upserted, skipped: totalSkipped,
      ...(allErrors.length ? { errors: allErrors } : {}),
    }
  } catch (err) {
    const message = err instanceof HttpError ? err.message : 'Erro inesperado na sincronização.'
    if (!(err instanceof HttpError)) console.error(err)
    if (!dryRun) {
      await db.from('integrations').update({
        last_sync_at: new Date().toISOString(), last_sync_status: 'error', last_error: message, status: 'error',
      }).eq('id', integration.id)
    }
    await logIntegration(db, { ...base, level: 'error', event: dryRun ? 'test' : 'sync', message })
    throw err
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  const cors = corsHeaders(req)
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Método não permitido.', cors)

  try {
    const db = adminClient()
    const body = await readJson<{
      integration_id?: unknown; dry_run?: unknown; run_due?: unknown; action?: unknown
      env?: unknown; secret_env?: unknown; price_field?: unknown; category_id?: unknown
      fornecedores?: { id?: unknown; apelido?: unknown }[]
    }>(req)

    // Autenticação: segredo do cron OU administrador logado
    const cronSecret = Deno.env.get('CRON_SECRET')
    const cronHeader = req.headers.get('x-cron-secret')
    const isCron = Boolean(cronSecret && cronHeader && timingSafeEqual(cronHeader, cronSecret))
    if (!isCron) {
      const user = await getUser(req)
      if (!user) throw new HttpError(401, 'unauthorized', 'Faça login como administrador.')
      await requireAdmin(user, db)
    }

    // ---------------- DSlite: listar fornecedores vinculados à empresa (admin)
    if (body.action === 'dslite_discover' || body.action === 'dslite_import') {
      if (isCron) throw new HttpError(403, 'forbidden', 'Ação permitida só para administradores.')
      const cfg = parseDsliteConfig({ env: body.env, secret_env: body.secret_env }, false)
      if (!isValidSecretName(cfg.secret_env)) throw new HttpError(400, 'invalid_config', 'O nome da secret precisa começar com SUPPLIER_.')

      if (body.action === 'dslite_discover') {
        const result = await listDsliteSuppliers(cfg.env, cfg.secret_env)
        const { data: existing } = await db.from('integrations').select('config').eq('type', 'dslite')
        const linked = new Set((existing ?? []).map((i) => String((i.config as Record<string, unknown>)?.fornecedorid ?? '')))
        return json(200, { ...result, fornecedores: result.fornecedores.map((f) => ({ ...f, ja_importado: linked.has(String(f.id)) })) }, cors)
      }

      // ---------------- DSlite: criar fornecedores + integrações escolhidos
      const list = Array.isArray(body.fornecedores) ? body.fornecedores.slice(0, 100) : []
      const categoryId = typeof body.category_id === 'string' && UUID_RE.test(body.category_id) ? body.category_id : null
      const priceField = parseDsliteConfig({ price_field: body.price_field }, false).price_field
      const created: { supplier_id: string; integration_id: string; nome: string }[] = []
      for (const f of list) {
        const fid = Number(f.id)
        const nome = typeof f.apelido === 'string' && f.apelido.trim() ? f.apelido.trim().slice(0, 100) : `Fornecedor DSlite ${fid}`
        if (!Number.isInteger(fid) || fid <= 0) continue
        const { data: dup } = await db.from('integrations').select('id').eq('type', 'dslite').eq('config->>fornecedorid', String(fid)).maybeSingle()
        if (dup) continue
        const slugBase = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'fornecedor'
        const { data: sup, error: supErr } = await db.from('suppliers').insert({
          name: nome, slug: `${slugBase}-ds${fid}`, category_id: categoryId,
          description: `Fornecedor nacional integrado via DSlite. Catálogo, estoque e preços sincronizados automaticamente.`,
          min_access_level: 1, is_published: false, tags: ['dslite', 'dropshipping'],
        }).select('id').single()
        if (supErr) throw supErr
        const { data: integ, error: intErr } = await db.from('integrations').insert({
          supplier_id: sup.id, name: `DSlite — ${nome}`, type: 'dslite', status: 'active', sync_interval_minutes: 360,
          config: { env: cfg.env, secret_env: cfg.secret_env, fornecedorid: String(fid), price_field: priceField },
        }).select('id').single()
        if (intErr) throw intErr
        await logIntegration(db, { integration_id: integ.id, supplier_id: sup.id, level: 'info', event: 'config',
          message: `Fornecedor ${nome} importado do DSlite (id ${fid}).` })
        created.push({ supplier_id: sup.id, integration_id: integ.id, nome })
      }
      return json(200, { ok: true, created }, cors)
    }

    if (body.run_due === true) {
      const { data, error } = await db.from('integrations').select(INTEGRATION_COLUMNS)
        .in('type', ['rest_api', 'dslite']).eq('status', 'active').not('sync_interval_minutes', 'is', null)
      if (error) throw error
      const now = Date.now()
      const due = ((data ?? []) as IntegrationRow[]).filter((i) =>
        !i.last_sync_at || now - new Date(i.last_sync_at).getTime() >= (i.sync_interval_minutes ?? 0) * 60_000)
      const results = []
      for (const integration of due) {
        try {
          results.push({ integration_id: integration.id, ...(await syncOne(db, integration, false)) })
        } catch (e) {
          results.push({ integration_id: integration.id, ok: false, error: e instanceof HttpError ? e.code : 'internal_error' })
        }
      }
      return json(200, { ok: true, results }, cors)
    }

    if (isCron) throw new HttpError(400, 'invalid_request', 'O cron só pode usar run_due.')
    if (typeof body.integration_id !== 'string' || !UUID_RE.test(body.integration_id)) {
      throw new HttpError(400, 'invalid_request', 'integration_id inválido.')
    }

    const { data: integration, error } = await db.from('integrations').select(INTEGRATION_COLUMNS)
      .eq('id', body.integration_id).maybeSingle()
    if (error) throw error
    if (!integration) throw new HttpError(404, 'integration_not_found', 'Integração não encontrada.')

    const result = await syncOne(db, integration as IntegrationRow, body.dry_run === true)
    return json(200, result, cors)
  } catch (err) {
    return errorResponse(err, cors)
  }
})

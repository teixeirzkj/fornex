// Conector DSlite (https://api.dslite.com.br) — agregador de fornecedores nacionais.
// Documentação: Postman 5316990/RWaRNkaA. Auth: header "Token: <token da empresa>".
// O token fica numa secret SUPPLIER_* das Edge Functions, nunca no banco.

import { HttpError } from './http.ts'
import { readSupplierSecret } from './secrets.ts'
import type { MappedProduct } from './mapping.ts'

export type DsliteEnv = 'production' | 'homologacao'
export type DslitePriceField = 'preco_dropshipping' | 'preco_crossdocking' | 'preco_normal'

export interface DsliteConfig {
  env: DsliteEnv
  secret_env: string
  fornecedorid: string
  price_field: DslitePriceField
  sync_cursor?: number | null
}

const BASE: Record<DsliteEnv, string> = {
  production: 'https://api.dslite.com.br/v1',
  homologacao: 'https://api.master.dev.dslite.com.br/v1',
}

export function parseDsliteConfig(cfg: Record<string, unknown>, requireSupplier = true): DsliteConfig {
  const env: DsliteEnv = cfg.env === 'homologacao' ? 'homologacao' : 'production'
  const secretEnv = typeof cfg.secret_env === 'string' ? cfg.secret_env : 'SUPPLIER_DSLITE_TOKEN'
  const fornecedorid = cfg.fornecedorid == null ? '' : String(cfg.fornecedorid)
  if (requireSupplier && !/^\d{1,14}$/.test(fornecedorid)) {
    throw new HttpError(400, 'invalid_config', 'Fornecedor DSlite inválido nesta integração.')
  }
  const pf = cfg.price_field
  const price_field: DslitePriceField = pf === 'preco_crossdocking' || pf === 'preco_normal' ? pf : 'preco_dropshipping'
  const cursor = Number(cfg.sync_cursor)
  return { env, secret_env: secretEnv, fornecedorid, price_field, sync_cursor: Number.isInteger(cursor) && cursor > 1 ? cursor : null }
}

function token(secretEnv: string) {
  const t = readSupplierSecret(secretEnv)
  if (!t) {
    throw new HttpError(400, 'secret_missing',
      `Token do DSlite não configurado. Rode: npx supabase secrets set ${secretEnv}=SEU_TOKEN`)
  }
  return t
}

async function dsliteFetch<T>(env: DsliteEnv, secretEnv: string, path: string, timeoutMs = 60_000): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE[env]}${path}`, {
      headers: { Accept: 'application/json', Token: token(secretEnv) },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    })
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(504, 'timeout', 'O DSlite demorou para responder. Tente novamente em instantes.')
  }
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* não-JSON */ }
  if (!res.ok) {
    const msg = typeof json.error === 'string' ? json.error : `HTTP ${res.status}`
    throw new HttpError(res.status === 401 ? 400 : 502, 'upstream_error', `DSlite: ${msg}`)
  }
  return json as T
}

export interface DsliteSupplier { id: number; apelido: string; status: string; crossdocking: string; dropshipping: string }

/** Fornecedores vinculados à empresa no DSlite */
export async function listDsliteSuppliers(env: DsliteEnv, secretEnv: string) {
  const r = await dsliteFetch<{ apelido?: string; status?: string; dropshipping?: string; crossdocking?: string; fornecedores?: DsliteSupplier[] }>(
    env, secretEnv, '/Empresa/fornecedor/status')
  return {
    empresa: { apelido: r.apelido ?? null, status: r.status ?? null, dropshipping: r.dropshipping ?? null, crossdocking: r.crossdocking ?? null },
    fornecedores: (r.fornecedores ?? []).map((f) => ({
      id: Number(f.id), apelido: String(f.apelido ?? `Fornecedor ${f.id}`), status: String(f.status ?? ''),
      crossdocking: String(f.crossdocking ?? ''), dropshipping: String(f.dropshipping ?? ''),
    })),
  }
}

interface CatalogPage {
  nome?: string; cnpj?: string; apelido?: string
  detalhesConsulta?: { registrosRetornados?: number; totalRegistros?: number }
  produtos?: Record<string, unknown>[]
}

export async function fetchDsliteCatalogPage(cfg: DsliteConfig, page: number, limit: number) {
  const q = new URLSearchParams({ limit: String(limit), page: String(page), incluir_variacao: 'false' })
  return dsliteFetch<CatalogPage>(cfg.env, cfg.secret_env, `/CrossDocking/Catalogo/${cfg.fornecedorid}?${q}`)
}

const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : 0
}
const httpUrl = (v: unknown) => (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v) && v.length <= 1000 ? v : null)
const stripHtml = (s: unknown) =>
  typeof s === 'string'
    ? s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
    : ''

/** Produto DSlite → produto FORNEX. Preço: campo escolhido; se zerado, cai para os outros. */
export function mapDsliteProduct(p: Record<string, unknown>, priceField: DslitePriceField): MappedProduct | null {
  const externalId = p.produtoid == null ? '' : String(p.produtoid).trim()
  const name = String(p.titulo || p.titulo_curto || '').trim().slice(0, 300)
  if (!externalId || !name) return null

  const order: DslitePriceField[] = [priceField, 'preco_dropshipping', 'preco_crossdocking', 'preco_normal']
  let price = 0
  for (const f of order) { price = num(p[f]); if (price > 0) break }

  const midias = Array.isArray(p.midias) ? (p.midias as { tipo?: string; valor?: string }[]) : []
  const image = httpUrl(p.link_imagem) ?? httpUrl(midias.find((m) => m?.tipo === 'imagem')?.valor)
  const desc = [stripHtml(p.descricao), stripHtml(p.caracteristicas)].filter(Boolean).join('\n\n').slice(0, 4000)
  const stock = Math.max(0, Math.trunc(num(p.estoque)))

  return {
    external_id: externalId.slice(0, 200),
    name,
    sku: String(p.produtoid_empresa || p.produtoid || '').slice(0, 100) || null,
    description: desc || null,
    price_cents: price > 0 ? Math.round(price * 100) : null,
    stock,
    image_url: image,
    product_url: null,
  }
}

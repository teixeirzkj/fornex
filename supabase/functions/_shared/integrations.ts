import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './http.ts'
import { isValidSecretName, readSupplierSecret } from './secrets.ts'
import type { FieldMap } from './mapping.ts'

export interface IntegrationRow {
  id: string
  supplier_id: string
  name: string
  type: 'rest_api' | 'webhook' | 'csv' | 'manual' | 'dslite'
  status: 'draft' | 'active' | 'paused' | 'error'
  config: Record<string, unknown>
  sync_interval_minutes: number | null
  last_sync_at: string | null
}

export const INTEGRATION_COLUMNS = 'id, supplier_id, name, type, status, config, sync_interval_minutes, last_sync_at'

export interface RestConfig {
  url: URL
  method: 'GET' | 'POST'
  itemsPath: string | null
  authHeader: string | null
  authScheme: string | null
  secret: string | null
  priceUnit: 'reais' | 'cents'
  fieldMap: FieldMap
  pagination: { param: string; start: number; maxPages: number } | null
}

const HEADER_RE = /^[A-Za-z0-9-]{1,64}$/
const PATH_RE = /^[\w.-]{1,200}$/

/** Bloqueia destinos internos (proteção básica contra SSRF). */
function assertPublicHost(url: URL) {
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new HttpError(400, 'invalid_config', 'Endereço da API não permitido (host interno).')
  }
  // IPv6 literal: não permitido
  if (host.startsWith('[') || host.includes(':')) {
    throw new HttpError(400, 'invalid_config', 'Use um domínio público em vez de IP.')
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    const blocked = a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    if (blocked) throw new HttpError(400, 'invalid_config', 'Endereço da API não permitido (IP privado).')
  }
}

/** Valida e normaliza a configuração de uma integração rest_api. */
export function parseRestConfig(cfg: Record<string, unknown>): RestConfig {
  if (typeof cfg.base_url !== 'string') throw new HttpError(400, 'invalid_config', 'Informe a URL da API (base_url).')
  let url: URL
  try {
    url = new URL(cfg.base_url)
  } catch {
    throw new HttpError(400, 'invalid_config', 'URL da API inválida.')
  }
  if (url.protocol !== 'https:') throw new HttpError(400, 'invalid_config', 'A URL da API precisa usar HTTPS.')
  if (url.username || url.password) throw new HttpError(400, 'invalid_config', 'Não coloque credenciais na URL; use secret_env.')
  assertPublicHost(url)

  const method = cfg.method === 'POST' ? 'POST' : 'GET'
  if (cfg.method && cfg.method !== 'GET' && cfg.method !== 'POST') {
    throw new HttpError(400, 'invalid_config', 'Método HTTP deve ser GET ou POST.')
  }

  const itemsPath = typeof cfg.items_path === 'string' && cfg.items_path.trim() ? cfg.items_path.trim() : null
  if (itemsPath && !PATH_RE.test(itemsPath)) throw new HttpError(400, 'invalid_config', 'items_path inválido.')

  let secret: string | null = null
  if (cfg.secret_env) {
    if (!isValidSecretName(cfg.secret_env)) {
      throw new HttpError(400, 'invalid_config', 'secret_env deve começar com SUPPLIER_ (ex.: SUPPLIER_ACME_TOKEN).')
    }
    secret = readSupplierSecret(cfg.secret_env)
    if (!secret) {
      throw new HttpError(400, 'secret_missing',
        `A secret ${cfg.secret_env} não está definida. Rode: supabase secrets set ${cfg.secret_env}=<valor>`)
    }
  }

  const authHeader = typeof cfg.auth_header === 'string' && cfg.auth_header ? cfg.auth_header : (secret ? 'Authorization' : null)
  if (authHeader && !HEADER_RE.test(authHeader)) throw new HttpError(400, 'invalid_config', 'Nome do header de autenticação inválido.')
  const authScheme = typeof cfg.auth_scheme === 'string' && cfg.auth_scheme ? cfg.auth_scheme.slice(0, 30) : null
  if (authScheme && !/^[A-Za-z]+$/.test(authScheme)) throw new HttpError(400, 'invalid_config', 'auth_scheme inválido (ex.: Bearer).')

  let pagination: RestConfig['pagination'] = null
  const pg = cfg.pagination as Record<string, unknown> | null | undefined
  if (pg && typeof pg === 'object' && pg.param) {
    if (typeof pg.param !== 'string' || !/^[\w-]{1,40}$/.test(pg.param)) {
      throw new HttpError(400, 'invalid_config', 'Parâmetro de paginação inválido.')
    }
    pagination = {
      param: pg.param,
      start: Number.isInteger(pg.start) ? Number(pg.start) : 1,
      maxPages: Math.min(Math.max(Number(pg.max_pages) || 1, 1), 50),
    }
  }

  const fieldMap: FieldMap = {}
  if (cfg.field_map && typeof cfg.field_map === 'object') {
    for (const [k, v] of Object.entries(cfg.field_map as Record<string, unknown>)) {
      if (typeof v === 'string' && v && PATH_RE.test(v)) fieldMap[k as keyof FieldMap] = v
    }
  }

  return {
    url, method, itemsPath, authHeader, authScheme, secret,
    priceUnit: cfg.price_unit === 'cents' ? 'cents' : 'reais',
    fieldMap, pagination,
  }
}

export async function logIntegration(db: SupabaseClient, entry: {
  integration_id: string | null
  supplier_id: string | null
  level: 'info' | 'warn' | 'error'
  event: 'sync' | 'webhook' | 'import' | 'test' | 'config'
  message: string
  items_processed?: number
  details?: unknown
}) {
  const { error } = await db.from('integration_logs').insert({ items_processed: 0, ...entry, message: entry.message.slice(0, 1000) })
  if (error) console.error('falha ao gravar log de integração', error.message)
}

// Mapeamento genérico de produtos vindos de APIs/webhooks de fornecedores
// para o formato da tabela supplier_products.

export type FieldKey = 'external_id' | 'name' | 'sku' | 'description' | 'price' | 'stock' | 'image_url' | 'product_url'
export type FieldMap = Partial<Record<FieldKey, string>>

export interface MappedProduct {
  external_id: string | null
  name: string
  sku: string | null
  description: string | null
  price_cents: number | null
  stock: number | null
  image_url: string | null
  product_url: string | null
}

const DEFAULT_MAP: Required<FieldMap> = {
  external_id: 'id',
  name: 'name',
  sku: 'sku',
  description: 'description',
  price: 'price',
  stock: 'stock',
  image_url: 'image_url',
  product_url: 'url',
}

/** Lê um caminho como "a.b.0.c" de um objeto. */
export function getPath(obj: unknown, path: string | undefined | null): unknown {
  if (!path) return obj
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function str(v: unknown, max: number): string | null {
  if (v == null) return null
  if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

function url(v: unknown): string | null {
  const s = str(v, 1000)
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Converte "1.234,56", "1234.56", "R$ 10,00" ou número em reais. */
export function parseDecimal(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.replace(/[^\d.,-]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.') // formato brasileiro
  } else {
    s = s.replace(/,/g, '') // formato internacional
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function price(v: unknown, unit: 'reais' | 'cents' | undefined): number | null {
  const n = parseDecimal(v)
  if (n == null || n < 0) return null
  const cents = unit === 'cents' ? Math.round(n) : Math.round(n * 100)
  return cents <= 2_000_000_000 ? cents : null
}

function int(v: unknown): number | null {
  const n = parseDecimal(v)
  if (n == null) return null
  const i = Math.trunc(n)
  return Math.abs(i) <= 2_000_000_000 ? i : null
}

/** Retorna o produto mapeado, ou null se inválido (ex.: sem nome). */
export function mapProduct(raw: unknown, fieldMap: FieldMap | undefined, priceUnit?: 'reais' | 'cents'): MappedProduct | null {
  if (raw == null || typeof raw !== 'object') return null
  const m = { ...DEFAULT_MAP, ...(fieldMap ?? {}) }
  const name = str(getPath(raw, m.name), 300)
  if (!name) return null
  return {
    external_id: str(getPath(raw, m.external_id), 200),
    name,
    sku: str(getPath(raw, m.sku), 120),
    description: str(getPath(raw, m.description), 4000),
    price_cents: price(getPath(raw, m.price), priceUnit),
    stock: int(getPath(raw, m.stock)),
    image_url: url(getPath(raw, m.image_url)),
    product_url: url(getPath(raw, m.product_url)),
  }
}

/** Faz upsert em lotes em supplier_products. Itens sem external_id são ignorados. */
// deno-lint-ignore no-explicit-any
export async function upsertProducts(db: any, supplierId: string, integrationId: string, items: MappedProduct[]) {
  const errors: string[] = []
  let upserted = 0
  let skipped = 0
  const rows: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const p of items) {
    if (!p.external_id || seen.has(p.external_id)) {
      skipped++
      continue
    }
    seen.add(p.external_id)
    rows.push({ ...p, supplier_id: supplierId, integration_id: integrationId, is_active: true })
  }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await db.from('supplier_products').upsert(chunk, { onConflict: 'supplier_id,external_id' })
    if (error) {
      errors.push(`Lote ${i / 500 + 1}: ${error.message}`)
      skipped += chunk.length
    } else {
      upserted += chunk.length
    }
  }
  return { upserted, skipped, errors }
}

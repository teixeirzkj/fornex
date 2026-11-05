import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageOff, PackageSearch, Search, Store, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sanitizeSearch } from '@/lib/api'
import { formatBRL, formatNumber, safeUrl } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import type { SupplierProduct } from '@/types/db'
import { PageHeader, SubscriptionGate } from '@/components/app/Shared'
import { PublishModal } from '@/components/app/PublishModal'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState, Notice, Skeleton } from '@/components/ui/Feedback'

type Row = SupplierProduct & { supplier: { name: string; slug: string } | null }
const PAGE = 24
const COLUMNS = 'id, supplier_id, integration_id, external_id, name, sku, description, price_cents, stock, image_url, product_url, is_active, updated_at, supplier:suppliers(name, slug)'

/** Catálogo de todos os produtos dos fornecedores do plano, prontos para publicar no Mercado Livre */
export default function Publish() {
  const { user } = useAuth()
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [onlyStock, setOnlyStock] = useState(true)
  const [items, setItems] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [stores, setStores] = useState<number | null>(null)
  const [publishing, setPublishing] = useState<SupplierProduct | null>(null)
  const req = useRef(0)

  useEffect(() => { const t = setTimeout(() => setQ(sanitizeSearch(term)), 350); return () => clearTimeout(t) }, [term])
  useEffect(() => {
    if (!user) return
    supabase.from('ml_accounts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).then(({ count }) => setStores(count ?? 0))
  }, [user])

  const fetchPage = useCallback((offset: number) => {
    let query = supabase.from('supplier_products').select(COLUMNS, { count: offset === 0 ? 'exact' : undefined }).eq('is_active', true)
    if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
    if (onlyStock) query = query.gt('stock', 0)
    return query.order('updated_at', { ascending: false }).order('id').range(offset, offset + PAGE - 1)
  }, [q, onlyStock])

  useEffect(() => {
    const id = ++req.current
    setLoading(true)
    fetchPage(0).then(({ data, count }) => {
      if (id !== req.current) return
      setItems((data as unknown as Row[]) ?? [])
      setTotal(count ?? 0)
      setLoading(false)
    })
  }, [fetchPage])

  const more = async () => {
    setLoadingMore(true)
    const { data } = await fetchPage(items.length)
    setItems((p) => [...p, ...((data as unknown as Row[]) ?? [])])
    setLoadingMore(false)
  }

  return (
    <div>
      <PageHeader eyebrow="Mercado Livre" title="Publicar produtos"
        description="Escolha um produto dos fornecedores, defina sua margem e publique na sua loja em poucos cliques." />

      <SubscriptionGate />

      {stores === 0 && (
        <div className="mb-5">
          <Notice title="Conecte sua loja do Mercado Livre para publicar"
            action={<ButtonLink to="/app/lojas" size="sm" icon={<Store className="h-4 w-4" />}>Conectar loja</ButtonLink>}>
            Você pode navegar pelos produtos agora e publicar assim que conectar.
          </Notice>
        </div>
      )}

      <div className="card mb-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={60} placeholder="Buscar produto por nome ou SKU"
            aria-label="Buscar produtos" className="field pl-9 pr-9" />
          {term && <button type="button" onClick={() => setTerm('')} aria-label="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg"><X className="h-4 w-4" /></button>}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} className="h-4 w-4 accent-[#155EEF]" />
          Só com estoque
        </label>
      </div>

      <p className="mb-3 text-sm text-muted" aria-live="polite">{loading ? 'Carregando…' : `${formatNumber(total)} ${total === 1 ? 'produto' : 'produtos'}`}</p>

      {loading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<PackageSearch />} title={q ? 'Nenhum produto encontrado' : 'Ainda não há produtos disponíveis'}
          description={q ? 'Tente outro termo de busca.' : 'Os produtos aparecem aqui quando os fornecedores do seu plano tiverem catálogo cadastrado ou sincronizado.'}
          action={!q ? <ButtonLink to="/app/fornecedores" variant="secondary">Ver fornecedores</ButtonLink> : undefined} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {items.map((p) => {
              const img = safeUrl(p.image_url)
              return (
                <div key={p.id} className="card card-hover flex flex-col overflow-hidden">
                  <div className="grid aspect-square place-items-center bg-surface-2">
                    {img ? <img src={img} alt={p.name} loading="lazy" className="h-full w-full object-cover" /> : <ImageOff className="h-6 w-6 text-muted" />}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg sm:text-sm">{p.name}</p>
                    {p.supplier && <Link to={`/app/fornecedores/${p.supplier.slug}`} className="mt-0.5 truncate text-[11px] text-muted hover:text-accent">{p.supplier.name}</Link>}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted">Custo</p>
                        <p className="font-heading text-sm font-bold text-fg sm:text-base">{p.price_cents != null ? formatBRL(p.price_cents) : '—'}</p>
                      </div>
                      <p className="text-[11px] text-muted">{p.stock ? `${formatNumber(p.stock)} un.` : 'Sem estoque'}</p>
                    </div>
                    <Button size="sm" className="mt-2.5 w-full" icon={<Upload className="h-3.5 w-3.5" />}
                      disabled={!p.price_cents || !p.stock} onClick={() => setPublishing(p)}>
                      Publicar
                    </Button>
                    {!img && <p className="mt-1.5 text-center text-[10px] text-amber-400">Sem foto: o ML exige imagem</p>}
                  </div>
                </div>
              )
            })}
          </div>
          {items.length < total && (
            <div className="mt-8 flex justify-center"><Button variant="secondary" loading={loadingMore} onClick={more}>Carregar mais</Button></div>
          )}
        </>
      )}

      <PublishModal product={publishing} open={!!publishing} onClose={() => setPublishing(null)} />
    </div>
  )
}

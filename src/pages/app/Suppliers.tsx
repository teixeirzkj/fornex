import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Building2, Filter, Search, SlidersHorizontal, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sanitizeSearch, SUPPLIER_LIST_COLUMNS } from '@/lib/api'
import { BR_STATES } from '@/lib/config'
import { cn, formatNumber } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import type { Category, SupplierListItem } from '@/types/db'
import { PageHeader, SubscriptionGate, SupplierCard, SupplierCardSkeleton } from '@/components/app/Shared'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/Feedback'
import { CategoryIcon } from '@/components/ui/CategoryIcon'

const PAGE = 24
const SORTS = {
  relevancia: { label: 'Atualizados recentemente', col: 'updated_at', asc: false },
  recentes: { label: 'Adicionados recentemente', col: 'created_at', asc: false },
  'a-z': { label: 'Nome (A–Z)', col: 'name', asc: true },
  'z-a': { label: 'Nome (Z–A)', col: 'name', asc: false },
} as const
type SortKey = keyof typeof SORTS

export default function Suppliers() {
  const { user, hasActiveSubscription } = useAuth()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const categoria = params.get('categoria') ?? ''
  const uf = params.get('uf') ?? ''
  const ordem = (params.get('ordem') as SortKey) in SORTS ? (params.get('ordem') as SortKey) : 'relevancia'

  const [term, setTerm] = useState(q)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<SupplierListItem[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const reqId = useRef(0)
  const lastLogged = useRef('')

  const setParam = useCallback((key: string, value: string) => {
    setParams((prev) => {
      const n = new URLSearchParams(prev)
      if (value) n.set(key, value); else n.delete(key)
      return n
    }, { replace: true })
  }, [setParams])

  useEffect(() => {
    supabase.from('supplier_categories').select('id, name, slug, description, icon, sort_order').order('sort_order')
      .then(({ data }) => setCategories((data as Category[]) ?? []))
  }, [])

  // Busca com debounce na URL
  useEffect(() => { setTerm(q) }, [q])
  useEffect(() => {
    const t = setTimeout(() => { if (term !== q) setParam('q', term.trim()) }, 350)
    return () => clearTimeout(t)
  }, [term, q, setParam])

  const fetchPage = useCallback(async (offset: number) => {
    const cat = categories.find((c) => c.slug === categoria)
    const sort = SORTS[ordem]
    let query = supabase.from('suppliers').select(SUPPLIER_LIST_COLUMNS, { count: offset === 0 ? 'exact' : undefined })
    const clean = sanitizeSearch(q)
    if (clean) query = query.or(`name.ilike.%${clean}%,description.ilike.%${clean}%`)
    if (cat) query = query.eq('category_id', cat.id)
    if (uf) query = query.eq('state', uf)
    return query.order(sort.col, { ascending: sort.asc }).order('id').range(offset, offset + PAGE - 1)
  }, [categories, categoria, ordem, q, uf])

  useEffect(() => {
    if (categoria && categories.length === 0) return // aguarda categorias para resolver o slug
    const id = ++reqId.current
    setLoading(true)
    fetchPage(0).then(({ data, count }) => {
      if (id !== reqId.current) return
      setItems((data as unknown as SupplierListItem[]) ?? [])
      setTotal(count ?? 0)
      setLoading(false)
    })
  }, [fetchPage, categoria, categories.length])

  // Histórico de buscas (somente termos com 2+ caracteres, sem duplicar em sequência)
  useEffect(() => {
    const clean = sanitizeSearch(q)
    if (!user || clean.length < 2 || clean === lastLogged.current) return
    lastLogged.current = clean
    void supabase.from('search_history').insert({ user_id: user.id, query: clean, filters: { categoria: categoria || null, uf: uf || null } })
  }, [q, user, categoria, uf])

  const loadMore = async () => {
    setLoadingMore(true)
    const { data } = await fetchPage(items.length)
    setItems((prev) => [...prev, ...((data as unknown as SupplierListItem[]) ?? [])])
    setLoadingMore(false)
  }

  const activeFilters = [categoria && categories.find((c) => c.slug === categoria)?.name, uf].filter(Boolean).length
  const clearAll = () => { setTerm(''); setParams({}, { replace: true }) }

  return (
    <div>
      <PageHeader eyebrow="Central de fornecedores" title="Todos os fornecedores"
        description="Pesquise, filtre e salve os fornecedores ideais para o seu negócio." />

      <SubscriptionGate />

      <div className="card sticky top-[72px] z-20 mb-5 p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por nome ou descrição"
              aria-label="Buscar fornecedores" className="field pl-9 pr-9" maxLength={60} />
            {term && (
              <button type="button" onClick={() => setTerm('')} aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg"><X className="h-4 w-4" /></button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="md:hidden" onClick={() => setShowFilters((s) => !s)} icon={<SlidersHorizontal className="h-4 w-4" />}>
              Filtros{activeFilters > 0 && ` (${activeFilters})`}
            </Button>
            <div className={cn('hidden gap-2 md:flex')}>
              <FilterSelects {...{ categories, categoria, uf, ordem, setParam }} />
            </div>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden md:hidden">
              <div className="grid gap-2 pt-3"><FilterSelects {...{ categories, categoria, uf, ordem, setParam }} /></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {categories.length > 0 && (
        <div className="scrollbar-thin -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip active={!categoria} onClick={() => setParam('categoria', '')}>Todas</Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={categoria === c.slug} onClick={() => setParam('categoria', categoria === c.slug ? '' : c.slug)}>
              <CategoryIcon name={c.icon} className="h-3.5 w-3.5" />{c.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between text-sm text-muted">
        <span aria-live="polite">{loading ? 'Carregando…' : `${formatNumber(total)} ${total === 1 ? 'fornecedor encontrado' : 'fornecedores encontrados'}`}</span>
        {(q || activeFilters > 0) && <button type="button" onClick={clearAll} className="font-medium text-accent hover:underline">Limpar filtros</button>}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <SupplierCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        q || activeFilters > 0 ? (
          <EmptyState icon={<Filter />} title="Nenhum fornecedor com esses filtros"
            description="Tente outro termo de busca ou remova alguns filtros."
            action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
        ) : (
          <EmptyState icon={<Building2 />}
            title={hasActiveSubscription ? 'Ainda não há fornecedores disponíveis no seu plano' : 'Catálogo bloqueado'}
            description={hasActiveSubscription
              ? 'Novos fornecedores são publicados pela nossa equipe. Você será avisado em Atualizações.'
              : 'Ative um plano para visualizar os fornecedores e seus contatos.'}
            action={!hasActiveSubscription ? <ButtonLink to="/app/assinatura">Ver planos</ButtonLink> : undefined} />
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((s, i) => <SupplierCard key={s.id} s={s} index={i % PAGE} />)}
          </div>
          {total != null && items.length < total && (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
                Carregar mais ({formatNumber(total - items.length)} restantes)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FilterSelects({ categories, categoria, uf, ordem, setParam }: {
  categories: Category[]; categoria: string; uf: string; ordem: SortKey; setParam: (k: string, v: string) => void
}) {
  return (
    <>
      <Select aria-label="Categoria" value={categoria} onChange={(e) => setParam('categoria', e.target.value)} className="md:w-48">
        <option value="">Todas as categorias</option>
        {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
      </Select>
      <Select aria-label="Estado" value={uf} onChange={(e) => setParam('uf', e.target.value)} className="md:w-32">
        <option value="">Todos os estados</option>
        {BR_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Select aria-label="Ordenar por" value={ordem} onChange={(e) => setParam('ordem', e.target.value === 'relevancia' ? '' : e.target.value)} className="md:w-56">
        {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </Select>
    </>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
        active ? 'border-fornex-electric bg-fornex-electric text-white' : 'border-line bg-surface text-muted hover:border-accent/40 hover:text-fg')}>
      {children}
    </button>
  )
}

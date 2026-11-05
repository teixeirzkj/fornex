import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { SUPPLIER_LIST_COLUMNS } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { cn, timeAgo } from '@/lib/utils'
import type { SupplierListItem } from '@/types/db'
import { PageHeader, SupplierLogo } from '@/components/app/Shared'
import { Button } from '@/components/ui/Button'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { EASE } from '@/components/ui/motion'

interface ViewRow { supplier_id: string; viewed_at: string; view_count: number; supplier: SupplierListItem | null }
interface SearchRow { id: string; query: string; filters: { categoria?: string | null; uf?: string | null }; created_at: string }

export default function History() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'views' | 'searches'>('views')
  const [views, setViews] = useState<ViewRow[]>([])
  const [searches, setSearches] = useState<SearchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('supplier_views').select(`supplier_id, viewed_at, view_count, supplier:suppliers(${SUPPLIER_LIST_COLUMNS})`)
        .eq('user_id', user.id).order('viewed_at', { ascending: false }).limit(100),
      supabase.from('search_history').select('id, query, filters, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
    ]).then(([v, s]) => {
      setViews(((v.data ?? []) as unknown as ViewRow[]).filter((r) => r.supplier))
      setSearches((s.data as SearchRow[]) ?? [])
      setLoading(false)
    })
  }, [user])

  const clear = async () => {
    if (!user) return
    const { error } = tab === 'views'
      ? await supabase.from('supplier_views').delete().eq('user_id', user.id)
      : await supabase.from('search_history').delete().eq('user_id', user.id)
    if (error) { toast.error('Não foi possível limpar o histórico.'); return }
    if (tab === 'views') setViews([]); else setSearches([])
    toast.success('Histórico limpo')
  }

  const removeSearch = async (id: string) => {
    const { error } = await supabase.from('search_history').delete().eq('id', id)
    if (!error) setSearches((p) => p.filter((x) => x.id !== id))
  }

  const list = tab === 'views' ? views : searches
  const searchLink = (r: SearchRow) => {
    const p = new URLSearchParams({ q: r.query })
    if (r.filters?.categoria) p.set('categoria', r.filters.categoria)
    if (r.filters?.uf) p.set('uf', r.filters.uf)
    return `/app/fornecedores?${p}`
  }

  return (
    <div>
      <PageHeader eyebrow="Atividade" title="Histórico" description="Fornecedores que você visualizou e buscas realizadas."
        actions={list.length > 0 && <Button variant="secondary" size="sm" onClick={() => setConfirm(true)} icon={<Trash2 className="h-4 w-4" />}>Limpar histórico</Button>} />

      <div className="mb-5 inline-flex rounded-fx-md border border-line bg-surface p-1" role="tablist">
        {([['views', 'Visualizados', Eye], ['searches', 'Buscas', Search]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn('relative flex items-center gap-2 rounded-fx-sm px-4 py-2 text-sm font-medium transition-colors', tab === k ? 'text-fg' : 'text-muted hover:text-fg')}>
            {tab === k && <motion.span layoutId="history-tab" className="absolute inset-0 rounded-fx-sm bg-surface-2" transition={{ duration: 0.42, ease: EASE }} />}
            <Icon className="relative h-4 w-4" /><span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : tab === 'views' ? (
        views.length === 0 ? <EmptyState icon={<Eye />} title="Nenhum fornecedor visualizado" description="Os fornecedores que você abrir aparecerão aqui." /> : (
          <ul className="card divide-y divide-line">
            {views.map((r) => (
              <li key={r.supplier_id}>
                <Link to={`/app/fornecedores/${r.supplier!.slug}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2/50">
                  <SupplierLogo name={r.supplier!.name} url={r.supplier!.logo_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{r.supplier!.name}</p>
                    <p className="truncate text-xs text-muted">{r.supplier!.category?.name ?? 'Sem categoria'} · {r.view_count} {r.view_count === 1 ? 'visita' : 'visitas'}</p>
                  </div>
                  <span className="text-xs text-muted">{timeAgo(r.viewed_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : searches.length === 0 ? <EmptyState icon={<Search />} title="Nenhuma busca registrada" description="Suas pesquisas no catálogo aparecerão aqui." /> : (
        <ul className="card divide-y divide-line">
          {searches.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <Link to={searchLink(r)} className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:text-accent">“{r.query}”</Link>
              <span className="hidden text-xs text-muted sm:block">{timeAgo(r.created_at)}</span>
              <button type="button" aria-label="Remover busca" onClick={() => removeSearch(r.id)} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={clear} confirmLabel="Limpar"
        title={tab === 'views' ? 'Limpar fornecedores visualizados?' : 'Limpar histórico de buscas?'}
        description="Esta ação não pode ser desfeita." />
    </div>
  )
}

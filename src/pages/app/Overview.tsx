import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, CreditCard, Eye, Heart, History, LayoutGrid, Megaphone, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SUPPLIER_LIST_COLUMNS } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { formatDate, formatNumber, timeAgo } from '@/lib/utils'
import type { Notification, SupplierListItem } from '@/types/db'
import { PageHeader, StatCard, SubscriptionGate, SupplierLogo } from '@/components/app/Shared'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'
import { fadeUp, stagger } from '@/components/ui/motion'

interface ViewRow { viewed_at: string; view_count: number; supplier: SupplierListItem | null }

export default function Overview() {
  const { user, profile, subscription, hasActiveSubscription } = useAuth()
  const { ids: favIds } = useFavorites()
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState<number | null>(null)
  const [views, setViews] = useState<ViewRow[]>([])
  const [favorites, setFavorites] = useState<SupplierListItem[]>([])
  const [updates, setUpdates] = useState<Notification[]>([])
  const [newest, setNewest] = useState<SupplierListItem[]>([])

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const [count, v, f, n, recent] = await Promise.all([
        supabase.from('suppliers').select('id', { count: 'exact', head: true }),
        supabase.from('supplier_views').select(`viewed_at, view_count, supplier:suppliers(${SUPPLIER_LIST_COLUMNS})`)
          .eq('user_id', user.id).order('viewed_at', { ascending: false }).limit(50),
        supabase.from('favorites').select(`created_at, supplier:suppliers(${SUPPLIER_LIST_COLUMNS})`)
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(4),
        supabase.from('notifications').select('id, user_id, kind, title, body, link, published_at, created_at')
          .order('published_at', { ascending: false }).limit(4),
        supabase.from('suppliers').select(SUPPLIER_LIST_COLUMNS).order('created_at', { ascending: false }).limit(4),
      ])
      setAvailable(count.count ?? 0)
      setViews(((v.data ?? []) as unknown as ViewRow[]).filter((r) => r.supplier))
      setFavorites(((f.data ?? []) as unknown as { supplier: SupplierListItem | null }[]).map((r) => r.supplier).filter(Boolean) as SupplierListItem[])
      setUpdates((n.data as Notification[]) ?? [])
      setNewest((recent.data as unknown as SupplierListItem[]) ?? [])
      setLoading(false)
    })()
  }, [user])

  // Categorias mais acessadas a partir do histórico real do usuário
  const topCategories = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; icon: string; total: number }>()
    for (const r of views) {
      const c = r.supplier?.category
      if (!c) continue
      const cur = map.get(c.id) ?? { name: c.name, slug: c.slug, icon: c.icon, total: 0 }
      cur.total += r.view_count
      map.set(c.id, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  }, [views])

  const first = (profile?.full_name || '').split(' ')[0]

  return (
    <div>
      <PageHeader eyebrow="Visão geral" title={first ? `Olá, ${first}` : 'Bem-vindo à FORNEX'}
        description="Acompanhe seus fornecedores, acessos recentes e novidades da plataforma."
        actions={<ButtonLink to="/app/fornecedores" icon={<Search className="h-4 w-4" />}>Buscar fornecedores</ButtonLink>} />

      <SubscriptionGate />

      <motion.div variants={stagger()} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { icon: <Building2 />, label: 'Fornecedores disponíveis', value: loading ? '…' : formatNumber(available), hint: 'No seu plano atual', to: '/app/fornecedores' },
          { icon: <Heart />, label: 'Favoritos', value: formatNumber(favIds.size), hint: 'Salvos para consulta rápida', to: '/app/favoritos' },
          { icon: <Eye />, label: 'Fornecedores visualizados', value: loading ? '…' : formatNumber(views.length), hint: 'Histórico recente', to: '/app/historico' },
          { icon: <CreditCard />, label: 'Plano', value: subscription?.plan?.name ?? '—',
            hint: subscription?.current_period_end ? `Válido até ${formatDate(subscription.current_period_end)}` : hasActiveSubscription ? 'Ativo' : 'Nenhum plano ativo', to: '/app/assinatura' },
        ].map((s) => (
          <motion.div key={s.label} variants={fadeUp}><StatCard {...s} /></motion.div>
        ))}
      </motion.div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <SectionTitle icon={<History className="h-4 w-4" />} title="Últimos fornecedores visualizados" to="/app/historico" />
          {loading ? <ListSkeleton /> : views.length === 0 ? (
            <EmptyState className="py-10" icon={<Eye />} title="Nenhum fornecedor visualizado ainda"
              description="Os fornecedores que você abrir aparecem aqui para acesso rápido."
              action={hasActiveSubscription ? <ButtonLink to="/app/fornecedores" size="sm" variant="secondary">Explorar catálogo</ButtonLink> : undefined} />
          ) : (
            <ul className="divide-y divide-line">
              {views.slice(0, 5).map((r) => <SupplierRow key={r.supplier!.id} s={r.supplier!} meta={`Visto ${timeAgo(r.viewed_at)}`} />)}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <SectionTitle icon={<LayoutGrid className="h-4 w-4" />} title="Categorias mais acessadas" to="/app/categorias" />
          {loading ? <ListSkeleton rows={4} /> : topCategories.length === 0 ? (
            <p className="py-6 text-sm text-muted">Suas categorias mais consultadas aparecerão aqui conforme você navega.</p>
          ) : (
            <ul className="space-y-2">
              {topCategories.map((c) => {
                const pct = Math.round((c.total / topCategories[0].total) * 100)
                return (
                  <li key={c.slug}>
                    <Link to={`/app/fornecedores?categoria=${c.slug}`} className="block rounded-fx-md p-2 transition hover:bg-surface-2/60">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-fg"><CategoryIcon name={c.icon} className="h-4 w-4 text-accent" />{c.name}</span>
                        <span className="text-xs text-muted">{c.total} {c.total === 1 ? 'acesso' : 'acessos'}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <motion.div className="h-full rounded-full bg-fornex-blue" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <SectionTitle icon={<Heart className="h-4 w-4" />} title="Favoritos" to="/app/favoritos" />
          {loading ? <ListSkeleton rows={3} /> : favorites.length === 0 ? (
            <p className="py-6 text-sm text-muted">Toque no coração de um fornecedor para salvá-lo aqui.</p>
          ) : (
            <ul className="divide-y divide-line">{favorites.map((s) => <SupplierRow key={s.id} s={s} />)}</ul>
          )}
        </section>

        <section className="card p-5">
          <SectionTitle icon={<Building2 className="h-4 w-4" />} title="Adicionados recentemente" to="/app/fornecedores?ordem=recentes" />
          {loading ? <ListSkeleton rows={3} /> : newest.length === 0 ? (
            <p className="py-6 text-sm text-muted">{hasActiveSubscription ? 'Novos fornecedores aparecerão aqui.' : 'Disponível com um plano ativo.'}</p>
          ) : (
            <ul className="divide-y divide-line">{newest.map((s) => <SupplierRow key={s.id} s={s} />)}</ul>
          )}
        </section>

        <section className="card p-5">
          <SectionTitle icon={<Megaphone className="h-4 w-4" />} title="Atualizações" to="/app/atualizacoes" />
          {loading ? <ListSkeleton rows={3} /> : updates.length === 0 ? (
            <p className="py-6 text-sm text-muted">Nenhuma atualização publicada ainda.</p>
          ) : (
            <ul className="space-y-3">
              {updates.map((u) => (
                <li key={u.id} className="rounded-fx-md border border-line bg-bg/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-medium text-fg">{u.title}</p>
                    <span className="shrink-0 text-[11px] text-muted">{timeAgo(u.published_at)}</span>
                  </div>
                  {u.body && <p className="mt-1 line-clamp-2 text-xs text-muted">{u.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { to: '/app/fornecedores', icon: Search, title: 'Pesquisar fornecedores', text: 'Filtre por categoria, estado e nome.' },
          { to: '/app/categorias', icon: LayoutGrid, title: 'Navegar por categorias', text: 'Encontre o nicho ideal para sua loja.' },
          { to: '/app/suporte', icon: Megaphone, title: 'Falar com o suporte', text: 'Tire dúvidas sobre a plataforma.' },
        ].map((a) => (
          <Link key={a.to} to={a.to} className="card group flex items-center gap-4 p-4 transition hover:border-accent/40">
            <span className="grid h-10 w-10 place-items-center rounded-fx-md bg-accent/10 text-accent"><a.icon className="h-5 w-5" /></span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-fg">{a.title}</span>
              <span className="block text-xs text-muted">{a.text}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function SectionTitle({ icon, title, to }: { icon: React.ReactNode; title: string; to: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg"><span className="text-accent">{icon}</span>{title}</h2>
      <Link to={to} className="text-xs font-medium text-accent hover:underline">Ver tudo</Link>
    </div>
  )
}

function SupplierRow({ s, meta }: { s: SupplierListItem; meta?: string }) {
  return (
    <li>
      <Link to={`/app/fornecedores/${s.slug}`} className="-mx-2 flex items-center gap-3 rounded-fx-md px-2 py-2.5 transition hover:bg-surface-2/60">
        <SupplierLogo name={s.name} url={s.logo_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{s.name}</p>
          <p className="truncate text-xs text-muted">{[s.category?.name, [s.city, s.state].filter(Boolean).join(' / ')].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        {meta ? <span className="hidden text-xs text-muted sm:block">{meta}</span> : s.category && <Badge>{s.category.name}</Badge>}
      </Link>
    </li>
  )
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
        </div>
      ))}
    </div>
  )
}

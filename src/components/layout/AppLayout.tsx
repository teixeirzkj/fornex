import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { RouteOutlet } from '@/components/layout/RouteOutlet'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell, Building2, CreditCard, Heart, History, LayoutDashboard, LayoutGrid, LifeBuoy, LogOut, Menu, Megaphone,
  Search, Shield, Store, Tag, UserRound, X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { FavoritesProvider } from '@/hooks/useFavorites'
import { supabase } from '@/lib/supabase'
import { cn, initials } from '@/lib/utils'
import { Logo } from '@/components/ui/Logo'
import { Badge } from '@/components/ui/Feedback'
import { EASE } from '@/components/ui/motion'

const NAV = [
  { group: 'Principal', items: [
    { to: '/app', label: 'Visão geral', icon: LayoutDashboard, end: true },
    { to: '/app/fornecedores', label: 'Todos os fornecedores', icon: Building2 },
    { to: '/app/categorias', label: 'Categorias', icon: LayoutGrid },
    { to: '/app/favoritos', label: 'Favoritos', icon: Heart },
    { to: '/app/historico', label: 'Histórico', icon: History },
    { to: '/app/atualizacoes', label: 'Atualizações', icon: Megaphone, badge: true },
  ] },
  { group: 'Mercado Livre', items: [
    { to: '/app/lojas', label: 'Minhas lojas', icon: Store },
    { to: '/app/anuncios', label: 'Meus anúncios', icon: Tag },
  ] },
  { group: 'Conta', items: [
    { to: '/app/assinatura', label: 'Minha assinatura', icon: CreditCard },
    { to: '/app/conta', label: 'Minha conta', icon: UserRound },
    { to: '/app/suporte', label: 'Suporte', icon: LifeBuoy },
  ] },
]

/** Quantidade de atualizações não lidas */
function useUnread(userId: string | undefined, pathname: string) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!userId) return
    let active = true
    ;(async () => {
      const [n, r] = await Promise.all([
        supabase.from('notifications').select('id').order('published_at', { ascending: false }).limit(50),
        supabase.from('notification_reads').select('notification_id').eq('user_id', userId),
      ])
      if (!active) return
      const read = new Set((r.data ?? []).map((x) => x.notification_id))
      setCount((n.data ?? []).filter((x) => !read.has(x.id)).length)
    })()
    return () => { active = false }
  }, [userId, pathname])
  return count
}

function SidebarContent({ onNavigate, unread }: { onNavigate?: () => void; unread: number }) {
  const { profile, isAdmin, signOut, subscription } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link to="/app" onClick={onNavigate} aria-label="FORNEX — início"><Logo className="h-7" /></Link>
      </div>
      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted/70">{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink to={it.to} end={it.end} onClick={onNavigate}
                    className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-fx-md px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive ? 'text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg')}>
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span layoutId="app-nav-active" className="absolute inset-0 rounded-fx-md border border-accent/25 bg-accent/10"
                            transition={{ duration: 0.5, ease: EASE }} />
                        )}
                        <it.icon className={cn('relative h-[18px] w-[18px]', isActive && 'text-fornex-ice')} />
                        <span className="relative flex-1">{it.label}</span>
                        {it.badge && unread > 0 && (
                          <span className="relative rounded-full bg-fornex-electric px-1.5 text-[10px] font-semibold leading-4 text-white">{unread}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {isAdmin && (
          <div>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-muted/70">Administração</p>
            <NavLink to="/admin" onClick={onNavigate} className="flex items-center gap-3 rounded-fx-md px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface-2/60 hover:text-fg">
              <Shield className="h-[18px] w-[18px]" /> Painel administrativo
            </NavLink>
          </div>
        )}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-fx-md p-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-fornex-blue to-fornex-electric text-xs font-bold text-white">
            {initials(profile?.full_name || profile?.email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{profile?.full_name || 'Minha conta'}</p>
            <p className="truncate text-xs text-muted">{subscription?.plan?.name ? `Plano ${subscription.plan.name}` : 'Sem plano ativo'}</p>
          </div>
          <button type="button" aria-label="Sair" title="Sair"
            onClick={async () => { await signOut(); navigate('/') }}
            className="rounded-fx-sm p-2 text-muted transition hover:bg-surface-2 hover:text-fg">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const { user, hasActiveSubscription } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const unread = useUnread(user?.id, pathname)
  // Catálogo usa superfície clara para leitura confortável (brand guidelines §6)
  const light = pathname.startsWith('/app/fornecedores')

  useEffect(() => { setOpen(false) }, [pathname])

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    navigate(term ? `/app/fornecedores?q=${encodeURIComponent(term)}` : '/app/fornecedores')
  }

  return (
    <FavoritesProvider>
      <div className="min-h-screen bg-fornex-midnight">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-fornex-navy/60 backdrop-blur lg:block">
          <SidebarContent unread={unread} />
        </aside>

        <AnimatePresence>
          {open && (
            <motion.div key="menu-overlay" className="fixed inset-0 z-50 bg-fornex-midnight/70 backdrop-blur-sm lg:hidden"
              onClick={() => setOpen(false)} aria-hidden
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }}
              transition={{ duration: 0.3 }} />
          )}
          {open && (
            <motion.aside key="menu-drawer" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%', pointerEvents: 'none' }}
              transition={{ duration: 0.4, ease: EASE }}
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-line bg-fornex-navy lg:hidden">
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu"
                  className="absolute right-3 top-4 rounded-fx-sm p-2 text-muted hover:text-fg"><X className="h-5 w-5" /></button>
              <SidebarContent onNavigate={() => setOpen(false)} unread={unread} />
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="lg:pl-64">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-fornex-midnight/80 px-4 backdrop-blur-md sm:px-6">
            <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu"
              className="rounded-fx-sm p-2 text-muted hover:bg-surface-2 hover:text-fg lg:hidden"><Menu className="h-5 w-5" /></button>
            <Link to="/app" className="lg:hidden" aria-label="FORNEX"><Logo symbolOnly className="h-7 w-7" /></Link>
            <form onSubmit={onSearch} className="relative ml-auto w-full max-w-md lg:ml-0" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar fornecedores…" aria-label="Buscar fornecedores"
                className="field h-10 bg-surface/70 pl-9" />
            </form>
            <div className="ml-auto hidden items-center gap-2 sm:flex">
              {!hasActiveSubscription && <Link to="/app/assinatura"><Badge tone="amber">Sem plano ativo</Badge></Link>}
              <Link to="/app/atualizacoes" aria-label="Atualizações" className="relative rounded-fx-sm p-2 text-muted hover:bg-surface-2 hover:text-fg">
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-fornex-blue ring-2 ring-fornex-midnight" />}
              </Link>
            </div>
          </header>

          <main className={cn('min-h-[calc(100vh-4rem)] transition-colors duration-300', light ? 'fx-light bg-bg text-fg' : 'bg-bg')}>
            <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
              {/* Entrada suave e imediata (sem esperar a página anterior sair) */}
              <motion.div key={pathname} className="fx-reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.5, ease: EASE }}>
                <RouteOutlet />
              </motion.div>
            </div>
          </main>
        </div>
      </div>
    </FavoritesProvider>
  )
}

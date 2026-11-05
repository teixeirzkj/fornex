import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, Building, CreditCard, Layers, LayoutDashboard, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen,
  Plug, Receipt, Tags, Upload, Users, X, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Logo } from '@/components/ui/Logo'
import { Badge } from '@/components/ui/Feedback'
import { PageTransition } from '@/components/ui/motion'
import { cn, initials } from '@/lib/utils'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/admin', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/admin/fornecedores', label: 'Fornecedores', icon: Building },
  { to: '/admin/categorias', label: 'Categorias', icon: Tags },
  { to: '/admin/importar', label: 'Importar', icon: Upload },
  { to: '/admin/integracoes', label: 'Integrações', icon: Plug },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/assinaturas', label: 'Assinaturas', icon: Layers },
  { to: '/admin/planos', label: 'Planos', icon: CreditCard },
  { to: '/admin/pagamentos', label: 'Pagamentos', icon: Receipt },
  { to: '/admin/atualizacoes', label: 'Atualizações', icon: Megaphone },
]

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center gap-2 border-b border-line px-4', collapsed && 'justify-center px-2')}>
        <Link to="/admin" onClick={onNavigate} className="flex items-center gap-2">
          {collapsed ? <Logo symbolOnly className="h-8 w-8" /> : <Logo className="h-7" />}
        </Link>
        {!collapsed && <Badge tone="blue" className="ml-auto">Admin</Badge>}
      </div>
      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-3" aria-label="Administração">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} title={collapsed ? label : undefined}
            className={({ isActive }) => cn(
              'group relative flex items-center gap-3 rounded-fx-md px-3 py-2.5 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
              isActive ? 'text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
            )}>
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="admin-nav-active" className="absolute inset-0 rounded-fx-md border border-accent/25 bg-accent/10"
                    transition={{ type: 'spring', stiffness: 260, damping: 32 }} />
                )}
                <Icon className={cn('relative h-[18px] w-[18px] shrink-0', isActive && 'text-accent')} />
                {!collapsed && <span className="relative">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-line p-3">
        <Link to="/app" onClick={onNavigate} title="Ir para o painel do cliente"
          className={cn('flex items-center gap-3 rounded-fx-md px-3 py-2.5 text-sm text-muted transition hover:bg-surface-2/60 hover:text-fg', collapsed && 'justify-center px-0')}>
          <ArrowLeft className="h-[18px] w-[18px]" />{!collapsed && 'Ir para o painel do cliente'}
        </Link>
        <button type="button" title="Sair" onClick={async () => { await signOut(); navigate('/') }}
          className={cn('flex w-full items-center gap-3 rounded-fx-md px-3 py-2.5 text-sm text-muted transition hover:bg-red-500/10 hover:text-red-300', collapsed && 'justify-center px-0')}>
          <LogOut className="h-[18px] w-[18px]" />{!collapsed && 'Sair'}
        </button>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { profile } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('fx-admin-collapsed') === '1' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('fx-admin-collapsed', collapsed ? '1' : '0') } catch { /* sem storage */ }
  }, [collapsed])
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const current = [...NAV].sort((a, b) => b.to.length - a.to.length).find((n) => location.pathname.startsWith(n.to))

  return (
    <div className="min-h-screen bg-bg">
      {/* Sidebar desktop */}
      <motion.aside animate={{ width: collapsed ? 76 : 260 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-y-0 left-0 z-40 hidden border-r border-line bg-fornex-navy/60 backdrop-blur lg:block">
        <SidebarContent collapsed={collapsed} />
      </motion.aside>

      {/* Drawer mobile */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-fornex-midnight/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 left-0 w-[280px] border-r border-line bg-fornex-navy">
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"
                className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-muted hover:text-fg"><X className="h-5 w-5" /></button>
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className={cn('transition-[padding] duration-300 ease-fx', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[260px]')}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"
            className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg lg:hidden"><Menu className="h-5 w-5" /></button>
          <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="hidden rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg lg:block">
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted">Administração</p>
            <p className="truncate text-sm font-semibold text-fg">{current?.label ?? 'Painel'}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-fg">{profile?.full_name || 'Administrador'}</p>
              <p className="text-xs text-muted">{profile?.email}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-fornex-blue to-fornex-electric text-xs font-bold text-white">
              {initials(profile?.full_name || profile?.email)}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  )
}

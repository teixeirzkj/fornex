import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Menu, X } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { ButtonLink } from '@/components/ui/Button'
import { EASE } from '@/components/ui/motion'
import { useAuth } from '@/contexts/AuthContext'
import { BRAND } from '@/lib/config'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/#categorias', label: 'Categorias' },
  { href: '/planos', label: 'Planos' },
  { href: '/#duvidas', label: 'Dúvidas' },
]

function NavAnchor({ href, label, onClick, className }: { href: string; label: string; onClick?: () => void; className?: string }) {
  // Links com âncora (/#secao) usam <a> para permitir rolagem nativa
  if (href.includes('#')) return <a href={href} onClick={onClick} className={className}>{label}</a>
  return <Link to={href} onClick={onClick} className={className}>{label}</Link>
}

export default function PublicLayout() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setOpen(false) }, [location.pathname])

  // Rola até a âncora ao chegar de outra rota
  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [location.pathname, location.hash])

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-bg">
      <header className={cn(
        'sticky top-0 z-50 border-b transition-colors duration-300',
        scrolled || open ? 'border-line bg-fornex-midnight/85 backdrop-blur-xl' : 'border-transparent bg-transparent',
      )}>
        <div className="container-fx flex h-16 items-center justify-between gap-6">
          <Link to="/" aria-label="FORNEX — início" className="shrink-0"><Logo className="h-7" /></Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {NAV.map((n) => (
              <NavAnchor key={n.href} {...n} className="rounded-fx-sm px-3 py-2 text-sm text-muted transition hover:text-fg" />
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {session ? (
              <ButtonLink to="/app" size="sm" icon={<ArrowRight className="h-4 w-4" />} className="flex-row-reverse">Acessar painel</ButtonLink>
            ) : (
              <>
                <ButtonLink to="/entrar" variant="ghost" size="sm">Entrar</ButtonLink>
                <ButtonLink to="/cadastro" size="sm">Começar agora</ButtonLink>
              </>
            )}
          </div>

          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            className="grid h-10 w-10 place-items-center rounded-fx-md border border-line text-fg md:hidden">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.45, ease: EASE }} className="overflow-hidden border-t border-line md:hidden">
              <nav className="container-fx flex flex-col gap-1 py-4" aria-label="Menu móvel">
                {NAV.map((n, i) => (
                  <motion.div key={n.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                    <NavAnchor {...n} onClick={() => setOpen(false)} className="block rounded-fx-md px-3 py-3 text-[15px] text-fg hover:bg-surface" />
                  </motion.div>
                ))}
                <div className="mt-3 grid gap-2">
                  {session ? (
                    <ButtonLink to="/app" className="w-full">Acessar painel</ButtonLink>
                  ) : (
                    <>
                      <ButtonLink to="/cadastro" className="w-full">Começar agora</ButtonLink>
                      <ButtonLink to="/entrar" variant="secondary" className="w-full">Entrar</ButtonLink>
                    </>
                  )}
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1"><Outlet /></main>

      <footer className="border-t border-line bg-fornex-midnight">
        <div className="container-fx grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo className="h-7" />
            <p className="mt-4 max-w-xs text-sm text-muted">{BRAND.tagline} Encontre, organize e contate fornecedores nacionais em um só lugar.</p>
          </div>
          <FooterCol title="Produto" links={[
            { href: '/#como-funciona', label: 'Como funciona' },
            { href: '/#categorias', label: 'Categorias' },
            { href: '/planos', label: 'Planos e preços' },
          ]} />
          <FooterCol title="Conta" links={[
            { href: '/entrar', label: 'Entrar' },
            { href: '/cadastro', label: 'Criar conta' },
            { href: '/recuperar-senha', label: 'Recuperar senha' },
          ]} />
          <div>
            <h4 className="text-sm font-semibold text-fg">Suporte</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><a href="/#duvidas" className="text-muted transition hover:text-fg">Perguntas frequentes</a></li>
              {BRAND.supportEmail && (
                <li><a href={`mailto:${BRAND.supportEmail}`} className="break-all text-muted transition hover:text-fg">{BRAND.supportEmail}</a></li>
              )}
              <li><Link to="/legal/termos" className="text-muted transition hover:text-fg">Termos de uso</Link></li>
              <li><Link to="/legal/privacidade" className="text-muted transition hover:text-fg">Política de privacidade</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="container-fx flex flex-col gap-2 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} FORNEX. Todos os direitos reservados.</span>
            <span>{BRAND.institutional}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-fg">{title}</h4>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href}><NavAnchor {...l} className="text-muted transition hover:text-fg" /></li>
        ))}
      </ul>
    </div>
  )
}

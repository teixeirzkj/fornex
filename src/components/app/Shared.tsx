import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, Lock, MapPin, ShieldCheck } from 'lucide-react'
import { cn, initials, timeAgo } from '@/lib/utils'
import type { SupplierListItem } from '@/types/db'
import { useFavorites } from '@/hooks/useFavorites'
import { useAuth } from '@/contexts/AuthContext'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Badge, Notice } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'
import { EASE } from '@/components/ui/motion'

export function PageHeader({ title, description, actions, eyebrow }: {
  title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div>
        {eyebrow && <p className="mb-1.5 text-xs font-semibold uppercase tracking-[.14em] text-accent">{eyebrow}</p>}
        <h1 className="text-xl font-bold text-fg sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-xs text-muted sm:mt-1.5 sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function SupplierLogo({ name, url, size = 'md' }: { name: string; url: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-10 w-10 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-20 w-20 text-xl' }[size]
  return url ? (
    <img src={url} alt={`Logo ${name}`} loading="lazy" className={cn(s, 'shrink-0 rounded-fx-md border border-line bg-white object-contain p-1')} />
  ) : (
    <div className={cn(s, 'grid shrink-0 place-items-center rounded-fx-md border border-line bg-gradient-to-br from-fornex-blue/15 to-fornex-electric/10 font-heading font-bold text-accent')}>
      {initials(name)}
    </div>
  )
}

export function FavoriteButton({ id, name, className }: { id: string; name?: string; className?: string }) {
  const { isFavorite, toggle } = useFavorites()
  const fav = isFavorite(id)
  return (
    <motion.button type="button" whileTap={{ scale: 0.92 }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggle(id, name) }}
      aria-pressed={fav} aria-label={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={cn('grid h-9 w-9 place-items-center rounded-full border transition-colors',
        fav ? 'border-rose-400/40 bg-rose-500/10 text-rose-500' : 'border-line bg-surface text-muted hover:text-fg', className)}>
      <motion.span key={String(fav)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
        <Heart className={cn('h-4 w-4', fav && 'fill-current')} />
      </motion.span>
    </motion.button>
  )
}

export function SupplierCard({ s, index = 0 }: { s: SupplierListItem; index?: number }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: Math.min(index, 12) * 0.03 }}>
      <Link to={`/app/fornecedores/${s.slug}`}
        className="group card flex h-full flex-col p-3 transition duration-300 ease-fx hover:-translate-y-0.5 hover:border-accent/40 sm:p-4">
        {/* Celular: logo e favorito em cima, nome embaixo (cabe 2 por linha). Telas maiores: tudo em linha. */}
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="sm:hidden"><SupplierLogo name={s.name} url={s.logo_url} size="sm" /></div>
          <div className="hidden sm:block"><SupplierLogo name={s.name} url={s.logo_url} /></div>
          <div className="hidden min-w-0 flex-1 sm:block">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-heading text-[15px] font-bold text-fg">{s.name}</h3>
              {s.is_verified && <ShieldCheck className="h-4 w-4 shrink-0 text-accent" aria-label="Dados conferidos pela equipe" />}
              {s.is_demo && <Badge tone="amber" className="shrink-0">Demonstração</Badge>}
            </div>
            {s.category && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <CategoryIcon name={s.category.icon} className="h-3.5 w-3.5" /> {s.category.name}
              </p>
            )}
          </div>
          <FavoriteButton id={s.id} name={s.name} className="ml-auto h-8 w-8 sm:ml-0 sm:h-9 sm:w-9" />
        </div>
        <div className="mt-2.5 min-w-0 sm:hidden">
          <h3 className="line-clamp-2 font-heading text-[13px] font-bold leading-snug text-fg">
            {s.name}{s.is_verified && <ShieldCheck className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-accent" aria-label="Dados conferidos pela equipe" />}
          </h3>
          {s.category && <p className="mt-0.5 truncate text-[11px] text-muted">{s.category.name}</p>}
          {s.is_demo && <Badge tone="amber" className="mt-1.5 px-1.5 text-[10px]">Demo</Badge>}
        </div>
        <p className="mt-3 line-clamp-2 hidden flex-1 text-sm text-muted sm:block">{s.description || 'Sem descrição cadastrada.'}</p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-muted sm:mt-4 sm:pt-3 sm:text-xs">
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
            <span className="truncate">
              <span className="sm:hidden">{s.state || '—'}</span>
              <span className="hidden sm:inline">{s.city || s.state ? [s.city, s.state].filter(Boolean).join(' / ') : 'Localização não informada'}</span>
            </span>
          </span>
          <span className="hidden shrink-0 sm:inline">Atualizado {timeAgo(s.updated_at)}</span>
        </div>
        {s.tags?.length > 0 && (
          <div className="mt-3 hidden flex-wrap gap-1.5 sm:flex">
            {s.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
          </div>
        )}
      </Link>
    </motion.div>
  )
}

export function SupplierCardSkeleton() {
  return (
    <div className="card p-3 sm:p-4">
      <div className="flex gap-3">
        <div className="h-12 w-12 animate-pulse rounded-fx-md bg-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="mt-5 h-3 w-1/2 animate-pulse rounded bg-surface-2" />
    </div>
  )
}

/** Aviso exibido para quem ainda não tem plano ativo */
export function SubscriptionGate() {
  const { hasActiveSubscription } = useAuth()
  if (hasActiveSubscription) return null
  return (
    <div className="mb-6">
      <Notice tone="warning" title="Ative um plano para acessar os fornecedores"
        action={<ButtonLink to="/app/assinatura" size="sm" icon={<Lock className="h-4 w-4" />}>Ver planos</ButtonLink>}>
        O catálogo e os contatos ficam disponíveis assim que sua assinatura estiver ativa.
      </Notice>
    </div>
  )
}

export function StatCard({ icon, label, value, hint, to }: { icon: ReactNode; label: string; value: ReactNode; hint?: string; to?: string }) {
  const inner = (
    <div className="card group h-full p-3 transition duration-300 ease-fx hover:border-accent/40 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium leading-tight text-muted sm:text-xs">{label}</span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-fx-sm bg-accent/10 text-accent sm:h-8 sm:w-8 [&>svg]:h-3.5 [&>svg]:w-3.5 sm:[&>svg]:h-4 sm:[&>svg]:w-4">{icon}</span>
      </div>
      <div className="mt-2 truncate font-heading text-lg font-bold text-fg sm:mt-3 sm:text-[28px]">{value}</div>
      {hint && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted sm:mt-1 sm:text-xs">{hint}</p>}
    </div>
  )
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner
}

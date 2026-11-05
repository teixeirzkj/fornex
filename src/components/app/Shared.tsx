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
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1.5 text-xs font-semibold uppercase tracking-[.14em] text-accent">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-fg sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
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
        className="group card flex h-full flex-col p-4 transition duration-300 ease-fx hover:-translate-y-0.5 hover:border-accent/40">
        <div className="flex items-start gap-3">
          <SupplierLogo name={s.name} url={s.logo_url} />
          <div className="min-w-0 flex-1">
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
          <FavoriteButton id={s.id} name={s.name} />
        </div>
        <p className="mt-3 line-clamp-2 flex-1 text-sm text-muted">{s.description || 'Sem descrição cadastrada.'}</p>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
          <span className="flex items-center gap-1 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {s.city || s.state ? [s.city, s.state].filter(Boolean).join(' / ') : 'Localização não informada'}
          </span>
          <span className="shrink-0">Atualizado {timeAgo(s.updated_at)}</span>
        </div>
        {s.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
          </div>
        )}
      </Link>
    </motion.div>
  )
}

export function SupplierCardSkeleton() {
  return (
    <div className="card p-4">
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
    <div className="card group h-full p-4 transition duration-300 ease-fx hover:border-accent/40 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-fx-sm bg-accent/10 text-accent [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <div className="mt-3 font-heading text-2xl font-bold text-fg sm:text-[28px]">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner
}

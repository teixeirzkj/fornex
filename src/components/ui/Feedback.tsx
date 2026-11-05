import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Info, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-fx-md bg-surface-2/80', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[.05] to-transparent" />
    </div>
  )
}

export function Spinner({ className, label = 'Carregando' }: { className?: string; label?: string }) {
  return <Loader2 role="status" aria-label={label} className={cn('h-5 w-5 animate-spin text-accent', className)} />
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  )
}

export function EmptyState({ icon, title, description, action, className }: {
  icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex flex-col items-center justify-center rounded-fx-lg border border-dashed border-line px-6 py-14 text-center', className)}>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-fx-md border border-line bg-surface-2 text-accent [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  )
}

export function Notice({ tone = 'info', title, children, action }: {
  tone?: 'info' | 'warning'; title: string; children?: ReactNode; action?: ReactNode
}) {
  const Icon = tone === 'warning' ? AlertTriangle : Info
  return (
    <div className={cn('flex flex-col gap-3 rounded-fx-lg border p-4 sm:flex-row sm:items-center',
      tone === 'warning' ? 'border-amber-500/30 bg-amber-500/[.07]' : 'border-accent/30 bg-accent/[.07]')}>
      <Icon className={cn('h-5 w-5 shrink-0', tone === 'warning' ? 'text-amber-400' : 'text-accent')} />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-fg">{title}</p>
        {children && <div className="mt-0.5 text-muted">{children}</div>}
      </div>
      {action}
    </div>
  )
}

const badgeTones = {
  neutral: 'border-line bg-surface-2/70 text-muted',
  blue: 'border-accent/30 bg-accent/10 text-accent',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  red: 'border-red-500/30 bg-red-500/10 text-red-400',
}
export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', badgeTones[tone], className)}>{children}</span>
}

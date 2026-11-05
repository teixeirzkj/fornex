import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { startCheckout } from '@/lib/checkout'
import { cn, formatBRL } from '@/lib/utils'
import { installmentCents, intervalLabel } from '@/hooks/usePlans'
import { Button } from '@/components/ui/Button'
import { EASE } from '@/components/ui/motion'
import type { Plan } from '@/types/db'

export interface PlanCardProps {
  plan: Plan
  onSelect: (plan: Plan) => void
  loading?: boolean
  currentPlanId?: string | null
  ctaLabel?: string
  className?: string
}

/** Separa "R$" e o valor para exibir o preço em destaque (ex.: R$ | 69,90) */
function splitPrice(cents: number) {
  const s = formatBRL(cents).replace(/ /g, ' ')
  const [, value = s] = s.split('R$ ')
  return value.trim()
}

export function PlanCard({ plan, onSelect, loading, currentPlanId, ctaLabel, className }: PlanCardProps) {
  const isCurrent = currentPlanId === plan.id
  const isFree = plan.interval === 'free'
  const isLifetime = plan.interval === 'lifetime'
  const perInstallment = installmentCents(plan)
  const monthlyEquivalent = plan.interval === 'year' && plan.price_cents > 0 ? Math.round(plan.price_cents / 12) : null
  const label = isCurrent ? 'Plano atual' : ctaLabel ?? plan.cta_label ?? (isFree ? 'Começar grátis' : 'Assinar agora')
  const badge = plan.badge ?? (plan.highlight ? 'Melhor escolha' : null)

  const caption = isFree ? 'Sem cartão de crédito'
    : perInstallment ? `no cartão · total ${formatBRL(plan.price_cents)}`
    : monthlyEquivalent ? `Equivale a ${formatBRL(monthlyEquivalent)} por mês`
    : isLifetime ? 'Pagamento único'
    : plan.interval === 'month' ? 'Cobrança mensal' : 'Cobrança anual'

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.45, ease: EASE }}
      className={cn(
        'card-hover relative flex h-full flex-col rounded-fx-lg border bg-surface p-6 text-center shadow-card sm:p-7',
        plan.highlight ? 'border-accent/60 ring-1 ring-accent/30' : 'border-line',
        className,
      )}
    >
      {plan.highlight && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-fx-lg bg-gradient-to-b from-fornex-blue/10 to-transparent" />
      )}
      {badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-fornex-electric px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-cta">
          {badge}
        </span>
      )}
      <h3 className="relative font-heading text-xl font-bold text-fg">{plan.name}</h3>
      {plan.description && <p className="relative mt-1 text-sm text-muted">{plan.description}</p>}

      <div className="relative mt-7 flex min-h-[104px] flex-col items-center justify-center">
        {perInstallment && <span className="text-sm font-semibold text-fornex-ice">{plan.installments}x de</span>}
        <div className="flex items-start justify-center gap-1.5">
          <span className="mt-2 text-sm font-medium text-muted">R$</span>
          <span className="font-heading text-5xl font-extrabold tracking-tight text-fg">
            {isFree ? '0' : splitPrice(perInstallment ?? plan.price_cents)}
          </span>
          {!isFree && !perInstallment && !isLifetime && <span className="mt-auto pb-2 text-sm text-muted">{intervalLabel(plan.interval)}</span>}
        </div>
        <p className="mt-1 text-xs text-muted">{caption}</p>
      </div>

      <Button
        className="relative mt-6 w-full"
        size="lg"
        variant={plan.highlight ? 'primary' : 'secondary'}
        loading={loading}
        disabled={isCurrent}
        onClick={() => onSelect(plan)}
      >
        {label}
      </Button>

      {plan.features.length > 0 && (
        <div className="relative mt-7 border-t border-line pt-6 text-left">
          <p className="mb-4 text-center text-sm font-semibold text-fg">{plan.features_title || 'O plano inclui:'}</p>
          <ul className="divide-y divide-line/70">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-3 py-2.5 text-sm text-fg/90">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  )
}

/**
 * Fluxo de contratação compartilhado (site público e /app/assinatura).
 * Não logado → cadastro com o plano escolhido. Logado → checkout.
 */
export function usePlanCheckout() {
  const { session, refresh } = useAuth()
  const navigate = useNavigate()
  const [pendingSlug, setPendingSlug] = useState<string | null>(null)

  async function select(plan: Plan) {
    if (!session) {
      navigate(`/cadastro?plano=${encodeURIComponent(plan.slug)}`)
      return
    }
    setPendingSlug(plan.slug)
    try {
      const res = await startCheckout(plan)
      if (res.kind === 'route') {
        navigate(res.to)
        return
      }
      if (res.kind === 'redirect') {
        window.location.assign(res.url)
        return
      }
      if (res.kind === 'activated') {
        toast.success('Plano ativado! Bem-vindo à FORNEX.')
        await refresh()
        navigate('/app')
        return
      }
      toast.error(res.message)
    } finally {
      setPendingSlug(null)
    }
  }

  return { select, pendingSlug }
}

import { CreditCard } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePlans } from '@/hooks/usePlans'
import { isSupabaseConfigured } from '@/lib/supabase'
import { PlanCard, usePlanCheckout } from '@/components/plans/PlanCard'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Reveal } from '@/components/ui/motion'
import { cn } from '@/lib/utils'

/** Grade de planos carregada do banco (tabela plans) */
export function PlansGrid() {
  const { plans, loading, error } = usePlans()
  const { subscription } = useAuth()
  const { select, pendingSlug } = usePlanCheckout()

  if (!isSupabaseConfigured || error || (!loading && plans.length === 0)) {
    return (
      <EmptyState icon={<CreditCard />} title="Planos em breve"
        description={error ?? 'Os planos de acesso serão exibidos aqui assim que forem publicados.'} />
    )
  }

  if (loading) {
    return (
      <div className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[420px] rounded-fx-lg" />)}
      </div>
    )
  }

  return (
    <div className={cn('mx-auto grid gap-5', plans.length === 1 ? 'max-w-sm' : plans.length === 2 ? 'max-w-3xl md:grid-cols-2' : 'md:grid-cols-3')}>
      {plans.map((plan, i) => (
        <Reveal key={plan.id} delay={i * 0.06} className="h-full">
          <PlanCard plan={plan} onSelect={select} loading={pendingSlug === plan.slug}
            currentPlanId={subscription?.status === 'active' ? subscription.plan_id : null} />
        </Reveal>
      ))}
    </div>
  )
}

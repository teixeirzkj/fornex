import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarClock, CreditCard, Receipt, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { callFunction, FunctionError } from '@/lib/api'
import { startCheckout } from '@/lib/checkout'
import { useAuth } from '@/contexts/AuthContext'
import { usePlans, intervalLabel, installmentCents } from '@/hooks/usePlans'
import { formatBRL, formatDate } from '@/lib/utils'
import type { Payment, Plan, SubscriptionStatus } from '@/types/db'
import { PageHeader } from '@/components/app/Shared'
import { PlanCard } from '@/components/plans/PlanCard'
import { Button } from '@/components/ui/Button'
import { Badge, EmptyState, Notice, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'

const STATUS: Record<SubscriptionStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' | 'blue' }> = {
  active: { label: 'Ativa', tone: 'green' },
  pending: { label: 'Aguardando pagamento', tone: 'amber' },
  past_due: { label: 'Pagamento pendente', tone: 'amber' },
  paused: { label: 'Pausada', tone: 'neutral' },
  canceled: { label: 'Cancelada', tone: 'red' },
  expired: { label: 'Expirada', tone: 'red' },
}
const PAYMENT_STATUS: Record<Payment['status'], { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
  approved: { label: 'Aprovado', tone: 'green' }, pending: { label: 'Pendente', tone: 'amber' }, in_process: { label: 'Em análise', tone: 'amber' },
  rejected: { label: 'Recusado', tone: 'red' }, refunded: { label: 'Estornado', tone: 'neutral' }, canceled: { label: 'Cancelado', tone: 'neutral' },
}
const GATEWAY = { none: 'Plano gratuito', manual: 'Liberação manual', mercadopago: 'Mercado Pago', stripe: 'Stripe' }

export default function SubscriptionPage() {
  const { user, subscription, hasActiveSubscription, refresh } = useAuth()
  const { plans, loading: plansLoading } = usePlans()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const autoStarted = useRef(false)
  const returning = params.get('checkout') === 'retorno'
  const hasLifetime = hasActiveSubscription && subscription?.plan?.interval === 'lifetime'

  useEffect(() => {
    if (!user) return
    supabase.from('payments').select('id, user_id, subscription_id, gateway, gateway_payment_id, amount_cents, currency, status, description, paid_at, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setPayments((data as Payment[]) ?? []); setLoadingPayments(false) })
  }, [user, subscription?.status])

  // Retorno do checkout: o status real chega pelo webhook; atualiza por até 1 minuto
  useEffect(() => {
    // Também aguarda no upgrade Básico → Vitalício (já existe assinatura ativa)
    if (!returning || hasLifetime) return
    let n = 0
    const t = setInterval(() => { n++; void refresh(); if (n >= 12) clearInterval(t) }, 5000)
    return () => clearInterval(t)
  }, [returning, hasLifetime, refresh])

  const choose = async (plan: Plan) => {
    setBusyPlan(plan.id)
    const res = await startCheckout(plan)
    if (res.kind === 'route') { navigate(res.to); return }
    if (res.kind === 'redirect') { window.location.assign(res.url); return }
    setBusyPlan(null)
    if (res.kind === 'activated') {
      toast.success(`Plano ${plan.name} ativado!`)
      await refresh()
      navigate('/app')
    } else toast.error(res.message)
  }

  // Vindo de /planos ou do cadastro com ?plano=slug
  useEffect(() => {
    const slug = params.get('plano')
    if (!slug || plansLoading || autoStarted.current) return
    autoStarted.current = true
    setParams((p) => { const n = new URLSearchParams(p); n.delete('plano'); return n }, { replace: true })
    const plan = plans.find((p) => p.slug === slug)
    if (plan && (!hasActiveSubscription || (plan.interval === 'lifetime' && !hasLifetime))) void choose(plan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, plansLoading, plans, hasActiveSubscription])

  const cancel = async () => {
    try {
      if (subscription?.gateway === 'none') {
        const { error } = await supabase.rpc('cancel_my_free_subscription')
        if (error) throw error
      } else {
        await callFunction('manage-subscription', { action: 'cancel' })
      }
      toast.success('Assinatura cancelada', {
        description: subscription?.current_period_end ? `Seu acesso continua até ${formatDate(subscription.current_period_end)}.` : undefined,
      })
      await refresh()
    } catch (e) {
      const code = (e as FunctionError).code
      toast.error(code === 'contact_support' || code === 'function_unavailable'
        ? 'Para cancelar este plano, fale com o suporte.' : 'Não foi possível cancelar. Tente novamente.')
    }
  }

  const sub = subscription
  const isLifetime = sub?.plan?.interval === 'lifetime'
  const st = sub ? STATUS[sub.status] : null
  // Com assinatura ativa, só mostra upgrade para o vitalício; vitalício não vê outros planos
  const otherPlans = isLifetime && hasActiveSubscription ? []
    : plans.filter((p) => (p.id !== sub?.plan_id || sub?.status === 'pending') && (!hasActiveSubscription || p.interval === 'lifetime'))

  return (
    <div>
      <PageHeader eyebrow="Conta" title="Minha assinatura" description="Gerencie seu plano, renovação e histórico de pagamentos." />

      {returning && !hasLifetime && (
        <div className="mb-6">
          <Notice title="Estamos confirmando seu pagamento">
            Assim que o Mercado Pago aprovar, seu acesso é liberado automaticamente. Isso costuma levar poucos instantes.
          </Notice>
        </div>
      )}

      <section className="card p-5 sm:p-6">
        {!sub ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-fx-md bg-accent/10 text-accent"><CreditCard className="h-5 w-5" /></span>
              <div>
                <h2 className="font-heading text-lg font-bold text-fg">Nenhum plano ativo</h2>
                <p className="text-sm text-muted">Escolha um plano abaixo para liberar a central de fornecedores.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-xl font-bold text-fg">Plano {sub.plan?.name ?? '—'}</h2>
                {st && <Badge tone={st.tone}>{st.label}</Badge>}
                {sub.cancel_at_period_end && sub.status === 'active' && <Badge tone="amber">Não será renovada</Badge>}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted">Valor</dt>
                  <dd className="mt-0.5 font-medium text-fg">{!sub.plan ? '—' : !sub.plan.price_cents ? 'Gratuito'
                    : installmentCents(sub.plan) ? `${sub.plan.installments}x de ${formatBRL(installmentCents(sub.plan))} (pagamento único)`
                    : `${formatBRL(sub.plan.price_cents)} ${intervalLabel(sub.plan.interval)}`}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{isLifetime ? 'Validade' : sub.cancel_at_period_end ? 'Acesso até' : 'Próxima renovação'}</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-fg"><CalendarClock className="h-4 w-4 text-muted" />{isLifetime ? 'Acesso vitalício' : sub.current_period_end ? formatDate(sub.current_period_end) : 'Sem vencimento'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Forma de cobrança</dt>
                  <dd className="mt-0.5 font-medium text-fg">{GATEWAY[sub.gateway]}</dd>
                </div>
              </dl>
              {sub.status === 'pending' && (
                <p className="mt-4 text-sm text-muted">O pagamento ainda não foi confirmado. Se você não concluiu o checkout, escolha o plano novamente abaixo.</p>
              )}
            </div>
            {sub.status === 'active' && !sub.cancel_at_period_end && sub.gateway !== 'manual' && !isLifetime && (
              <Button variant="secondary" onClick={() => setConfirmCancel(true)}>Cancelar assinatura</Button>
            )}
          </div>
        )}
      </section>

      {!hasLifetime && <section className="mt-8">
        <h2 className="mb-4 font-heading text-lg font-bold text-fg">{hasActiveSubscription ? 'Faça upgrade para o acesso vitalício' : 'Escolha seu plano'}</h2>
        {plansLoading ? (
          <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80" />)}</div>
        ) : otherPlans.length === 0 ? (
          <p className="text-sm text-muted">Nenhum outro plano disponível no momento.</p>
        ) : (
          <>
            <div className={otherPlans.length === 1 ? 'max-w-md' : 'grid gap-4 md:grid-cols-2 lg:max-w-4xl'}>
              {otherPlans.map((p) => (
                <PlanCard key={p.id} plan={p} loading={busyPlan === p.id} currentPlanId={hasActiveSubscription ? sub?.plan_id : undefined}
                  ctaLabel={hasActiveSubscription ? 'Fazer upgrade' : undefined}
                  onSelect={() => {
                    void choose(p)
                  }} />
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4" /> Pagamento processado pelo Mercado Pago. Seus dados de cartão não passam pela FORNEX.</p>
          </>
        )}
      </section>}

      <section className="mt-8">
        <h2 className="mb-4 font-heading text-lg font-bold text-fg">Histórico de pagamentos</h2>
        {loadingPayments ? <Skeleton className="h-32" /> : payments.length === 0 ? (
          <EmptyState icon={<Receipt />} title="Nenhum pagamento registrado" description="Os pagamentos confirmados aparecerão aqui." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr><th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Descrição</th><th className="px-4 py-3 font-medium">Valor</th><th className="px-4 py-3 font-medium">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-muted">{formatDate(p.paid_at ?? p.created_at)}</td>
                    <td className="px-4 py-3 text-fg">{p.description || GATEWAY[p.gateway]}</td>
                    <td className="px-4 py-3 font-medium text-fg">{formatBRL(p.amount_cents)}</td>
                    <td className="px-4 py-3"><Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog open={confirmCancel} onClose={() => setConfirmCancel(false)} onConfirm={cancel} confirmLabel="Cancelar assinatura"
        title="Cancelar assinatura?"
        description={sub?.current_period_end
          ? `A renovação automática será interrompida. Você mantém o acesso até ${formatDate(sub.current_period_end)}.`
          : 'Seu acesso aos fornecedores será encerrado.'} />
    </div>
  )
}

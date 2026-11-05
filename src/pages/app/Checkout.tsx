import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, CircleCheck, CircleX, Copy, Loader2, Lock, QrCode, RefreshCw, ShieldCheck } from 'lucide-react'
import { CardPayment, Payment, initMercadoPago } from '@mercadopago/sdk-react'
import { toast } from 'sonner'
import { callFunction, FunctionError } from '@/lib/api'
import { MP_PUBLIC_KEY } from '@/lib/config'
import { copyToClipboard, formatBRL } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { installmentCents, usePlans } from '@/hooks/usePlans'
import type { Plan } from '@/types/db'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState, Notice, Skeleton } from '@/components/ui/Feedback'
import { EASE } from '@/components/ui/motion'

initMercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' })

type Phase =
  | { kind: 'form' }
  | { kind: 'pix'; paymentId: string; qr: string | null; qrBase64: string | null; expiresAt: string | null }
  | { kind: 'approved' }
  | { kind: 'review' }
  | { kind: 'rejected'; message: string }

interface ProcessResult {
  payment_id?: string; subscription_id?: string; status: string; status_detail?: string; message?: string
  pix?: { qr_code: string | null; qr_code_base64: string | null; ticket_url: string | null; expires_at: string | null }
}

/** Aparência dos Bricks alinhada à marca FORNEX */
const BRICK_VISUAL = {
  style: {
    theme: 'dark' as const,
    customVariables: {
      baseColor: '#155EEF',
      formBackgroundColor: '#101D33',
      inputBackgroundColor: '#080F1D',
      outlinePrimaryColor: '#3B82F6',
      borderRadiusMedium: '12px',
      borderRadiusLarge: '18px',
      fontSizeMedium: '15px',
    },
  },
  hideFormTitle: true,
}

export default function Checkout() {
  const { slug } = useParams()
  const { plans, loading } = usePlans()
  const { user, subscription, hasActiveSubscription } = useAuth()
  const plan = plans.find((p) => p.slug === slug)

  if (loading) return <div className="grid gap-5 lg:grid-cols-[360px_1fr]"><Skeleton className="h-72" /><Skeleton className="h-96" /></div>
  if (!plan || plan.interval === 'free') {
    return <EmptyState icon={<CircleX />} title="Plano não encontrado" description="Escolha um plano disponível."
      action={<ButtonLink to="/app/assinatura">Ver planos</ButtonLink>} />
  }
  const hasLifetime = hasActiveSubscription && subscription?.plan?.interval === 'lifetime'
  const blocked = hasLifetime || (hasActiveSubscription && plan.interval !== 'lifetime')
  if (blocked) return <Navigate to="/app/assinatura" replace />

  return <CheckoutView plan={plan} email={user?.email ?? ''} upgrade={hasActiveSubscription} />
}

function CheckoutView({ plan, email, upgrade }: { plan: Plan; email: string; upgrade: boolean }) {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [brickKey, setBrickKey] = useState(0)
  const [brickReady, setBrickReady] = useState(false)
  const isLifetime = plan.interval === 'lifetime'
  const perInstallment = installmentCents(plan)
  const amount = plan.price_cents / 100

  // Chave de idempotência por tentativa (evita cobrança dupla em clique duplo)
  const idemKey = useMemo(() => crypto.randomUUID(), [brickKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(method: 'card' | 'pix', formData: Record<string, unknown>) {
    try {
      const res = await callFunction<ProcessResult>('process-payment', {
        plan_slug: plan.slug,
        idempotency_key: idemKey,
        payment: {
          method,
          token: formData.token,
          payment_method_id: formData.payment_method_id,
          issuer_id: formData.issuer_id,
          installments: formData.installments,
          payer: formData.payer,
        },
      })
      if (res.pix && res.payment_id) {
        setPhase({ kind: 'pix', paymentId: res.payment_id, qr: res.pix.qr_code, qrBase64: res.pix.qr_code_base64, expiresAt: res.pix.expires_at })
      } else if (res.status === 'approved') {
        await refresh()
        setPhase({ kind: 'approved' })
      } else if (res.status === 'in_process' || res.status === 'pending') {
        setPhase({ kind: 'review' })
      } else {
        setPhase({ kind: 'rejected', message: res.message ?? 'Pagamento recusado. Tente outro cartão ou o Pix.' })
      }
    } catch (e) {
      const err = e as FunctionError
      setPhase({ kind: 'rejected', message: err.message || 'Não foi possível concluir o pagamento.' })
    }
  }

  const retry = () => { setBrickReady(false); setBrickKey((k) => k + 1); setPhase({ kind: 'form' }) }

  return (
    <div>
      <Link to="/app/assinatura" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Voltar aos planos
      </Link>

      <div className="grid items-start gap-5 lg:grid-cols-[340px_1fr]">
        {/* Resumo do pedido */}
        <aside className="card p-5 lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-accent">{upgrade ? 'Upgrade' : 'Seu plano'}</p>
          <h1 className="mt-1.5 font-heading text-2xl font-bold text-fg">Plano {plan.name}</h1>
          {plan.description && <p className="mt-1 text-sm text-muted">{plan.description}</p>}
          <div className="mt-5 rounded-fx-md border border-line bg-bg/50 p-4">
            {perInstallment ? (
              <>
                <p className="text-sm text-muted">Até {plan.installments}x de</p>
                <p className="font-heading text-3xl font-extrabold text-fg">{formatBRL(perInstallment)}</p>
                <p className="mt-1 text-xs text-muted">Total {formatBRL(plan.price_cents)} · ou à vista no Pix · pagamento único</p>
              </>
            ) : (
              <>
                <p className="font-heading text-3xl font-extrabold text-fg">{formatBRL(plan.price_cents)}<span className="text-base font-medium text-muted">/mês</span></p>
                <p className="mt-1 text-xs text-muted">Cobrado no cartão todo mês. Cancele quando quiser.</p>
              </>
            )}
          </div>
          {plan.features.length > 0 && (
            <ul className="mt-5 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-fg/90">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{f}
                </li>
              ))}
            </ul>
          )}
          {upgrade && isLifetime && (
            <p className="mt-5 rounded-fx-md border border-accent/25 bg-accent/[.07] p-3 text-xs text-muted">
              Ao confirmar o pagamento, sua mensalidade atual é cancelada automaticamente.
            </p>
          )}
          <p className="mt-5 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            Pagamento processado pelo Mercado Pago. Os dados do cartão não passam pela FORNEX.
          </p>
        </aside>

        {/* Pagamento */}
        <section className="card min-h-[420px] p-3 sm:p-5">
          <AnimatePresence mode="wait">
            {phase.kind === 'form' && (
              <motion.div key={`form-${brickKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <h2 className="mb-1 flex items-center gap-2 px-1 text-sm font-semibold text-fg"><Lock className="h-4 w-4 text-accent" />Pagamento seguro</h2>
                <p className="mb-4 px-1 text-xs text-muted">{isLifetime ? 'Cartão de crédito em até 12x ou Pix.' : 'Cartão de crédito, com renovação automática mensal.'}</p>
                {!brickReady && <div className="space-y-3 px-1"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12 w-1/2" /></div>}
                {isLifetime ? (
                  <Payment key={brickKey}
                    initialization={{ amount, payer: { email } }}
                    customization={{
                      paymentMethods: { creditCard: 'all', bankTransfer: 'all', maxInstallments: plan.installments || 1 },
                      visual: BRICK_VISUAL,
                    }}
                    onReady={() => setBrickReady(true)}
                    onError={(e) => { console.error(e); setBrickReady(true) }}
                    onSubmit={async ({ selectedPaymentMethod, formData }) => {
                      const method = selectedPaymentMethod === 'bank_transfer' ? 'pix' : 'card'
                      await submit(method, formData as unknown as Record<string, unknown>)
                    }} />
                ) : (
                  <CardPayment key={brickKey}
                    initialization={{ amount, payer: { email } }}
                    customization={{ paymentMethods: { maxInstallments: 1, types: { excluded: ['debit_card'] } }, visual: BRICK_VISUAL }}
                    onReady={() => setBrickReady(true)}
                    onError={(e) => { console.error(e); setBrickReady(true) }}
                    onSubmit={async (formData) => { await submit('card', formData as unknown as Record<string, unknown>) }} />
                )}
              </motion.div>
            )}

            {phase.kind === 'pix' && (
              <PixPanel key="pix" phase={phase} onApproved={async () => { await refresh(); setPhase({ kind: 'approved' }) }} onRetry={retry} />
            )}

            {phase.kind === 'approved' && (
              <Result key="ok" icon={<CircleCheck className="h-8 w-8" />} tone="green" title="Pagamento aprovado!"
                text={isLifetime ? 'Seu acesso vitalício está liberado. Bem-vindo à FORNEX.' : 'Sua assinatura está ativa. A renovação é automática todo mês.'}
                action={<Button size="lg" onClick={() => navigate('/app/fornecedores')}>Ver fornecedores</Button>} />
            )}

            {phase.kind === 'review' && (
              <Result key="review" icon={<Loader2 className="h-8 w-8 animate-spin" />} tone="blue" title="Pagamento em análise"
                text="O Mercado Pago está analisando o pagamento. Isso costuma levar poucos minutos. Você recebe um aviso em Atualizações assim que for aprovado."
                action={<ButtonLink to="/app/assinatura" variant="secondary">Acompanhar em Minha assinatura</ButtonLink>} />
            )}

            {phase.kind === 'rejected' && (
              <Result key="rejected" icon={<CircleX className="h-8 w-8" />} tone="red" title="Pagamento não aprovado"
                text={phase.message}
                action={<Button size="lg" onClick={retry} icon={<RefreshCw className="h-4 w-4" />}>Tentar novamente</Button>} />
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  )
}

function PixPanel({ phase, onApproved, onRetry }: {
  phase: Extract<Phase, { kind: 'pix' }>; onApproved: () => Promise<void>; onRetry: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [expired, setExpired] = useState(false)
  const done = useRef(false)

  // Consulta o status no servidor (que confirma direto com o Mercado Pago)
  useEffect(() => {
    let stop = false
    const tick = async () => {
      if (stop || done.current) return
      try {
        const r = await callFunction<{ status: string }>('payment-status', { payment_id: phase.paymentId })
        if (r.status === 'approved') { done.current = true; await onApproved(); return }
        if (r.status === 'cancelled' || r.status === 'rejected') { setExpired(true); return }
      } catch { /* tenta de novo no próximo ciclo */ }
      if (phase.expiresAt && Date.now() > new Date(phase.expiresAt).getTime()) { setExpired(true); return }
      setTimeout(tick, 4000)
    }
    const t = setTimeout(tick, 4000)
    return () => { stop = true; clearTimeout(t) }
  }, [phase.paymentId, phase.expiresAt, onApproved])

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}
      className="flex flex-col items-center px-2 py-4 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-fx-md bg-accent/10 text-accent"><QrCode className="h-5 w-5" /></span>
      <h2 className="mt-3 font-heading text-xl font-bold text-fg">Pague com Pix</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">Abra o app do seu banco, escolha Pix e escaneie o QR Code ou use o código copia e cola.</p>
      {expired ? (
        <div className="mt-6">
          <Notice tone="warning" title="Este Pix expirou">Gere um novo para continuar.</Notice>
          <Button className="mt-4" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>Gerar novo Pix</Button>
        </div>
      ) : (
        <>
          {phase.qrBase64 && (
            <img src={`data:image/png;base64,${phase.qrBase64}`} alt="QR Code do Pix" width={220} height={220}
              className="mt-5 rounded-fx-md bg-white p-2.5" />
          )}
          {phase.qr && (
            <div className="mt-5 w-full max-w-md">
              <div className="truncate rounded-fx-md border border-line bg-bg/60 px-3 py-2.5 text-left font-mono text-xs text-muted">{phase.qr}</div>
              <Button className="mt-2.5 w-full" variant={copied ? 'subtle' : 'primary'}
                icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                onClick={async () => {
                  if (await copyToClipboard(phase.qr!)) { setCopied(true); toast.success('Código Pix copiado'); setTimeout(() => setCopied(false), 2500) }
                }}>
                {copied ? 'Copiado!' : 'Copiar código Pix'}
              </Button>
            </div>
          )}
          <p className="mt-5 flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando o pagamento. Esta tela atualiza sozinha.
          </p>
          <p className="mt-1 text-[11px] text-muted">O código vale por 30 minutos.</p>
        </>
      )}
    </motion.div>
  )
}

function Result({ icon, title, text, action, tone }: { icon: React.ReactNode; title: string; text: string; action: React.ReactNode; tone: 'green' | 'red' | 'blue' }) {
  const tones = { green: 'bg-emerald-500/10 text-emerald-400', red: 'bg-red-500/10 text-red-400', blue: 'bg-accent/10 text-accent' }
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}
      className="flex flex-col items-center px-4 py-12 text-center">
      <span className={`grid h-16 w-16 place-items-center rounded-full ${tones[tone]}`}>{icon}</span>
      <h2 className="mt-5 font-heading text-2xl font-bold text-fg">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted">{text}</p>
      <div className="mt-7">{action}</div>
    </motion.div>
  )
}

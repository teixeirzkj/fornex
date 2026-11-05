import { Check, Minus } from 'lucide-react'
import { usePlans } from '@/hooks/usePlans'
import { formatBRL } from '@/lib/utils'
import { PlansGrid } from '@/components/public/PlansGrid'
import { Faq, type FaqItem } from '@/components/public/Faq'
import { PageTransition, Reveal } from '@/components/ui/motion'

const BILLING_FAQ: FaqItem[] = [
  { q: 'Como funciona a cobrança?', a: 'O plano Básico é uma assinatura mensal cobrada automaticamente pelo Mercado Pago. O plano Vitalício é um pagamento único, que pode ser parcelado em até 12x no cartão, sem mensalidades depois.' },
  { q: 'O que significa acesso vitalício?', a: 'Você paga uma única vez e mantém o acesso à plataforma enquanto ela estiver em operação, sem renovação ou mensalidade.' },
  { q: 'Posso cancelar o plano Básico a qualquer momento?', a: 'Sim. Em "Minha assinatura", no painel, você cancela em poucos cliques. Não há multa: o acesso permanece até o fim do mês já pago e não há novas cobranças.' },
  { q: 'A renovação do plano Básico é automática?', a: 'Sim. A cada mês a assinatura é renovada automaticamente no mesmo cartão, até que você a cancele.' },
  { q: 'Posso mudar de plano?', a: 'Sim. Para trocar de plano, cancele o atual e contrate o novo, ou fale com o suporte para ajustarmos a mudança sem perder dias de acesso.' },
  { q: 'Onde vejo meus pagamentos?', a: 'No painel, em "Minha assinatura", você encontra o status do plano, a data de renovação e o histórico de pagamentos.' },
  { q: 'Qual a diferença entre os planos?', a: 'O Básico libera os fornecedores do plano Básico e é cobrado todo mês. O Vitalício libera todos os fornecedores, inclusive os exclusivos, com um pagamento único.' },
]

export default function Pricing() {
  return (
    <PageTransition>
      <section className="relative overflow-hidden pb-16 pt-16 sm:pt-20">
        <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_65%)]" />
        <div className="container-fx relative">
          <div className="mx-auto max-w-2xl text-center">
            <span className="eyebrow">Planos e preços</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight text-white sm:text-5xl">Um plano para cada momento</h1>
            <p className="mt-4 text-muted">Pague por mês e cancele quando quiser, ou garanta o acesso vitalício de uma vez.</p>
          </div>
          <div className="mt-14"><PlansGrid /></div>
        </div>
      </section>

      <Comparison />

      <section className="py-20">
        <div className="container-fx max-w-3xl">
          <Reveal className="text-center">
            <span className="eyebrow">Cobrança</span>
            <h2 className="mt-4 text-3xl font-extrabold text-fg">Dúvidas sobre pagamento</h2>
          </Reveal>
          <Reveal className="mt-10"><Faq items={BILLING_FAQ} /></Reveal>
        </div>
      </section>
    </PageTransition>
  )
}

/** Tabela comparativa gerada a partir dos recursos cadastrados em cada plano */
function Comparison() {
  const { plans } = usePlans()
  if (plans.length < 2) return null
  // Planos no formato "Tudo do plano X, mais:" já se comparam pelos próprios cards
  if (plans.some((p) => p.features_title?.toLowerCase().startsWith('tudo do'))) return null
  const features = Array.from(new Set(plans.flatMap((p) => p.features)))
  if (features.length === 0) return null

  return (
    <section className="py-12">
      <div className="container-fx">
        <Reveal className="text-center">
          <h2 className="text-2xl font-extrabold text-fg sm:text-3xl">Compare os planos</h2>
        </Reveal>
        <Reveal className="mt-8">
          <div className="scrollbar-thin overflow-x-auto rounded-fx-lg border border-line bg-surface">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-5 py-4 text-left font-semibold text-muted">Recurso</th>
                  {plans.map((p) => (
                    <th key={p.id} className="px-5 py-4 text-center">
                      <div className="font-bold text-fg">{p.name}</div>
                      <div className="mt-0.5 text-xs font-normal text-muted">{p.interval === 'free' ? 'Grátis' : formatBRL(p.price_cents)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((f) => (
                  <tr key={f} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3.5 text-fg/90">{f}</td>
                    {plans.map((p) => (
                      <td key={p.id} className="px-5 py-3.5 text-center">
                        {p.features.includes(f)
                          ? <Check className="mx-auto h-4 w-4 text-accent" aria-label="Incluído" />
                          : <Minus className="mx-auto h-4 w-4 text-muted/50" aria-label="Não incluído" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

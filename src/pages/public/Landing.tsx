import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight, Bell, Building2, Clock, FileSpreadsheet, Filter, Headphones, Heart, LayoutDashboard, Layers,
  MapPin, Plug, RefreshCw, Search, ShieldCheck, Store, Webhook, Zap,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { formatNumber } from '@/lib/utils'
import { ButtonLink } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Skeleton } from '@/components/ui/Feedback'
import { EASE, fadeUp, Reveal, stagger } from '@/components/ui/motion'
import { Faq, type FaqItem } from '@/components/public/Faq'
import { PlansGrid } from '@/components/public/PlansGrid'
import type { Category, PublicStats } from '@/types/db'

export const LANDING_FAQ: FaqItem[] = [
  { q: 'O que é a FORNEX?', a: 'É uma plataforma de acesso a fornecedores nacionais. Você encontra empresas por categoria e região, consulta contatos, condições comerciais e produtos, e organiza tudo em favoritos e histórico.' },
  { q: 'Preciso ter CNPJ para usar?', a: 'Não para acessar a plataforma. Alguns fornecedores, porém, só vendem para empresas. Isso aparece nas condições comerciais de cada um.' },
  { q: 'Como os fornecedores são cadastrados?', a: 'Pela nossa equipe, por planilhas enviadas pelos próprios fornecedores ou por integração direta com o sistema deles, quando disponível. Cada ficha mostra a data da última atualização.' },
  { q: 'A FORNEX vende os produtos?', a: 'Não. A negociação, a compra e a entrega acontecem diretamente entre você e o fornecedor. A FORNEX facilita a busca, a organização e o contato.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim. O plano Básico é cancelado no próprio painel, em "Minha assinatura", e o acesso continua até o fim do mês já pago. O plano Vitalício é pagamento único, sem mensalidades.' },
  { q: 'Quais formas de pagamento são aceitas?', a: 'Os pagamentos são processados pelo Mercado Pago, com as formas disponíveis no checkout no momento da contratação.' },
]

const BENEFITS = [
  { icon: Search, title: 'Busca objetiva', text: 'Pesquise por nome, categoria e estado. Encontre o fornecedor certo sem perder horas.' },
  { icon: Building2, title: 'Fichas completas', text: 'Contato, WhatsApp, site, redes sociais, pedido mínimo e condições comerciais em um só lugar.' },
  { icon: Heart, title: 'Organização', text: 'Favoritos e histórico de visualizações para retomar negociações rapidamente.' },
  { icon: RefreshCw, title: 'Dados atualizados', text: 'Cada ficha mostra quando foi atualizada. Fornecedores integrados sincronizam automaticamente.' },
]

const STEPS = [
  { icon: Zap, title: 'Crie sua conta', text: 'Leva menos de um minuto. O painel abre na hora.' },
  { icon: Layers, title: 'Escolha seu plano', text: 'Básico por R$ 69,90 ao mês ou Vitalício em 12x, pago uma única vez.' },
  { icon: Filter, title: 'Encontre fornecedores', text: 'Filtre por categoria e região e compare as condições de cada um.' },
  { icon: Store, title: 'Negocie direto', text: 'Fale com o fornecedor pelo canal que preferir e comece a vender.' },
]

const DIFFERENTIALS = [
  { icon: ShieldCheck, title: 'Privacidade por padrão', text: 'Seus favoritos, buscas e histórico são visíveis apenas para você.' },
  { icon: Plug, title: 'Integrações reais', text: 'Conexão por API, webhook ou planilha para manter catálogos em dia.' },
  { icon: Bell, title: 'Atualizações no painel', text: 'Avisos de novos fornecedores e mudanças publicados pela equipe.' },
  { icon: Headphones, title: 'Suporte humano', text: 'Atendimento direto pelo painel para tirar dúvidas sobre a plataforma.' },
]

function SectionHeader({ eyebrow, title, text, center = true }: { eyebrow: string; title: React.ReactNode; text?: string; center?: boolean }) {
  return (
    <Reveal className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-3 text-2xl font-extrabold leading-tight text-fg sm:mt-4 sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-sm text-muted sm:mt-4 sm:text-base">{text}</p>}
    </Reveal>
  )
}

export default function Landing() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <Benefits />
      <HowItWorks />
      <Connections />
      <CategoriesSection />
      <Differentials />
      <section id="planos" className="scroll-mt-20 py-24">
        <div className="container-fx">
          <SectionHeader eyebrow="Planos" title="Escolha como começar" text="Mensal sem fidelidade ou vitalício com pagamento único." />
          <div className="mt-14"><PlansGrid /></div>
        </div>
      </section>
      <section id="duvidas" className="scroll-mt-20 py-24">
        <div className="container-fx max-w-3xl">
          <SectionHeader eyebrow="Dúvidas" title="Perguntas frequentes" />
          <Reveal className="mt-12"><Faq items={LANDING_FAQ} /></Reveal>
        </div>
      </section>
      <FinalCta />
    </>
  )
}

/* --------------------------------- Hero --------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden pb-14 pt-10 sm:pb-20 sm:pt-20">
      <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-fornex-electric/15 blur-[120px]" />

      <motion.div variants={stagger(0.08)} initial="hidden" animate="show" className="container-fx relative text-center">
        <motion.span variants={fadeUp} className="eyebrow">Plataforma de fornecedores nacionais</motion.span>
        <motion.h1 variants={fadeUp} className="mx-auto mt-5 max-w-4xl text-[2rem] font-extrabold leading-[1.1] text-white sm:mt-6 sm:text-6xl">
          Seu acesso a <span className="bg-gradient-to-r from-fornex-blue to-fornex-ice bg-clip-text text-transparent">novos fornecedores</span>.
        </motion.h1>
        <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-sm text-muted sm:mt-6 sm:text-lg">
          Encontre fornecedores com mais facilidade, consulte condições comerciais e organize seus contatos em um só lugar. Feito para quem vende em marketplaces e lojas online.
        </motion.p>
        <motion.div variants={fadeUp} className="mt-7 grid grid-cols-2 gap-2.5 sm:mt-9 sm:flex sm:items-center sm:justify-center sm:gap-3">
          <ButtonLink to="/cadastro" size="lg" className="w-full px-3 sm:w-auto sm:px-6">
            Começar agora <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink to="/planos" size="lg" variant="secondary" className="w-full px-3 sm:w-auto sm:px-6">Ver planos</ButtonLink>
        </motion.div>
      </motion.div>

      <div className="container-fx relative mt-10 sm:mt-16">
        <DashboardMock />
      </div>
    </section>
  )
}

/** Ilustração da interface (não representa dados reais) */
function DashboardMock() {
  const reduce = useReducedMotion()
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 28, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, ease: EASE, delay: 0.25 }} style={{ transformPerspective: 1400 }}
      className="relative mx-auto max-w-5xl" aria-hidden>
      <div className="absolute -inset-x-10 -bottom-10 top-10 rounded-[40px] bg-fornex-electric/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-fx-xl border border-line bg-fornex-navy shadow-2xl">
        {/* barra de janela */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <div className="mx-auto hidden h-6 w-64 rounded-md bg-white/5 sm:block" />
        </div>
        <div className="flex">
          {/* sidebar */}
          <div className="hidden w-48 shrink-0 border-r border-line p-4 md:block">
            <Logo className="h-5" />
            <div className="mt-6 space-y-1.5">
              {[LayoutDashboard, Building2, Layers, Heart, Clock, Bell].map((Icon, i) => (
                <div key={i} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${i === 1 ? 'bg-fornex-electric/15 text-fornex-ice' : 'text-muted'}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <div className={`h-2 rounded-full ${i === 1 ? 'w-20 bg-fornex-ice/50' : 'w-16 bg-white/10'}`} />
                </div>
              ))}
            </div>
          </div>
          {/* conteúdo */}
          <div className="min-w-0 flex-1 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line bg-fornex-midnight/60 px-3">
                <Search className="h-3.5 w-3.5 text-muted" />
                <motion.div className="h-2 rounded-full bg-white/15" initial={{ width: 0 }} animate={{ width: 120 }}
                  transition={{ delay: 1.1, duration: 1.2, ease: EASE }} />
              </div>
              <div className="hidden h-9 w-24 rounded-lg border border-line sm:block" />
              <div className="h-9 w-20 rounded-lg bg-fornex-electric/80" />
            </div>
            <div className="mt-3 flex gap-2 overflow-hidden">
              {[64, 88, 56, 76, 60].map((w, i) => (
                <div key={i} className={`h-6 shrink-0 rounded-full border ${i === 0 ? 'border-fornex-blue/50 bg-fornex-blue/15' : 'border-line'}`} style={{ width: w }} />
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <motion.div key={i} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + i * 0.08, duration: 0.65, ease: EASE }}
                  className={`rounded-xl border border-line bg-fornex-midnight/50 p-3.5 ${i > 3 ? 'hidden lg:block' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-fornex-blue/40 to-fornex-electric/20">
                      <Building2 className="h-4 w-4 text-fornex-ice" />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 w-24 rounded-full bg-white/20" />
                      <div className="flex items-center gap-1 text-muted"><MapPin className="h-2.5 w-2.5" /><div className="h-1.5 w-12 rounded-full bg-white/10" /></div>
                    </div>
                    <Heart className={`h-3.5 w-3.5 ${i === 1 ? 'fill-fornex-blue text-fornex-blue' : 'text-muted'}`} />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="h-1.5 w-full rounded-full bg-white/[.07]" />
                    <div className="h-1.5 w-4/5 rounded-full bg-white/[.07]" />
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <div className="h-4 w-14 rounded-full bg-fornex-blue/15" />
                    <div className="h-4 w-10 rounded-full bg-white/5" />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted">Ilustração da interface do painel.</p>
    </motion.div>
  )
}

/* ------------------------------ Stats (reais) ----------------------------- */

function StatsStrip() {
  const [stats, setStats] = useState<PublicStats | null>(null)
  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.rpc('public_platform_stats').then(({ data }) => { if (data) setStats(data as PublicStats) })
  }, [])

  if (!stats) return null
  const items = [
    { label: 'fornecedores publicados', value: stats.suppliers },
    { label: 'produtos no catálogo', value: stats.products },
    { label: 'categorias', value: stats.categories },
    { label: 'estados atendidos', value: stats.states },
  ].filter((i) => i.value > 0)
  // Só exibe quando há fornecedores reais publicados
  if (stats.suppliers <= 0 || items.length === 0) return null

  return (
    <section className="border-y border-line bg-fornex-midnight/60">
      <div className="container-fx grid grid-cols-2 gap-6 py-10 md:grid-cols-4">
        {items.map((it, i) => (
          <Reveal key={it.label} delay={i * 0.05} className="text-center">
            <div className="font-heading text-3xl font-extrabold text-white sm:text-4xl">{formatNumber(it.value)}</div>
            <div className="mt-1 text-sm text-muted">{it.label}</div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* -------------------------------- Benefícios ------------------------------- */

function Benefits() {
  return (
    <section className="py-14 sm:py-24">
      <div className="container-fx">
        <SectionHeader eyebrow="Por que a FORNEX" title="Tudo o que você precisa para encontrar fornecedores"
          text="Menos tempo procurando contatos, mais tempo vendendo. Informações organizadas e prontas para consulta." />
        <motion.div variants={stagger()} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          className="mt-8 grid grid-cols-2 gap-3 sm:mt-14 sm:gap-4 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <motion.div key={b.title} variants={fadeUp} whileHover={{ y: -3 }}
              className="card card-hover group p-4 sm:p-6">
              <span className="grid h-9 w-9 place-items-center rounded-fx-md bg-accent/10 text-accent transition group-hover:bg-fornex-electric group-hover:text-white sm:h-11 sm:w-11">
                <b.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <h3 className="mt-3 text-sm font-bold text-fg sm:mt-5 sm:text-base">{b.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted sm:mt-2 sm:text-sm">{b.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ------------------------------ Como funciona ------------------------------ */

function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-20 border-y border-line bg-fornex-midnight/60 py-14 sm:py-24">
      <div className="container-fx">
        <SectionHeader eyebrow="Como funciona" title="Do cadastro ao primeiro contato em quatro passos" />
        <div className="relative mt-10 grid grid-cols-2 gap-x-3 gap-y-8 sm:mt-16 sm:gap-6 md:grid-cols-4">
          <div className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-px bg-gradient-to-r from-transparent via-line to-transparent md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08} className="relative text-center">
              <div className="relative mx-auto grid h-12 w-12 place-items-center rounded-full border border-line bg-surface text-fornex-ice">
                <s.icon className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-fornex-electric text-[10px] font-bold text-white">{i + 1}</span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-fg sm:mt-5 sm:text-base">{s.title}</h3>
              <p className="mx-auto mt-1.5 max-w-[15rem] text-xs text-muted sm:mt-2 sm:text-sm">{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------- Conexões --------------------------------- */

const NODES = [
  { label: 'Fornecedores', icon: Building2 },
  { label: 'APIs', icon: Plug },
  { label: 'Seu catálogo', icon: Layers },
  { label: 'Marketplaces', icon: Store },
  { label: 'Planilhas', icon: FileSpreadsheet },
  { label: 'Webhooks', icon: Webhook },
]

function Connections() {
  const reduce = useReducedMotion()
  const R = 40 // raio em % do container
  return (
    <section className="overflow-hidden py-24">
      <div className="container-fx grid items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeader center={false} eyebrow="Conexão" title={<>Fornecedores e canais de venda <span className="text-fornex-ice">conectados</span></>}
            text="A FORNEX recebe dados de fornecedores por integração via API, webhooks ou planilhas e organiza tudo em um catálogo pronto para consulta." />
          <Reveal delay={0.1}>
            <ul className="mt-8 space-y-3 text-sm">
              {['Catálogos atualizados quando o fornecedor tem integração ativa', 'Importação de planilhas CSV e Excel pela equipe', 'Data da última atualização visível em cada ficha'].map((t) => (
                <li key={t} className="flex items-start gap-3 text-fg/90">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fornex-blue" />{t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal className="relative mx-auto aspect-square w-full max-w-[440px]">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r={R} fill="none" stroke="rgb(34 50 74)" strokeWidth=".3" strokeDasharray="1 1.5" />
            <circle cx="50" cy="50" r={R * 0.55} fill="none" stroke="rgb(34 50 74)" strokeWidth=".3" />
            {NODES.map((_, i) => {
              const a = (i / NODES.length) * Math.PI * 2 - Math.PI / 2
              const x = 50 + Math.cos(a) * R, y = 50 + Math.sin(a) * R
              return (
                <g key={i}>
                  <line x1="50" y1="50" x2={x} y2={y} stroke="rgb(59 130 246 / .25)" strokeWidth=".35" />
                  {!reduce && (
                    <motion.circle r=".9" fill="#93C5FD"
                      initial={{ cx: x, cy: y, opacity: 0 }} animate={{ cx: [x, 50], cy: [y, 50], opacity: [0, 1, 0] }}
                      transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.45, ease: 'easeInOut' }} />
                  )}
                </g>
              )
            })}
          </svg>
          <div className="absolute left-1/2 top-1/2 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-fx-xl border border-accent/40 bg-fornex-navy shadow-cta sm:h-28 sm:w-28">
            <Logo symbolOnly className="h-14 w-14 sm:h-16 sm:w-16" />
          </div>
          {NODES.map((n, i) => {
            const a = (i / NODES.length) * Math.PI * 2 - Math.PI / 2
            return (
              <motion.div key={n.label} className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${50 + Math.cos(a) * R}%`, top: `${50 + Math.sin(a) * R}%` }}
                initial={reduce ? false : { opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.07, duration: 0.6, ease: EASE }}>
                <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-2 text-xs font-medium text-fg shadow-card">
                  <n.icon className="h-3.5 w-3.5 text-fornex-ice" />{n.label}
                </div>
              </motion.div>
            )
          })}
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------- Categorias ------------------------------- */

function CategoriesSection() {
  const [cats, setCats] = useState<(Pick<Category, 'id' | 'name' | 'slug' | 'icon'> & { total: number })[] | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    Promise.all([
      supabase.from('supplier_categories').select('id, name, slug, icon').order('sort_order'),
      supabase.rpc('public_category_counts'),
    ]).then(([c, counts]) => {
      const map = new Map(((counts.data as { category_id: string; total: number }[]) ?? []).map((r) => [r.category_id, Number(r.total)]))
      setCats(((c.data as Pick<Category, 'id' | 'name' | 'slug' | 'icon'>[]) ?? []).map((x) => ({ ...x, total: map.get(x.id) ?? 0 })))
    })
  }, [])

  if (!isSupabaseConfigured || (cats && cats.length === 0)) return null

  return (
    <section id="categorias" className="scroll-mt-20 border-y border-line bg-fornex-midnight/60 py-14 sm:py-24">
      <div className="container-fx">
        <SectionHeader eyebrow="Categorias" title="Fornecedores organizados por segmento" text="Navegue pelas categorias e encontre fornecedores do seu nicho." />
        <div className="mt-8 grid grid-cols-4 gap-2 sm:mt-14 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {cats === null
            ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-fx-lg sm:h-28" />)
            : cats.map((c, i) => (
              <Reveal key={c.id} delay={(i % 5) * 0.04}>
                <motion.div whileHover={{ y: -3 }} className="card card-hover flex h-full flex-col items-center gap-1.5 p-2 text-center sm:items-start sm:gap-3 sm:p-4 sm:text-left">
                  <span className="grid h-8 w-8 place-items-center rounded-fx-md bg-accent/10 text-accent sm:h-10 sm:w-10">
                    <CategoryIcon name={c.icon} className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <div>
                    <div className="text-[10.5px] font-semibold leading-tight text-fg sm:text-sm">{c.name}</div>
                    {c.total > 0 && <div className="mt-0.5 hidden text-xs text-muted sm:block">{formatNumber(c.total)} {c.total === 1 ? 'fornecedor' : 'fornecedores'}</div>}
                  </div>
                </motion.div>
              </Reveal>
            ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------ Diferenciais ------------------------------ */

function Differentials() {
  return (
    <section className="py-14 sm:py-24">
      <div className="container-fx grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-center">
        <SectionHeader center={false} eyebrow="Diferenciais" title="Uma plataforma feita para o dia a dia de quem vende"
          text="Pensada para ser simples de usar e confiável, do primeiro acesso à rotina de compras." />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {DIFFERENTIALS.map((d, i) => (
            <Reveal key={d.title} delay={i * 0.06}>
              <div className="card card-hover h-full p-4 sm:p-5">
                <d.icon className="h-4 w-4 text-fornex-ice sm:h-5 sm:w-5" />
                <h3 className="mt-3 text-sm font-bold text-fg sm:mt-4 sm:text-base">{d.title}</h3>
                <p className="mt-1 text-xs text-muted sm:mt-1.5 sm:text-sm">{d.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------- CTA final -------------------------------- */

function FinalCta() {
  return (
    <section className="pb-24">
      <div className="container-fx">
        <Reveal>
          <div className="relative overflow-hidden rounded-fx-xl border border-line bg-fornex-navy px-6 py-14 text-center sm:px-12">
            <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <div className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-fornex-electric/25 blur-3xl" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-extrabold text-white sm:text-4xl">Organize seus fornecedores em um só lugar.</h2>
              <p className="mx-auto mt-4 max-w-xl text-muted">Crie sua conta, escolha o plano e comece a falar com fornecedores hoje.</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <ButtonLink to="/cadastro" size="lg" className="w-full sm:w-auto">Começar agora <ArrowRight className="h-4 w-4" /></ButtonLink>
                <ButtonLink to="/planos" size="lg" variant="secondary" className="w-full sm:w-auto">Comparar planos</ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

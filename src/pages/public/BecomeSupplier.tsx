import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { BadgeCheck, CircleCheck, FileSpreadsheet, Handshake, Plug, Rocket, Store, Users } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { BR_STATES } from '@/lib/config'
import { onlyDigits } from '@/lib/utils'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Input, Select, Switch, Textarea } from '@/components/ui/Field'
import { Reveal } from '@/components/ui/motion'

/** Valida CNPJ pelos dígitos verificadores */
function isValidCnpj(raw: string) {
  const c = onlyDigits(raw)
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = w.reduce((acc, n, i) => acc + Number(c[i]) * n, 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13])
}

const maskCnpj = (v: string) => onlyDigits(v).slice(0, 14)
  .replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
  .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')

const schema = z.object({
  company_name: z.string().trim().min(2, 'Informe a razão social ou nome fantasia').max(120),
  cnpj: z.string().refine(isValidCnpj, 'CNPJ inválido'),
  contact_name: z.string().trim().min(2, 'Informe seu nome').max(120),
  email: z.email('E-mail inválido').max(160),
  whatsapp: z.string().refine((v) => /^\d{10,13}$/.test(onlyDigits(v)), 'WhatsApp com DDD'),
  website: z.string().trim().max(300).refine((v) => !v || /^https?:\/\/\S+\.\S+/.test(v), 'Use o endereço completo (https://...)'),
  city: z.string().trim().max(80),
  state: z.string(),
  niche: z.string().trim().min(2, 'Informe o nicho').max(80),
  catalog_method: z.enum(['planilha', 'xml', 'api', 'bling', 'tiny', 'outro']),
  product_count: z.string(),
  message: z.string().trim().max(2000),
})

const BENEFITS = [
  { icon: Users, title: 'Novos revendedores', text: 'Seus produtos aparecem para vendedores ativos que buscam fornecedores todos os dias.' },
  { icon: Store, title: 'Vendas no Mercado Livre', text: 'Os revendedores publicam seus produtos direto nas lojas deles, com seu estoque e preço.' },
  { icon: Plug, title: 'Integração do seu jeito', text: 'Planilha, XML, API própria, Bling ou Tiny. Você escolhe como enviar o catálogo.' },
  { icon: Handshake, title: 'Sem custo para entrar', text: 'O cadastro de fornecedores é gratuito. Você negocia direto com os revendedores.' },
]

const STEPS = [
  { icon: FileSpreadsheet, title: 'Envie seus dados', text: 'Preencha o formulário em 2 minutos.' },
  { icon: BadgeCheck, title: 'Análise da equipe', text: 'Conferimos o CNPJ e entramos em contato.' },
  { icon: Plug, title: 'Conectamos o catálogo', text: 'Por planilha, XML, API, Bling ou Tiny.' },
  { icon: Rocket, title: 'Comece a vender', text: 'Seus produtos ficam disponíveis para os revendedores.' },
]

const EMPTY = {
  company_name: '', cnpj: '', contact_name: '', email: '', whatsapp: '', website: '', city: '', state: '',
  niche: '', catalog_method: 'planilha' as const, product_count: '', message: '',
}

export default function BecomeSupplier() {
  const [form, setForm] = useState<typeof EMPTY & { catalog_method: z.infer<typeof schema>['catalog_method'] }>(EMPTY)
  const [drop, setDrop] = useState(false)
  const [hp, setHp] = useState('') // honeypot anti-robô (campo invisível)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (hp) { setSent(true); return } // robô: finge sucesso e descarta
    const parsed = schema.safeParse(form)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      toast.error('Confira os campos destacados.')
      return
    }
    setErrors({})
    if (!isSupabaseConfigured) { toast.error('Cadastro indisponível no momento.'); return }
    setSending(true)
    const d = parsed.data
    const { error } = await supabase.rpc('submit_supplier_application', {
      p_company_name: d.company_name, p_cnpj: onlyDigits(d.cnpj), p_contact_name: d.contact_name, p_email: d.email,
      p_whatsapp: onlyDigits(d.whatsapp), p_website: d.website || null, p_city: d.city || null, p_state: d.state || null,
      p_niche: d.niche, p_catalog_method: d.catalog_method, p_product_count: d.product_count || null,
      p_accepts_dropshipping: drop, p_message: d.message || null,
    })
    setSending(false)
    if (error) {
      toast.error(error.message.includes('too_many') ? 'Recebemos vários envios com esses dados hoje. Tente novamente amanhã.' : 'Não foi possível enviar. Tente novamente.')
      return
    }
    setSent(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden pb-10 pt-12 sm:pb-16 sm:pt-20">
        <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-[380px] w-[800px] -translate-x-1/2 rounded-full bg-fornex-electric/15 blur-[120px]" />
        <div className="container-fx relative text-center">
          <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="eyebrow">Para fornecedores</motion.span>
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="mx-auto mt-5 max-w-3xl text-[2rem] font-extrabold leading-[1.1] text-white sm:text-5xl">
            Leve seus produtos para <span className="bg-gradient-to-r from-fornex-blue to-fornex-ice bg-clip-text text-transparent">milhares de vendas</span> no Mercado Livre
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="mx-auto mt-4 max-w-2xl text-sm text-muted sm:text-lg">
            Cadastre sua empresa na FORNEX e conecte seu catálogo a revendedores que vendem online todos os dias. Sem custo para entrar.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="mt-7">
            <ButtonLink to="#cadastro" size="lg" onClick={(e) => { e.preventDefault(); document.getElementById('cadastro')?.scrollIntoView({ behavior: 'smooth' }) }}>
              Quero ser fornecedor
            </ButtonLink>
          </motion.div>
        </div>
      </section>

      {/* Benefícios */}
      <section className="py-10 sm:py-16">
        <div className="container-fx grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 0.06}>
              <div className="card card-hover h-full p-4 sm:p-6">
                <span className="grid h-9 w-9 place-items-center rounded-fx-md bg-accent/10 text-accent sm:h-11 sm:w-11"><b.icon className="h-4 w-4 sm:h-5 sm:w-5" /></span>
                <h3 className="mt-3 text-sm font-bold text-fg sm:mt-5 sm:text-base">{b.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted sm:text-sm">{b.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-y border-line bg-fornex-midnight/60 py-10 sm:py-16">
        <div className="container-fx">
          <h2 className="text-center text-2xl font-extrabold text-fg sm:text-3xl">Como funciona</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:mt-12 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.08} className="text-center">
                <div className="relative mx-auto grid h-12 w-12 place-items-center rounded-full border border-line bg-surface text-fornex-ice">
                  <s.icon className="h-5 w-5" />
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-fornex-electric text-[10px] font-bold text-white">{i + 1}</span>
                </div>
                <h3 className="mt-3 text-sm font-bold text-fg sm:text-base">{s.title}</h3>
                <p className="mx-auto mt-1 max-w-[14rem] text-xs text-muted sm:text-sm">{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Formulário */}
      <section id="cadastro" className="scroll-mt-20 py-12 sm:py-20">
        <div className="container-fx max-w-3xl">
          {sent ? (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card flex flex-col items-center p-8 text-center sm:p-12">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10 text-emerald-400"><CircleCheck className="h-8 w-8" /></span>
              <h2 className="mt-5 text-2xl font-extrabold text-fg">Cadastro recebido!</h2>
              <p className="mt-2 max-w-md text-sm text-muted">Nossa equipe vai analisar os dados da sua empresa e entrar em contato pelo WhatsApp ou e-mail informados.</p>
              <ButtonLink to="/" variant="secondary" className="mt-7">Voltar ao início</ButtonLink>
            </motion.div>
          ) : (
            <Reveal>
              <form onSubmit={submit} noValidate className="card p-5 sm:p-8">
                <h2 className="text-xl font-extrabold text-fg sm:text-2xl">Cadastre sua empresa</h2>
                <p className="mt-1 text-sm text-muted">Leva cerca de 2 minutos. Usamos os dados só para entrar em contato sobre a parceria.</p>

                {/* honeypot: invisível para pessoas */}
                <input type="text" name="website_confirm" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off"
                  className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Input label="Empresa (razão social ou nome fantasia) *" value={form.company_name} error={errors.company_name} onChange={(e) => set('company_name', e.target.value)} autoComplete="organization" /></div>
                  <Input label="CNPJ *" value={form.cnpj} error={errors.cnpj} inputMode="numeric" placeholder="00.000.000/0000-00" onChange={(e) => set('cnpj', maskCnpj(e.target.value))} />
                  <Input label="Site" value={form.website} error={errors.website} placeholder="https://" onChange={(e) => set('website', e.target.value)} autoComplete="url" />
                  <Input label="Seu nome *" value={form.contact_name} error={errors.contact_name} onChange={(e) => set('contact_name', e.target.value)} autoComplete="name" />
                  <Input label="WhatsApp *" value={form.whatsapp} error={errors.whatsapp} inputMode="tel" placeholder="(11) 99999-9999" onChange={(e) => set('whatsapp', e.target.value)} autoComplete="tel" />
                  <div className="sm:col-span-2"><Input label="E-mail comercial *" type="email" value={form.email} error={errors.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></div>
                  <Input label="Cidade" value={form.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" />
                  <Select label="Estado" value={form.state} onChange={(e) => set('state', e.target.value)}>
                    <option value="">Selecione</option>
                    {BR_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Input label="Nicho / categoria dos produtos *" value={form.niche} error={errors.niche} placeholder="Ex.: utilidades domésticas, pet, eletrônicos" onChange={(e) => set('niche', e.target.value)} />
                  <Select label="Quantos produtos?" value={form.product_count} onChange={(e) => set('product_count', e.target.value)}>
                    <option value="">Selecione</option>
                    <option value="ate_50">Até 50</option>
                    <option value="50_200">50 a 200</option>
                    <option value="200_1000">200 a 1.000</option>
                    <option value="mais_1000">Mais de 1.000</option>
                  </Select>
                  <div className="sm:col-span-2">
                    <Select label="Como você pode enviar o catálogo? *" value={form.catalog_method} onChange={(e) => set('catalog_method', e.target.value)}>
                      <option value="planilha">Planilha (Excel/CSV)</option>
                      <option value="xml">Feed XML (link que atualiza sozinho)</option>
                      <option value="api">API própria</option>
                      <option value="bling">Uso o Bling</option>
                      <option value="tiny">Uso o Tiny (Olist)</option>
                      <option value="outro">Outro / não sei</option>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Switch checked={drop} onChange={setDrop} label="Faço envio direto ao cliente final (dropshipping)"
                      description="O revendedor vende e você envia o produto direto para o comprador." />
                  </div>
                  <div className="sm:col-span-2"><Textarea label="Algo mais que devemos saber?" rows={3} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="Pedido mínimo, prazos, marcas que trabalha..." /></div>
                </div>
                <Button type="submit" size="lg" loading={sending} className="mt-6 w-full sm:w-auto">Enviar cadastro</Button>
                <p className="mt-3 text-[11px] text-muted">Ao enviar, você concorda com o uso dos dados para contato comercial, conforme a nossa política de privacidade.</p>
              </form>
            </Reveal>
          )}
        </div>
      </section>
    </div>
  )
}

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, LifeBuoy, Mail, MessageCircle } from 'lucide-react'
import { BRAND } from '@/lib/config'
import { cn, whatsappUrl } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/app/Shared'
import { Notice } from '@/components/ui/Feedback'

const FAQ = [
  { q: 'Como entro em contato com um fornecedor?', a: 'Abra a página do fornecedor e use os botões de WhatsApp, telefone ou e-mail. As negociações são feitas diretamente com ele.' },
  { q: 'Os preços dos produtos estão sempre atualizados?', a: 'Produtos sincronizados por integração são atualizados automaticamente. Os demais são atualizados pela nossa equipe. Sempre confirme valores com o fornecedor antes de fechar pedidos.' },
  { q: 'Como cancelo minha assinatura?', a: 'Em "Minha assinatura", clique em "Cancelar assinatura". Você mantém o acesso até o fim do período já pago.' },
  { q: 'Posso sugerir um fornecedor?', a: 'Sim. Envie o nome e o contato do fornecedor pelo suporte e nossa equipe avalia a inclusão.' },
  { q: 'Por que não vejo alguns fornecedores?', a: 'Alguns fornecedores são exclusivos de planos pagos. Confira os planos em "Minha assinatura".' },
]

export default function Support() {
  const { profile } = useAuth()
  const [open, setOpen] = useState<number | null>(0)
  const wa = whatsappUrl(BRAND.supportWhatsapp, `Olá! Sou ${profile?.full_name || 'cliente'} da FORNEX e preciso de ajuda.`)
  const hasChannels = Boolean(wa || BRAND.supportEmail)

  return (
    <div>
      <PageHeader eyebrow="Ajuda" title="Suporte" description="Fale com a nossa equipe ou consulte as dúvidas mais comuns." />

      {hasChannels ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="card group flex items-center gap-4 p-5 transition hover:border-accent/40">
              <span className="grid h-12 w-12 place-items-center rounded-fx-md bg-emerald-500/10 text-emerald-400"><MessageCircle className="h-5 w-5" /></span>
              <span><span className="block font-semibold text-fg">WhatsApp</span><span className="text-sm text-muted">Atendimento em horário comercial</span></span>
            </a>
          )}
          {BRAND.supportEmail && (
            <a href={`mailto:${BRAND.supportEmail}`} className="card group flex items-center gap-4 p-5 transition hover:border-accent/40">
              <span className="grid h-12 w-12 place-items-center rounded-fx-md bg-accent/10 text-accent"><Mail className="h-5 w-5" /></span>
              <span><span className="block font-semibold text-fg">E-mail</span><span className="text-sm text-muted">{BRAND.supportEmail}</span></span>
            </a>
          )}
        </div>
      ) : (
        <Notice tone="warning" title="Canais de suporte ainda não configurados">
          Defina VITE_SUPPORT_WHATSAPP e/ou VITE_SUPPORT_EMAIL no arquivo .env para exibir os contatos aqui.
        </Notice>
      )}

      <section className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-fg"><LifeBuoy className="h-5 w-5 text-accent" />Perguntas frequentes</h2>
        <div className="space-y-2">
          {FAQ.map((f, i) => (
            <div key={f.q} className="card overflow-hidden">
              <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-fg">
                {f.q}<ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform duration-300', open === i && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                    <p className="px-5 pb-4 text-sm leading-relaxed text-muted">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

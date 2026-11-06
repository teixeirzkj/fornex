import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building, Check, ExternalLink, Inbox, MessageCircle, Phone, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage, slugify, timeAgo, whatsappUrl } from '@/lib/utils'
import { PageHeader } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui/Button'
import { Select, Textarea } from '@/components/ui/Field'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'

interface Application {
  id: string; company_name: string; cnpj: string; contact_name: string; email: string; whatsapp: string
  website: string | null; city: string | null; state: string | null; niche: string; catalog_method: string
  product_count: string | null; accepts_dropshipping: boolean; message: string | null
  status: 'new' | 'contacted' | 'approved' | 'rejected'; admin_notes: string | null; supplier_id: string | null; created_at: string
}

const STATUS = {
  new: { label: 'Novo', tone: 'blue' as const }, contacted: { label: 'Em contato', tone: 'amber' as const },
  approved: { label: 'Aprovado', tone: 'green' as const }, rejected: { label: 'Recusado', tone: 'neutral' as const },
}
const METHOD: Record<string, string> = { planilha: 'Planilha', xml: 'Feed XML', api: 'API própria', bling: 'Bling', tiny: 'Tiny', outro: 'Outro' }
const COUNT: Record<string, string> = { ate_50: 'Até 50', '50_200': '50 a 200', '200_1000': '200 a 1.000', mais_1000: 'Mais de 1.000' }
const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

export default function AdminApplications() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Application['status']>('new')
  const [open, setOpen] = useState<Application | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('supplier_applications').select('*').order('created_at', { ascending: false }).limit(200)
    if (filter !== 'all') q = q.eq('status', filter)
    const { data, error } = await q
    if (error) toast.error(errorMessage(error))
    setItems((data as Application[]) ?? [])
    setLoading(false)
  }, [filter])
  useEffect(() => { void load() }, [load])

  const openItem = (a: Application) => { setOpen(a); setNotes(a.admin_notes ?? '') }

  async function update(status: Application['status']) {
    if (!open) return
    setBusy(true)
    const { error } = await supabase.from('supplier_applications').update({ status, admin_notes: notes.trim() || null }).eq('id', open.id)
    setBusy(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Candidatura atualizada.')
    setOpen(null); void load()
  }

  /** Cria o fornecedor (oculto) com os dados enviados e abre a edição */
  async function approve() {
    if (!open) return
    setBusy(true)
    const slug = `${slugify(open.company_name).slice(0, 100) || 'fornecedor'}-${open.cnpj.slice(-4)}`
    const { data: sup, error } = await supabase.from('suppliers').insert({
      name: open.company_name, slug, city: open.city, state: open.state, email: open.email,
      whatsapp: open.whatsapp, phone: open.whatsapp, website: open.website,
      description: open.message ? open.message.slice(0, 4000) : null,
      tags: [open.niche.slice(0, 40), ...(open.accepts_dropshipping ? ['dropshipping'] : [])],
      notes: `CNPJ ${fmtCnpj(open.cnpj)} · catálogo via ${METHOD[open.catalog_method] ?? open.catalog_method}`,
      min_access_level: 1, is_published: false,
    }).select('id').single()
    if (error) { setBusy(false); toast.error(errorMessage(error)); return }
    await supabase.from('supplier_applications').update({ status: 'approved', supplier_id: sup.id, admin_notes: notes.trim() || null }).eq('id', open.id)
    setBusy(false)
    toast.success('Fornecedor criado (oculto). Complete o cadastro e importe o catálogo.')
    navigate(`/admin/fornecedores/${sup.id}`)
  }

  const wa = open ? whatsappUrl(open.whatsapp, `Olá, ${open.contact_name}! Aqui é da FORNEX. Recebemos o cadastro da ${open.company_name} e gostaríamos de conversar sobre a parceria.`) : null

  return (
    <div>
      <PageHeader title="Candidatos a fornecedor" description="Empresas que se cadastraram na página Seja um fornecedor."
        actions={
          <div className="flex items-center gap-2">
            <a href="/seja-fornecedor" target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-fx-md px-3 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">
              Ver página pública <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Select aria-label="Filtrar por status" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-40">
              <option value="new">Novos</option>
              <option value="contacted">Em contato</option>
              <option value="approved">Aprovados</option>
              <option value="rejected">Recusados</option>
              <option value="all">Todos</option>
            </Select>
          </div>
        } />

      {loading ? (
        <div className="space-y-2.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Inbox />} title={filter === 'new' ? 'Nenhum candidato novo' : 'Nada por aqui'}
          description="Divulgue a página /seja-fornecedor em grupos de atacado, Instagram e LinkedIn para receber cadastros." />
      ) : (
        <ul className="space-y-2.5">
          {items.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => openItem(a)} className="card w-full p-4 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-fg">{a.company_name}</span>
                  <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                  {a.accepts_dropshipping && <Badge tone="green">Dropshipping</Badge>}
                  <span className="ml-auto text-xs text-muted">{timeAgo(a.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {a.niche} · {[a.city, a.state].filter(Boolean).join('/') || 'local não informado'} · catálogo: {METHOD[a.catalog_method]}
                  {a.product_count && ` · ${COUNT[a.product_count]} produtos`}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} size="lg" title={open?.company_name ?? ''} description={open ? `CNPJ ${fmtCnpj(open.cnpj)}` : undefined}
        footer={open && (
          <>
            {open.status !== 'rejected' && open.status !== 'approved' && <Button variant="ghost" className="hover:text-red-400" loading={busy} onClick={() => update('rejected')} icon={<X className="h-4 w-4" />}>Recusar</Button>}
            {open.status === 'new' && <Button variant="secondary" loading={busy} onClick={() => update('contacted')} icon={<Phone className="h-4 w-4" />}>Marcar como em contato</Button>}
            {open.status !== 'approved'
              ? <Button loading={busy} onClick={approve} icon={<Check className="h-4 w-4" />}>Aprovar e criar fornecedor</Button>
              : open.supplier_id && <Link to={`/admin/fornecedores/${open.supplier_id}`}><Button icon={<Building className="h-4 w-4" />}>Abrir fornecedor</Button></Link>}
          </>
        )}>
        {open && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Info label="Contato" value={open.contact_name} />
              <Info label="E-mail" value={<a href={`mailto:${open.email}`} className="text-accent hover:underline">{open.email}</a>} />
              <Info label="WhatsApp" value={wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline"><MessageCircle className="h-3.5 w-3.5" />{open.whatsapp}</a> : open.whatsapp} />
              <Info label="Site" value={open.website ? <a href={open.website} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">{open.website}</a> : '—'} />
              <Info label="Nicho" value={open.niche} />
              <Info label="Local" value={[open.city, open.state].filter(Boolean).join('/') || '—'} />
              <Info label="Catálogo via" value={METHOD[open.catalog_method]} />
              <Info label="Produtos" value={open.product_count ? COUNT[open.product_count] : '—'} />
              <Info label="Dropshipping" value={open.accepts_dropshipping ? 'Sim, envia ao cliente final' : 'Não informado'} />
              <Info label="Recebido" value={new Date(open.created_at).toLocaleString('pt-BR')} />
            </div>
            {open.message && <div className="rounded-fx-md border border-line bg-bg/50 p-3 text-muted whitespace-pre-line">{open.message}</div>}
            <a href={`https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline">Conferir CNPJ na Receita Federal <ExternalLink className="h-3 w-3" /></a>
            <Textarea label="Anotações internas" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condições combinadas, próximos passos..." />
          </div>
        )}
      </Modal>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <div className="mt-0.5 text-fg">{value}</div>
    </div>
  )
}

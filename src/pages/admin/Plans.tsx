import { useCallback, useEffect, useState } from 'react'
import { Check, CreditCard, Pencil, Plus, Star, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { cn, errorMessage, formatBRL, slugify } from '@/lib/utils'
import { PLAN_COLUMNS, intervalLabel } from '@/hooks/usePlans'
import type { Plan } from '@/types/db'
import { centsToReais, PageHeader, reaisToCents } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui/Button'
import { Input, Select, Switch, Textarea } from '@/components/ui/Field'
import { Badge, EmptyState, Notice, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'Use letras minúsculas, números e hífen'),
  name: z.string().trim().min(2, 'Informe o nome').max(60),
  description: z.string().trim().max(300).transform((v) => v || null),
  price_cents: z.number().int().min(0, 'Preço inválido'),
  interval: z.enum(['free', 'month', 'year', 'lifetime']),
  installments: z.number().int().min(1, 'Mínimo 1').max(12, 'Máximo 12'),
  features_title: z.string().trim().max(80).transform((v) => v || null),
  cta_label: z.string().trim().max(40).transform((v) => v || null),
  badge: z.string().trim().max(30).transform((v) => v || null),
  access_level: z.number().int().min(0).max(100),
  features: z.array(z.string().trim().min(1).max(120)).max(20),
  limits: z.record(z.string(), z.number().int().min(0)),
  highlight: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(999),
}).strict()

type Form = { slug: string; name: string; description: string; price: string; interval: Plan['interval']; installments: string; features_title: string; cta_label: string; badge: string; access_level: string; features: string; max_favorites: string; highlight: boolean; is_active: boolean; sort_order: string }
const EMPTY: Form = { slug: '', name: '', description: '', price: '', interval: 'month', installments: '1', features_title: '', cta_label: '', badge: '', access_level: '1', features: '', max_favorites: '', highlight: false, is_active: true, sort_order: '0' }

export default function AdminPlans() {
  const [rows, setRows] = useState<(Plan & { subs?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<Plan | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, subs] = await Promise.all([
      supabase.from('plans').select(PLAN_COLUMNS).order('sort_order'),
      supabase.from('subscriptions').select('plan_id').in('status', ['active', 'past_due', 'paused']).limit(10000),
    ])
    if (error) toast.error(errorMessage(error))
    const counts = new Map<string, number>()
    for (const s of (subs.data as { plan_id: string }[]) ?? []) counts.set(s.plan_id, (counts.get(s.plan_id) ?? 0) + 1)
    setRows(((data as Plan[]) ?? []).map((p) => ({ ...p, subs: counts.get(p.id) ?? 0 })))
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  function openForm(p: Plan | null) {
    setEditing(p); setErrors({})
    setForm(p ? {
      slug: p.slug, name: p.name, description: p.description ?? '', price: centsToReais(p.price_cents), interval: p.interval,
      installments: String(p.installments ?? 1), features_title: p.features_title ?? '', cta_label: p.cta_label ?? '', badge: p.badge ?? '',
      access_level: String(p.access_level), features: (p.features ?? []).join('\n'),
      max_favorites: p.limits?.max_favorites != null ? String(p.limits.max_favorites) : '',
      highlight: p.highlight, is_active: p.is_active, sort_order: String(p.sort_order),
    } : { ...EMPTY, sort_order: String(rows.length + 1) })
    setOpen(true)
  }

  async function save() {
    const limits: Record<string, number> = {}
    if (form.max_favorites.trim()) limits.max_favorites = Number.parseInt(form.max_favorites, 10)
    const parsed = schema.safeParse({
      slug: form.slug, name: form.name, description: form.description,
      price_cents: form.interval === 'free' ? 0 : reaisToCents(form.price) ?? -1,
      interval: form.interval, access_level: Number(form.access_level),
      installments: form.interval === 'lifetime' ? Number.parseInt(form.installments, 10) || 1 : 1,
      features_title: form.features_title, cta_label: form.cta_label, badge: form.badge,
      features: form.features.split('\n').map((s) => s.trim()).filter(Boolean),
      limits, highlight: form.highlight, is_active: form.is_active, sort_order: Number(form.sort_order) || 0,
    })
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    if (parsed.data.interval !== 'free' && parsed.data.price_cents === 0) { setErrors({ price_cents: 'Planos pagos precisam de preço.' }); return }
    setSaving(true)
    const { error } = editing
      ? await supabase.from('plans').update(parsed.data).eq('id', editing.id)
      : await supabase.from('plans').insert(parsed.data)
    setSaving(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success(editing ? 'Plano atualizado.' : 'Plano criado.')
    setOpen(false); void load()
  }

  async function remove() {
    if (!toDelete) return
    const { error } = await supabase.from('plans').delete().eq('id', toDelete.id)
    if (error) {
      toast.error(/foreign key/i.test(error.message) ? 'Este plano possui assinaturas. Desative-o em vez de excluir.' : errorMessage(error))
      return
    }
    toast.success('Plano excluído.'); void load()
  }

  const changedPrice = editing && reaisToCents(form.price) !== editing.price_cents && (rows.find((r) => r.id === editing.id)?.subs ?? 0) > 0

  return (
    <div>
      <PageHeader title="Planos" description="Planos exibidos no site e usados no checkout. O preço cobrado é sempre lido daqui pelo servidor."
        actions={<Button onClick={() => openForm(null)} icon={<Plus className="h-4 w-4" />}>Novo plano</Button>} />

      <div className="mb-6">
        <Notice tone="warning" title="Alterações de preço">
          Mudar o preço de um plano vale para novas contratações. Assinaturas já criadas no Mercado Pago continuam com o valor original até serem recriadas.
        </Notice>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<CreditCard />} title="Nenhum plano" description="Crie os planos de assinatura da plataforma."
          action={<Button onClick={() => openForm(null)} icon={<Plus className="h-4 w-4" />}>Criar plano</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <div key={p.id} className={cn('card flex flex-col p-5', p.highlight && 'border-accent/40', !p.is_active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    {p.highlight && <Badge tone="blue"><Star className="h-3 w-3" />Destaque</Badge>}
                    {!p.is_active && <Badge>Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted">/{p.slug} · nível {p.access_level} · {p.subs} assinatura(s) ativa(s)</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openForm(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setToDelete(p)} className="hover:text-red-400"><Trash className="h-4 w-4" /></Button>
                </div>
              </div>
              <p className="mt-4 font-heading text-3xl font-bold">
                {p.interval === 'free' ? 'Grátis' : p.installments > 1 ? `${p.installments}x ${formatBRL(Math.round(p.price_cents / p.installments))}` : formatBRL(p.price_cents)}
                {p.interval !== 'free' && <span className="ml-1 text-sm font-medium text-muted">{p.installments > 1 ? `total ${formatBRL(p.price_cents)}` : intervalLabel(p.interval)}</span>}
              </p>
              {p.description && <p className="mt-2 text-sm text-muted">{p.description}</p>}
              <ul className="mt-4 space-y-1.5 text-sm">
                {(p.features ?? []).map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar plano' : 'Novo plano'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome" value={form.name} error={errors.name} autoFocus
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: editing ? f.slug : slugify(e.target.value).slice(0, 40) }))} />
          <Input label="Slug" value={form.slug} error={errors.slug} hint="Identificador usado no checkout"
            onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value).slice(0, 40) }))} />
          <Select label="Cobrança" value={form.interval} onChange={(e) => setForm((f) => ({ ...f, interval: e.target.value as Plan['interval'] }))}>
            <option value="free">Gratuito</option>
            <option value="month">Mensal</option>
            <option value="year">Anual</option>
            <option value="lifetime">Vitalício (pagamento único)</option>
          </Select>
          <Input label={form.interval === 'lifetime' ? 'Preço total (R$)' : 'Preço (R$)'} hint={form.interval === 'lifetime' ? 'Ex.: 12x de 19,90 = 238,80' : undefined} inputMode="decimal" placeholder="69,90" value={form.interval === 'free' ? '0,00' : form.price}
            disabled={form.interval === 'free'} error={errors.price_cents} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
          <Input label="Nível de acesso" type="number" min={0} max={100} value={form.access_level} error={errors.access_level}
            hint="Libera fornecedores com nível mínimo ≤ este valor" onChange={(e) => setForm((f) => ({ ...f, access_level: e.target.value }))} />
          <Input label="Limite de favoritos" type="number" min={0} value={form.max_favorites} hint="Vazio = ilimitado"
            onChange={(e) => setForm((f) => ({ ...f, max_favorites: e.target.value }))} />
          {form.interval === 'lifetime' && (
            <Input label="Parcelas no cartão (máx.)" type="number" min={1} max={12} value={form.installments} error={errors.installments}
              hint="Juros: configure 'parcelamento sem juros' na conta Mercado Pago" onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))} />
          )}
          <Input label="Selo" placeholder="Melhor escolha" value={form.badge} error={errors.badge} onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))} />
          <Input label="Texto do botão" placeholder="Começar agora" value={form.cta_label} error={errors.cta_label} onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))} />
          <Input label="Título dos benefícios" placeholder="O plano inclui:" value={form.features_title} error={errors.features_title} onChange={(e) => setForm((f) => ({ ...f, features_title: e.target.value }))} />
          <div className="sm:col-span-2"><Input label="Descrição" value={form.description} error={errors.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          <div className="sm:col-span-2">
            <Textarea label="Benefícios (um por linha)" rows={5} value={form.features} error={errors.features} onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))} />
          </div>
          <Input label="Ordem" type="number" min={0} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
          <div />
          <Switch checked={form.highlight} onChange={(v) => setForm((f) => ({ ...f, highlight: v }))} label="Destacar plano" description="Exibe o selo de destaque no site." />
          <Switch checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Ativo" description="Planos inativos não aparecem para contratação." />
          {changedPrice && (
            <div className="sm:col-span-2">
              <Notice tone="warning" title="Este plano tem assinaturas ativas">O novo preço não altera as cobranças recorrentes já criadas no Mercado Pago.</Notice>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} confirmLabel="Excluir"
        title={`Excluir o plano ${toDelete?.name ?? ''}?`} description="Planos com assinaturas não podem ser excluídos — desative-os." />
    </div>
  )
}

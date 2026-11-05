import { useCallback, useEffect, useState } from 'react'
import { Plus, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { sanitizeSearch } from '@/lib/api'
import { errorMessage, formatBRL, formatDate } from '@/lib/utils'
import type { Payment, PaymentStatus } from '@/types/db'
import { DataTable, FilterBar, PAGE_SIZE, PageHeader, Pagination, reaisToCents, StatCard, StatusBadge } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'

type Row = Payment & { profile: { email: string | null; full_name: string | null } | null }

const STATUSES: [PaymentStatus, string][] = [
  ['approved', 'Aprovados'], ['pending', 'Pendentes'], ['in_process', 'Em análise'], ['rejected', 'Recusados'], ['refunded', 'Estornados'], ['canceled', 'Cancelados'],
]
const GATEWAY: Record<string, string> = { manual: 'Manual', mercadopago: 'Mercado Pago', stripe: 'Stripe' }

const manualSchema = z.object({
  user_id: z.string().uuid('Selecione o cliente'),
  amount_cents: z.number().int().positive('Informe o valor'),
  description: z.string().trim().max(200).transform((v) => v || null),
  paid_at: z.string().min(1, 'Informe a data'),
})

export default function AdminPayments() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [totals, setTotals] = useState<{ approved: number; count: number; d30: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [userQuery, setUserQuery] = useState('')
  const [userOptions, setUserOptions] = useState<{ id: string; email: string | null; full_name: string | null }[]>([])
  const [form, setForm] = useState({ user_id: '', amount: '', description: '', paid_at: new Date().toISOString().slice(0, 10) })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { setPage(0) }, [status])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('payments')
      .select('id, user_id, subscription_id, gateway, gateway_payment_id, amount_cents, currency, status, description, paid_at, created_at, profile:profiles(email, full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (status) query = query.eq('status', status)
    const { data, count, error } = await query
    if (error) toast.error(errorMessage(error))
    setRows((data as unknown as Row[]) ?? []); setTotal(count ?? 0); setLoading(false)
  }, [page, status])
  useEffect(() => { void load() }, [load])

  const loadTotals = useCallback(async () => {
    const { data } = await supabase.from('payments').select('amount_cents, paid_at').eq('status', 'approved').limit(50000)
    const list = (data as { amount_cents: number; paid_at: string | null }[]) ?? []
    const since = Date.now() - 30 * 86400000
    setTotals({
      approved: list.reduce((s, p) => s + p.amount_cents, 0),
      count: list.length,
      d30: list.filter((p) => p.paid_at && new Date(p.paid_at).getTime() > since).reduce((s, p) => s + p.amount_cents, 0),
    })
  }, [])
  useEffect(() => { void loadTotals() }, [loadTotals])

  useEffect(() => {
    if (!open) return
    const term = sanitizeSearch(userQuery)
    const t = setTimeout(async () => {
      let q = supabase.from('profiles').select('id, email, full_name').order('created_at', { ascending: false }).limit(20)
      if (term) q = q.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
      const { data } = await q
      setUserOptions(data ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [userQuery, open])

  async function saveManual() {
    const parsed = manualSchema.safeParse({
      user_id: form.user_id, amount_cents: reaisToCents(form.amount) ?? 0, description: form.description, paid_at: form.paid_at,
    })
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return }
    setSaving(true)
    const { data: sub } = await supabase.from('subscriptions').select('id').eq('user_id', parsed.data.user_id)
      .in('status', ['active', 'past_due', 'paused', 'pending']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const { error } = await supabase.from('payments').insert({
      user_id: parsed.data.user_id, subscription_id: sub?.id ?? null, gateway: 'manual', amount_cents: parsed.data.amount_cents,
      status: 'approved', description: parsed.data.description, paid_at: new Date(`${parsed.data.paid_at}T12:00:00`).toISOString(),
    })
    setSaving(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Pagamento registrado. Para liberar acesso, use “Conceder acesso” em Clientes.')
    setOpen(false); setForm({ user_id: '', amount: '', description: '', paid_at: new Date().toISOString().slice(0, 10) })
    void load(); void loadTotals()
  }

  return (
    <div>
      <PageHeader title="Pagamentos" description="Cobranças recebidas pelo gateway e pagamentos registrados manualmente."
        actions={<Button onClick={() => { setErrors({}); setOpen(true) }} icon={<Plus className="h-4 w-4" />}>Registrar pagamento manual</Button>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard loading={!totals} label="Total aprovado" icon={<Receipt />} tone="green" value={formatBRL(totals?.approved ?? 0)} hint={`${totals?.count ?? 0} pagamento(s)`} />
        <StatCard loading={!totals} label="Aprovado em 30 dias" icon={<Receipt />} tone="green" value={formatBRL(totals?.d30 ?? 0)} />
        <StatCard loading={loading} label="Registros no filtro" icon={<Receipt />} value={total} />
      </div>

      <FilterBar>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </FilterBar>

      <DataTable<Row> loading={loading} rows={rows} rowKey={(r) => r.id}
        empty={{ icon: <Receipt />, title: 'Nenhum pagamento', description: 'Pagamentos do Mercado Pago aparecem aqui após a configuração do webhook.' }}
        columns={[
          { header: 'Cliente', cell: (r) => <span><span className="block font-medium">{r.profile?.full_name || 'Sem nome'}</span><span className="block text-xs text-muted">{r.profile?.email}</span></span> },
          { header: 'Valor', cell: (r) => <span className="font-medium tabular-nums">{formatBRL(r.amount_cents)}</span> },
          { header: 'Status', cell: (r) => <StatusBadge kind="payment" status={r.status} /> },
          { header: 'Origem', cell: (r) => <span className="text-muted">{GATEWAY[r.gateway] ?? r.gateway}{r.gateway_payment_id ? ` · #${r.gateway_payment_id}` : ''}</span> },
          { header: 'Descrição', cell: (r) => <span className="text-muted">{r.description ?? '—'}</span> },
          { header: 'Pago em', cell: (r) => <span className="text-muted">{formatDate(r.paid_at ?? r.created_at)}</span> },
        ]} />
      <Pagination page={page} total={total} onChange={setPage} />

      <Modal open={open} onClose={() => setOpen(false)} title="Registrar pagamento manual" description="Para PIX, boleto ou transferência recebidos fora do gateway."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={saving} onClick={saveManual}>Registrar</Button></>}>
        <div className="space-y-4">
          <Input label="Buscar cliente" placeholder="Nome ou e-mail" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
          <Select label="Cliente" value={form.user_id} error={errors.user_id} onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}>
            <option value="">Selecione</option>
            {userOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name ? `${u.full_name} — ` : ''}{u.email}</option>)}
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Valor (R$)" inputMode="decimal" placeholder="79,90" value={form.amount} error={errors.amount_cents} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            <Input label="Data do pagamento" type="date" value={form.paid_at} error={errors.paid_at} onChange={(e) => setForm((f) => ({ ...f, paid_at: e.target.value }))} />
          </div>
          <Input label="Descrição" placeholder="Ex.: PIX — plano anual" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
      </Modal>
    </div>
  )
}

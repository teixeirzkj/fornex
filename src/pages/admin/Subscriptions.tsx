import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Ban, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage, formatDate } from '@/lib/utils'
import type { Subscription, SubscriptionStatus } from '@/types/db'
import { DataTable, FilterBar, PAGE_SIZE, PageHeader, Pagination, StatusBadge } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Badge, Notice } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'

type Row = Subscription & { plan: { name: string; interval: string } | null; profile: { email: string | null; full_name: string | null } | null }

const STATUSES: [SubscriptionStatus, string][] = [
  ['active', 'Ativas'], ['pending', 'Pendentes'], ['past_due', 'Em atraso'], ['paused', 'Pausadas'], ['canceled', 'Canceladas'], ['expired', 'Expiradas'],
]
const GATEWAY: Record<string, string> = { none: 'Gratuito', manual: 'Manual', mercadopago: 'Mercado Pago', stripe: 'Stripe' }

export default function AdminSubscriptions() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [gateway, setGateway] = useState('')
  const [toCancel, setToCancel] = useState<Row | null>(null)
  const [periodFor, setPeriodFor] = useState<Row | null>(null)
  const [periodEnd, setPeriodEnd] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setPage(0) }, [status, gateway])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('subscriptions')
      .select('id, user_id, plan_id, status, gateway, gateway_subscription_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at, plan:plans(name, interval), profile:profiles(email, full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (status) query = query.eq('status', status)
    if (gateway) query = query.eq('gateway', gateway)
    const { data, count, error } = await query
    if (error) toast.error(errorMessage(error))
    setRows((data as unknown as Row[]) ?? []); setTotal(count ?? 0); setLoading(false)
  }, [page, status, gateway])
  useEffect(() => { void load() }, [load])

  async function cancel() {
    if (!toCancel) return
    const { error } = await supabase.from('subscriptions').update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('id', toCancel.id)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Assinatura cancelada.')
    void load()
  }

  async function savePeriod() {
    if (!periodFor) return
    setSaving(true)
    const value = periodEnd ? new Date(`${periodEnd}T23:59:59`).toISOString() : null
    const { error } = await supabase.from('subscriptions').update({ current_period_end: value }).eq('id', periodFor.id)
    setSaving(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Período atualizado.')
    setPeriodFor(null); void load()
  }

  return (
    <div>
      <PageHeader title="Assinaturas" description="Status das assinaturas. Assinaturas do Mercado Pago são atualizadas automaticamente pelo webhook." />
      <FilterBar>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select value={gateway} onChange={(e) => setGateway(e.target.value)} aria-label="Origem">
          <option value="">Todas as origens</option>
          {Object.entries(GATEWAY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </FilterBar>

      <DataTable<Row> loading={loading} rows={rows} rowKey={(r) => r.id}
        empty={{ icon: <Layers />, title: 'Nenhuma assinatura', description: 'As assinaturas aparecem quando clientes contratam um plano.' }}
        columns={[
          { header: 'Cliente', cell: (r) => <span><span className="block font-medium">{r.profile?.full_name || 'Sem nome'}</span><span className="block text-xs text-muted">{r.profile?.email}</span></span> },
          { header: 'Plano', cell: (r) => r.plan?.name ?? '—' },
          {
            header: 'Status', cell: (r) => (
              <span className="flex flex-wrap items-center gap-1.5"><StatusBadge kind="subscription" status={r.status} />
                {r.cancel_at_period_end && r.status === 'active' && <Badge tone="amber">Cancela no fim do período</Badge>}</span>
            ),
          },
          { header: 'Origem', cell: (r) => <span className="text-muted">{GATEWAY[r.gateway] ?? r.gateway}</span> },
          { header: 'Válida até', cell: (r) => <span className="text-muted">{r.current_period_end ? formatDate(r.current_period_end) : 'Sem expiração'}</span> },
          { header: 'Criada', cell: (r) => <span className="text-muted">{formatDate(r.created_at)}</span> },
          {
            header: 'Ações', className: 'text-right', cell: (r) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" aria-label="Alterar período" title="Alterar período"
                  onClick={() => { setPeriodFor(r); setPeriodEnd(r.current_period_end ? r.current_period_end.slice(0, 10) : '') }}>
                  <CalendarClock className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Cancelar" title="Cancelar" className="hover:text-red-400"
                  disabled={r.status === 'canceled' || r.status === 'expired'} onClick={() => setToCancel(r)}>
                  <Ban className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]} />
      <Pagination page={page} total={total} onChange={setPage} />

      <Modal open={!!periodFor} onClose={() => setPeriodFor(null)} title="Alterar validade" description={periodFor?.profile?.email ?? undefined}
        footer={<><Button variant="secondary" onClick={() => setPeriodFor(null)}>Cancelar</Button><Button loading={saving} onClick={savePeriod}>Salvar</Button></>}>
        <div className="space-y-4">
          <Input label="Válida até" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} hint="Deixe em branco para sem expiração." />
          {periodFor?.gateway === 'mercadopago' && (
            <Notice tone="warning" title="Assinatura do Mercado Pago">A próxima cobrança aprovada pelo gateway pode sobrescrever esta data.</Notice>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!toCancel} onClose={() => setToCancel(null)} onConfirm={cancel} confirmLabel="Cancelar assinatura"
        title="Cancelar esta assinatura?"
        description={toCancel?.gateway === 'mercadopago'
          ? 'O acesso é removido imediatamente na FORNEX. Atenção: isto não cancela a cobrança no Mercado Pago — cancele também no painel do Mercado Pago ou peça ao cliente para cancelar em Minha assinatura.'
          : 'O acesso do cliente é removido imediatamente.'} />
    </div>
  )
}

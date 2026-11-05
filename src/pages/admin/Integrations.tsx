import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plug, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { cn, errorMessage, timeAgo } from '@/lib/utils'
import type { Integration, IntegrationType } from '@/types/db'
import { DataTable, FilterBar, INTEGRATION_TYPES, PageHeader, StatusBadge, SupplierPicker } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Badge, Notice } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'

const schema = z.object({
  supplier_id: z.string().uuid('Selecione o fornecedor'),
  name: z.string().trim().min(2, 'Informe um nome').max(120),
  type: z.enum(['rest_api', 'webhook', 'csv', 'manual']),
})

export default function AdminIntegrations() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<{ supplier_id: string; name: string; type: IntegrationType }>({ supplier_id: '', name: '', type: 'rest_api' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('integrations')
      .select('id, supplier_id, name, type, status, config, sync_interval_minutes, last_sync_at, last_sync_status, last_error, created_at, updated_at, supplier:suppliers(id, name)')
      .order('created_at', { ascending: false }).limit(200)
    if (status) q = q.eq('status', status)
    if (type) q = q.eq('type', type)
    const { data, error } = await q
    if (error) toast.error(errorMessage(error))
    setRows((data as unknown as Integration[]) ?? []); setLoading(false)
  }, [status, type])
  useEffect(() => { void load() }, [load])

  async function create() {
    const parsed = schema.safeParse(form)
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return }
    setSaving(true)
    const { data, error } = await supabase.from('integrations').insert({ ...parsed.data, status: 'draft', config: {} }).select('id').single()
    setSaving(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Integração criada. Configure a conexão.')
    navigate(`/admin/integracoes/${data.id}`)
  }

  return (
    <div>
      <PageHeader title="Integrações" description="Conecte a FORNEX aos sistemas dos fornecedores para manter produtos e estoque atualizados."
        actions={<Button onClick={() => { setErrors({}); setOpen(true) }} icon={<Plus className="h-4 w-4" />}>Nova integração</Button>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.entries(INTEGRATION_TYPES) as [IntegrationType, (typeof INTEGRATION_TYPES)[IntegrationType]][]).map(([k, t]) => (
          <div key={k} className="card p-4">
            <p className="text-sm font-semibold">{t.label}</p>
            <p className="mt-1 text-xs text-muted">{t.description}</p>
          </div>
        ))}
      </div>

      <FilterBar>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="active">Ativas</option>
          <option value="paused">Pausadas</option>
          <option value="error">Com erro</option>
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(INTEGRATION_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </Select>
      </FilterBar>

      <DataTable<Integration> loading={loading} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/admin/integracoes/${r.id}`)}
        empty={{
          icon: <Plug />, title: 'Nenhuma integração', description: 'Crie uma integração para um fornecedor que ofereça API, webhook ou planilha.',
          action: <Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>Nova integração</Button>,
        }}
        columns={[
          { header: 'Integração', cell: (r) => <span><span className="block font-medium">{r.name}</span><span className="block text-xs text-muted">{r.supplier?.name ?? '—'}</span></span> },
          { header: 'Tipo', cell: (r) => <Badge>{INTEGRATION_TYPES[r.type].label}</Badge> },
          { header: 'Status', cell: (r) => <StatusBadge kind="integration" status={r.status} /> },
          { header: 'Última sincronização', cell: (r) => <span className="text-muted">{r.last_sync_at ? timeAgo(r.last_sync_at) : 'Nunca'}</span> },
          {
            header: 'Resultado', cell: (r) => r.last_sync_status
              ? <Badge tone={r.last_sync_status === 'success' ? 'green' : r.last_sync_status === 'partial' ? 'amber' : 'red'}>
                {{ success: 'Sucesso', partial: 'Parcial', error: 'Erro' }[r.last_sync_status]}</Badge>
              : <span className="text-muted">—</span>,
          },
        ]} />

      <Modal open={open} onClose={() => setOpen(false)} title="Nova integração"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={saving} onClick={create}>Criar e configurar</Button></>}>
        <div className="space-y-4">
          <SupplierPicker value={form.supplier_id} onChange={(v) => setForm((f) => ({ ...f, supplier_id: v }))} required />
          {errors.supplier_id && <p className="-mt-2 text-xs text-red-400">{errors.supplier_id}</p>}
          <Input label="Nome" placeholder="Ex.: API de produtos" value={form.name} error={errors.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <div>
            <span className="label">Tipo</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.entries(INTEGRATION_TYPES) as [IntegrationType, (typeof INTEGRATION_TYPES)[IntegrationType]][]).map(([k, t]) => (
                <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, type: k }))} aria-pressed={form.type === k}
                  className={cn('rounded-fx-md border p-3 text-left transition', form.type === k ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/40')}>
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{t.description}</span>
                </button>
              ))}
            </div>
          </div>
          <Notice title="Somente integrações autorizadas">Use apenas APIs, webhooks ou planilhas fornecidos pelo próprio fornecedor. Não há coleta automática (scraping) de sites.</Notice>
        </div>
      </Modal>
    </div>
  )
}

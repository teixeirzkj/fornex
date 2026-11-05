import { useCallback, useEffect, useState } from 'react'
import { Gift, Search, Shield, ShieldCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sanitizeSearch } from '@/lib/api'
import { errorMessage, formatDate, initials } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { PLAN_COLUMNS } from '@/hooks/usePlans'
import type { Plan, Profile, Subscription } from '@/types/db'
import { DataTable, FilterBar, PAGE_SIZE, PageHeader, Pagination, StatusBadge } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Badge, Notice } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'

type Row = Profile & { subscriptions: (Pick<Subscription, 'id' | 'status' | 'current_period_end' | 'created_at'> & { plan: { name: string } | null })[] }

const LIVE = ['active', 'past_due', 'paused', 'pending']

export default function AdminCustomers() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [role, setRole] = useState('')
  const [plans, setPlans] = useState<Plan[]>([])
  const [grantFor, setGrantFor] = useState<Row | null>(null)
  const [grantPlan, setGrantPlan] = useState('')
  const [grantDays, setGrantDays] = useState('30')
  const [granting, setGranting] = useState(false)
  const [roleFor, setRoleFor] = useState<Row | null>(null)

  useEffect(() => { const t = setTimeout(() => setDebounced(sanitizeSearch(q)), 300); return () => clearTimeout(t) }, [q])
  useEffect(() => { setPage(0) }, [debounced, role])
  useEffect(() => {
    supabase.from('plans').select(PLAN_COLUMNS).order('sort_order').then(({ data }) => setPlans((data as Plan[]) ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('profiles')
      .select('id, email, full_name, phone, company, avatar_url, role, created_at, subscriptions(id, status, current_period_end, created_at, plan:plans(name))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (debounced) query = query.or(`email.ilike.%${debounced}%,full_name.ilike.%${debounced}%`)
    if (role) query = query.eq('role', role)
    const { data, count, error } = await query
    if (error) toast.error(errorMessage(error))
    setRows((data as unknown as Row[]) ?? []); setTotal(count ?? 0); setLoading(false)
  }, [page, debounced, role])
  useEffect(() => { void load() }, [load])

  const liveSub = (r: Row) => [...(r.subscriptions ?? [])].filter((s) => LIVE.includes(s.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

  async function grant() {
    if (!grantFor || !grantPlan) { toast.error('Selecione um plano.'); return }
    const days = grantDays === 'forever' ? null : Number(grantDays)
    setGranting(true)
    const { error } = await supabase.rpc('admin_grant_subscription', { p_user_id: grantFor.id, p_plan_id: grantPlan, p_days: days })
    setGranting(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Acesso concedido.')
    setGrantFor(null); void load()
  }

  async function toggleRole() {
    if (!roleFor) return
    const next = roleFor.role === 'admin' ? 'customer' : 'admin'
    const { error } = await supabase.rpc('admin_set_role', { p_user_id: roleFor.id, p_role: next })
    if (error) { toast.error(errorMessage(error)); return }
    toast.success(next === 'admin' ? 'Usuário agora é administrador.' : 'Acesso de administrador removido.')
    void load()
  }

  return (
    <div>
      <PageHeader title="Clientes" description="Usuários cadastrados na plataforma, com plano atual e permissões." />
      <FilterBar>
        <div className="sm:col-span-2"><Input placeholder="Buscar por nome ou e-mail…" icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" /></div>
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Papel">
          <option value="">Todos os papéis</option>
          <option value="customer">Clientes</option>
          <option value="admin">Administradores</option>
        </Select>
      </FilterBar>

      <DataTable<Row> loading={loading} rows={rows} rowKey={(r) => r.id}
        empty={{ icon: <Users />, title: 'Nenhum usuário encontrado', description: 'Novos cadastros aparecem aqui automaticamente.' }}
        columns={[
          {
            header: 'Usuário', cell: (r) => (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted">{initials(r.full_name || r.email)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.full_name || 'Sem nome'}</span>
                  <span className="block truncate text-xs text-muted">{r.email}</span>
                </span>
              </div>
            ),
          },
          { header: 'Papel', cell: (r) => r.role === 'admin' ? <Badge tone="blue"><ShieldCheck className="h-3 w-3" />Admin</Badge> : <Badge>Cliente</Badge> },
          {
            header: 'Plano', cell: (r) => {
              const s = liveSub(r)
              return s ? (
                <div className="flex flex-col gap-1">
                  <span className="text-sm">{s.plan?.name ?? '—'}</span>
                  <span className="flex items-center gap-2"><StatusBadge kind="subscription" status={s.status} />
                    {s.current_period_end && <span className="text-xs text-muted">até {formatDate(s.current_period_end)}</span>}</span>
                </div>
              ) : <span className="text-muted">Sem assinatura</span>
            },
          },
          { header: 'Cadastro', cell: (r) => <span className="text-muted">{formatDate(r.created_at)}</span> },
          {
            header: 'Ações', className: 'text-right', cell: (r) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" icon={<Gift className="h-4 w-4" />}
                  onClick={() => { setGrantFor(r); setGrantPlan(plans.find((p) => p.interval !== 'free')?.id ?? ''); setGrantDays('30') }}>Conceder acesso</Button>
                <Button variant="ghost" size="sm" icon={<Shield className="h-4 w-4" />} disabled={r.id === user?.id && r.role === 'admin'}
                  onClick={() => setRoleFor(r)}>{r.role === 'admin' ? 'Remover admin' : 'Tornar admin'}</Button>
              </div>
            ),
          },
        ]} />
      <Pagination page={page} total={total} onChange={setPage} />

      <Modal open={!!grantFor} onClose={() => setGrantFor(null)} title="Conceder acesso" description={grantFor?.email ?? undefined}
        footer={<><Button variant="secondary" onClick={() => setGrantFor(null)}>Cancelar</Button><Button loading={granting} onClick={grant}>Conceder</Button></>}>
        <div className="space-y-4">
          <Notice title="Acesso manual">Use para cortesias ou pagamentos recebidos fora do gateway. Qualquer assinatura ativa do usuário será substituída.</Notice>
          <Select label="Plano" value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)}>
            <option value="">Selecione</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_active ? '' : ' (inativo)'}</option>)}
          </Select>
          <Select label="Duração" value={grantDays} onChange={(e) => setGrantDays(e.target.value)}>
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="365">1 ano</option>
            <option value="forever">Sem expiração</option>
          </Select>
        </div>
      </Modal>

      <ConfirmDialog open={!!roleFor} onClose={() => setRoleFor(null)} onConfirm={toggleRole} tone={roleFor?.role === 'admin' ? 'danger' : 'primary'}
        confirmLabel={roleFor?.role === 'admin' ? 'Remover admin' : 'Tornar admin'}
        title={roleFor?.role === 'admin' ? 'Remover acesso de administrador?' : 'Tornar este usuário administrador?'}
        description={roleFor?.role === 'admin' ? `${roleFor?.email} perderá acesso ao painel administrativo.`
          : `${roleFor?.email} terá acesso total ao painel administrativo, incluindo clientes, pagamentos e integrações.`} />
    </div>
  )
}

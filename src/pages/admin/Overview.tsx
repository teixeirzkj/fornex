import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, Building, CircleX, Eye, Layers, Megaphone, Package, Plug, Plus, TrendingUp, Upload, UserPlus, Users, Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatBRL, formatNumber, timeAgo } from '@/lib/utils'
import type { AdminMetrics, IntegrationLog } from '@/types/db'
import { PageHeader, StatCard } from '@/components/admin/AdminUI'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, Notice, Skeleton } from '@/components/ui/Feedback'

type Top = { supplier_id: string; name: string; views: number }

export default function AdminOverview() {
  const [m, setM] = useState<AdminMetrics | null>(null)
  const [top, setTop] = useState<Top[]>([])
  const [errors, setErrors] = useState<(IntegrationLog & { integration?: { name: string } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.rpc('admin_metrics'),
      supabase.rpc('admin_top_suppliers', { p_limit: 5 }),
      supabase.from('integration_logs').select('id, integration_id, supplier_id, level, event, message, items_processed, details, created_at, integration:integrations(name)')
        .eq('level', 'error').order('created_at', { ascending: false }).limit(6),
    ]).then(([a, b, c]) => {
      if (a.error) setFailed(true)
      setM((a.data as AdminMetrics) ?? null)
      setTop((b.data as Top[]) ?? [])
      setErrors((c.data as never[]) ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <PageHeader title="Visão geral" description="Indicadores reais calculados a partir do banco de dados."
        actions={<>
          <ButtonLink to="/admin/fornecedores/novo" icon={<Plus className="h-4 w-4" />}>Novo fornecedor</ButtonLink>
          <ButtonLink to="/admin/importar" variant="secondary" icon={<Upload className="h-4 w-4" />}>Importar planilha</ButtonLink>
        </>} />

      {failed && <div className="mb-6"><Notice tone="warning" title="Não foi possível carregar os indicadores">Verifique se a migration foi aplicada e se seu usuário tem papel de administrador.</Notice></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label="Receita recorrente (MRR)" icon={<TrendingUp />} tone="green" value={formatBRL(m?.mrr_cents ?? 0)} hint="Planos anuais divididos por 12" />
        <StatCard loading={loading} label="Receita 30 dias" icon={<Wallet />} tone="green" value={formatBRL(m?.revenue_30d_cents ?? 0)} hint="Pagamentos aprovados" />
        <StatCard loading={loading} label="Assinaturas ativas" icon={<Layers />} value={formatNumber(m?.active_subscriptions)} hint={`${formatNumber(m?.paid_subscriptions ?? 0)} pagas`} />
        <StatCard loading={loading} label="Clientes" icon={<Users />} value={formatNumber(m?.customers)} hint={<span className="inline-flex items-center gap-1"><UserPlus className="h-3 w-3" />{formatNumber(m?.new_customers_30d ?? 0)} nos últimos 30 dias</span>} />
        <StatCard loading={loading} label="Fornecedores" icon={<Building />} value={formatNumber(m?.suppliers_published)} hint={`publicados de ${formatNumber(m?.suppliers ?? 0)} cadastrados`} />
        <StatCard loading={loading} label="Produtos" icon={<Package />} value={formatNumber(m?.products)} hint="No catálogo de fornecedores" />
        <StatCard loading={loading} label="Integrações" icon={<Plug />} tone={m?.integrations_error ? 'red' : 'blue'} value={formatNumber(m?.integrations_active)}
          hint={m?.integrations_error ? `${m.integrations_error} com erro` : 'ativas, nenhuma com erro'} />
        <StatCard loading={loading} label="Visualizações 30 dias" icon={<Eye />} value={formatNumber(m?.views_30d)} hint="Fornecedores abertos por assinantes" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Fornecedores mais acessados</h2>
            <Link to="/admin/fornecedores" className="text-sm text-accent hover:underline">Ver todos</Link>
          </div>
          {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            : top.length === 0 ? <EmptyState icon={<Activity />} title="Sem dados ainda" description="Os acessos aparecem aqui quando assinantes abrirem fornecedores." />
              : (
                <ol className="space-y-2">
                  {top.map((t, i) => {
                    const max = Math.max(1, ...top.map((x) => Number(x.views)))
                    return (
                      <li key={t.supplier_id}>
                        <Link to={`/admin/fornecedores/${t.supplier_id}`} className="block rounded-fx-md p-2 hover:bg-surface-2/50">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate"><span className="mr-2 text-muted tabular-nums">{i + 1}.</span>{t.name}</span>
                            <span className="tabular-nums text-muted">{formatNumber(Number(t.views))}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-fornex-blue" style={{ width: `${(Number(t.views) / max) * 100}%` }} />
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Erros recentes de integração</h2>
            <Link to="/admin/integracoes" className="text-sm text-accent hover:underline">Integrações</Link>
          </div>
          {loading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            : errors.length === 0 ? <EmptyState icon={<Plug />} title="Nenhum erro registrado" description="Falhas de sincronização, webhook ou importação aparecem aqui." />
              : (
                <ul className="space-y-2">
                  {errors.map((e) => (
                    <li key={e.id}>
                      <Link to={e.integration_id ? `/admin/integracoes/${e.integration_id}` : '/admin/integracoes'}
                        className="flex gap-3 rounded-fx-md border border-red-500/20 bg-red-500/[.05] p-3 hover:bg-red-500/10">
                        <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                        <div className="min-w-0 text-sm">
                          <p className="truncate font-medium">{e.integration?.name ?? 'Importação'} · {e.event}</p>
                          <p className="truncate text-muted">{e.message}</p>
                          <p className="mt-0.5 text-xs text-muted">{timeAgo(e.created_at)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
        </section>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/admin/integracoes', icon: Plug, label: 'Configurar integração' },
          { to: '/admin/atualizacoes', icon: Megaphone, label: 'Publicar atualização' },
          { to: '/admin/clientes', icon: Users, label: 'Gerenciar clientes' },
          { to: '/admin/planos', icon: Layers, label: 'Revisar planos' },
        ].map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className="card flex items-center gap-3 p-4 text-sm font-medium transition hover:border-accent/40">
            <span className="grid h-9 w-9 place-items-center rounded-fx-sm bg-accent/10 text-accent"><Icon className="h-4 w-4" /></span>
            {label}
          </Link>
        ))}
      </section>
    </div>
  )
}

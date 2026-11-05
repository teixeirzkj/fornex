import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import type { IntegrationStatus, PaymentStatus, SubscriptionStatus } from '@/types/db'

export const PAGE_SIZE = 20

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, icon, tone = 'blue', loading }: {
  label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red'; loading?: boolean
}) {
  const tones = {
    blue: 'bg-accent/10 text-accent', green: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400', red: 'bg-red-500/10 text-red-400',
  }
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.3 }} className="card p-3 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium uppercase leading-tight tracking-wider text-muted sm:text-xs">{label}</p>
        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-fx-sm sm:h-8 sm:w-8 [&>svg]:h-3.5 [&>svg]:w-3.5 sm:[&>svg]:h-4 sm:[&>svg]:w-4', tones[tone])}>{icon}</span>
      </div>
      {loading ? <Skeleton className="mt-2 h-7 w-20 sm:mt-3 sm:h-8 sm:w-24" /> : <p className="mt-2 truncate font-heading text-lg font-bold text-fg sm:mt-3 sm:text-2xl">{value}</p>}
      {hint && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted sm:mt-1 sm:text-xs">{hint}</p>}
    </motion.div>
  )
}

export interface Column<T> { header: string; cell: (row: T) => ReactNode; className?: string }

/** Tabela com skeleton, estado vazio e rolagem horizontal própria no mobile */
export function DataTable<T>({ columns, rows, loading, rowKey, empty, onRowClick }: {
  columns: Column<T>[]; rows: T[]; loading?: boolean; rowKey: (r: T) => string
  empty?: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode }
  onRowClick?: (r: T) => void
}) {
  if (!loading && rows.length === 0 && empty) return <EmptyState {...empty} />
  return (
    <div className="card overflow-hidden">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/40">
              {columns.map((c) => (
                <th key={c.header} className={cn('px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted', c.className)}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  {columns.map((c) => <td key={c.header} className="px-4 py-3.5"><Skeleton className="h-4 w-full max-w-[160px]" /></td>)}
                </tr>
              ))
              : rows.map((r) => (
                <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn('border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/40', onRowClick && 'cursor-pointer')}>
                  {columns.map((c) => <td key={c.header} className={cn('px-4 py-3 align-middle text-fg', c.className)}>{c.cell(r)}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Pagination({ page, total, pageSize = PAGE_SIZE, onChange }: {
  page: number; total: number; pageSize?: number; onChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
      <span>{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} de {total}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">{page + 1} / {pages}</span>
        <Button variant="secondary" size="sm" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima página">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

const SUB_STATUS: Record<SubscriptionStatus, [string, 'green' | 'amber' | 'red' | 'neutral' | 'blue']> = {
  active: ['Ativa', 'green'], pending: ['Pendente', 'amber'], past_due: ['Em atraso', 'amber'],
  paused: ['Pausada', 'neutral'], canceled: ['Cancelada', 'red'], expired: ['Expirada', 'neutral'],
}
const PAY_STATUS: Record<PaymentStatus, [string, 'green' | 'amber' | 'red' | 'neutral' | 'blue']> = {
  approved: ['Aprovado', 'green'], pending: ['Pendente', 'amber'], in_process: ['Em análise', 'amber'],
  rejected: ['Recusado', 'red'], refunded: ['Estornado', 'neutral'], canceled: ['Cancelado', 'neutral'],
}
const INT_STATUS: Record<IntegrationStatus, [string, 'green' | 'amber' | 'red' | 'neutral' | 'blue']> = {
  draft: ['Rascunho', 'neutral'], active: ['Ativa', 'green'], paused: ['Pausada', 'amber'], error: ['Com erro', 'red'],
}

export function StatusBadge({ kind, status }: { kind: 'subscription' | 'payment' | 'integration'; status: string }) {
  const map = (kind === 'subscription' ? SUB_STATUS : kind === 'payment' ? PAY_STATUS : INT_STATUS) as Record<string, [string, 'green' | 'amber' | 'red' | 'neutral' | 'blue']>
  const [label, tone] = map[status] ?? [status, 'neutral']
  return <Badge tone={tone}>{label}</Badge>
}

export const INTEGRATION_TYPES = {
  rest_api: { label: 'API REST', description: 'Puxa produtos automaticamente da API do fornecedor.' },
  webhook: { label: 'Webhook', description: 'O sistema do fornecedor envia os produtos para a FORNEX.' },
  csv: { label: 'Planilha (CSV/Excel)', description: 'Atualização por importação de planilha no painel.' },
  manual: { label: 'Manual', description: 'Produtos e dados cadastrados à mão pelo administrador.' },
} as const

/** Lista de fornecedores (id, nome) para selects */
export function useSupplierOptions() {
  const [options, setOptions] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('suppliers').select('id, name').order('name').limit(1000)
      .then(({ data }) => { setOptions(data ?? []); setLoading(false) })
  }, [])
  return { options, loading }
}

export function SupplierPicker({ value, onChange, label = 'Fornecedor', required }: {
  value: string; onChange: (id: string) => void; label?: string; required?: boolean
}) {
  const { options, loading } = useSupplierOptions()
  return (
    <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading} required={required}>
      <option value="">{loading ? 'Carregando…' : options.length ? 'Selecione um fornecedor' : 'Nenhum fornecedor cadastrado'}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </Select>
  )
}

/** Converte "79,90" / "79.90" / "1.234,56" em centavos */
export function reaisToCents(input: string): number | null {
  const s = input.trim()
  if (!s) return null
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normalized.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}
export const centsToReais = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))

/** Tabela ou lista: pequenos filtros em linha */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">{children}</div>
}

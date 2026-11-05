import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ExternalLink, Megaphone, Pause, Play, RefreshCw, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { callFunction, FunctionError } from '@/lib/api'
import { formatBRL, timeAgo } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import type { MlAccount, MlListing } from '@/types/db'
import { PageHeader } from '@/components/app/Shared'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { fadeUp, stagger } from '@/components/ui/motion'

const COLUMNS = 'id, ml_account_id, supplier_product_id, ml_item_id, permalink, title, price_cents, markup_percent, listing_type, available_quantity, status, last_error, last_synced_at, created_at'
const STATUS: Record<MlListing['status'], { label: string; tone: 'green' | 'amber' | 'red' | 'neutral' | 'blue' }> = {
  active: { label: 'Ativo', tone: 'green' }, paused: { label: 'Pausado', tone: 'amber' }, closed: { label: 'Encerrado', tone: 'neutral' },
  under_review: { label: 'Em revisão', tone: 'blue' }, pending: { label: 'Processando', tone: 'blue' }, error: { label: 'Erro', tone: 'red' },
}

export default function Listings() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const loja = params.get('loja') ?? ''
  const [items, setItems] = useState<MlListing[]>([])
  const [accounts, setAccounts] = useState<Pick<MlAccount, 'id' | 'nickname'>[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [toClose, setToClose] = useState<MlListing | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const [l, a] = await Promise.all([
      supabase.from('ml_listings').select(COLUMNS).eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('ml_accounts').select('id, nickname').eq('user_id', user.id),
    ])
    setItems((l.data as MlListing[]) ?? [])
    setAccounts((a.data as Pick<MlAccount, 'id' | 'nickname'>[]) ?? [])
    setLoading(false)
  }, [user])
  useEffect(() => { void load() }, [load])

  const storeName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.nickname ?? 'Loja'])), [accounts])
  const visible = loja ? items.filter((i) => i.ml_account_id === loja) : items

  async function act(l: MlListing, action: 'pause' | 'activate' | 'close' | 'sync') {
    setBusy(l.id + action)
    try {
      const { listing } = await callFunction<{ listing: MlListing }>('ml-listings', { action, listing_id: l.id })
      setItems((prev) => prev.map((x) => (x.id === l.id ? listing : x)))
      toast.success({ pause: 'Anúncio pausado', activate: 'Anúncio reativado', close: 'Anúncio encerrado', sync: 'Preço e estoque atualizados' }[action])
    } catch (e) { toast.error((e as FunctionError).message) } finally { setBusy(null) }
  }

  return (
    <div>
      <PageHeader eyebrow="Mercado Livre" title="Meus anúncios" description="Produtos dos fornecedores publicados nas suas lojas."
        actions={accounts.length > 1 ? (
          <Select aria-label="Filtrar por loja" value={loja} onChange={(e) => setParams(e.target.value ? { loja: e.target.value } : {})} className="w-48">
            <option value="">Todas as lojas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname ?? 'Loja'}</option>)}
          </Select>
        ) : undefined} />

      {loading ? (
        <div className="space-y-2.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Megaphone />} title="Nenhum anúncio ainda"
          description={accounts.length === 0 ? 'Conecte sua loja do Mercado Livre para começar a publicar.' : 'Abra um fornecedor e clique em Publicar em um produto.'}
          action={accounts.length === 0 ? <ButtonLink to="/app/lojas">Conectar loja</ButtonLink> : <ButtonLink to="/app/fornecedores">Ver fornecedores</ButtonLink>} />
      ) : (
        <motion.ul variants={stagger(0.04)} initial="hidden" animate="show" className="space-y-2.5">
          {visible.map((l) => {
            const st = STATUS[l.status]
            return (
              <motion.li key={l.id} variants={fadeUp} className="card p-3.5 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-fg">{l.title}</p>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {storeName[l.ml_account_id] ?? 'Loja'} · {formatBRL(l.price_cents)} · margem {Number(l.markup_percent)}% · {l.available_quantity} em estoque
                      {l.last_synced_at && ` · atualizado ${timeAgo(l.last_synced_at)}`}
                    </p>
                    {l.last_error && <p className={`mt-1.5 text-xs ${l.status === 'error' ? 'text-red-400' : 'text-amber-400'}`}>{l.last_error}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {l.permalink && (
                      <a href={l.permalink} target="_blank" rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-fx-md border border-line px-3 text-sm text-fg transition hover:border-accent/50">
                        Ver <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {l.ml_item_id && l.status !== 'closed' && (
                      <>
                        <Button size="sm" variant="secondary" loading={busy === l.id + 'sync'} onClick={() => act(l, 'sync')} icon={<RefreshCw className="h-3.5 w-3.5" />}>Sincronizar</Button>
                        {l.status === 'active'
                          ? <Button size="sm" variant="secondary" loading={busy === l.id + 'pause'} onClick={() => act(l, 'pause')} icon={<Pause className="h-3.5 w-3.5" />}>Pausar</Button>
                          : <Button size="sm" variant="secondary" loading={busy === l.id + 'activate'} onClick={() => act(l, 'activate')} icon={<Play className="h-3.5 w-3.5" />}>Ativar</Button>}
                        <Button size="sm" variant="ghost" className="hover:text-red-400" onClick={() => setToClose(l)} icon={<Trash className="h-3.5 w-3.5" />}>Encerrar</Button>
                      </>
                    )}
                  </div>
                </div>
              </motion.li>
            )
          })}
        </motion.ul>
      )}

      <ConfirmDialog open={!!toClose} onClose={() => setToClose(null)} onConfirm={() => toClose ? act(toClose, 'close') : undefined}
        confirmLabel="Encerrar anúncio" title="Encerrar este anúncio?"
        description="No Mercado Livre, um anúncio encerrado não pode ser reativado. Para parar temporariamente, use Pausar." />
    </div>
  )
}

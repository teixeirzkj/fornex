import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ExternalLink, Link2, Plus, RefreshCw, Store, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { callFunction, FunctionError } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import type { MlAccount } from '@/types/db'
import { PageHeader } from '@/components/app/Shared'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, EmptyState, Notice, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'
import { fadeUp, stagger } from '@/components/ui/motion'

const ACCOUNT_COLUMNS = 'id, user_id, ml_user_id, nickname, site_id, status, expires_at, last_error, created_at'

/** Inicia a conexão: busca o link de autorização no servidor e redireciona ao Mercado Livre */
export async function connectMercadoLivre() {
  try {
    const { url } = await callFunction<{ url: string }>('ml-oauth', { action: 'start' })
    const u = new URL(url)
    if (u.protocol !== 'https:' || !u.hostname.endsWith('mercadolivre.com.br')) throw new Error('URL inválida')
    window.location.assign(u.toString())
  } catch (e) {
    const err = e as FunctionError
    toast.error(err.message || 'Não foi possível iniciar a conexão.')
  }
}

export default function Stores() {
  const { user, subscription, isAdmin, hasActiveSubscription } = useAuth()
  const [accounts, setAccounts] = useState<MlAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [toRemove, setToRemove] = useState<MlAccount | null>(null)
  const limit = isAdmin ? null : (subscription?.plan?.limits?.max_stores ?? (hasActiveSubscription ? 1 : 0))

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('ml_accounts').select(ACCOUNT_COLUMNS).eq('user_id', user.id).order('created_at')
    setAccounts((data as MlAccount[]) ?? [])
    setLoading(false)
  }, [user])
  useEffect(() => { void load() }, [load])

  const canAdd = limit == null || accounts.length < limit
  const connect = async () => { setConnecting(true); await connectMercadoLivre(); setConnecting(false) }

  const disconnect = async () => {
    if (!toRemove) return
    try {
      await callFunction('ml-oauth', { action: 'disconnect', account_id: toRemove.id })
      toast.success('Loja desconectada')
      await load()
    } catch (e) { toast.error((e as FunctionError).message) }
  }

  return (
    <div>
      <PageHeader eyebrow="Mercado Livre" title="Minhas lojas"
        description="Conecte suas contas do Mercado Livre para publicar produtos dos fornecedores direto na sua loja."
        actions={hasActiveSubscription && canAdd && accounts.length > 0
          ? <Button onClick={connect} loading={connecting} icon={<Plus className="h-4 w-4" />}>Conectar outra loja</Button> : undefined} />

      {!hasActiveSubscription && (
        <div className="mb-5">
          <Notice tone="warning" title="Ative um plano para conectar sua loja"
            action={<ButtonLink to="/app/assinatura" size="sm">Ver planos</ButtonLink>}>
            O Básico permite até 4 lojas e o Vitalício até 10.
          </Notice>
        </div>
      )}

      {limit != null && hasActiveSubscription && (
        <p className="mb-4 text-xs text-muted">{accounts.length} de {limit} {limit === 1 ? 'loja usada' : 'lojas usadas'} no seu plano.</p>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : accounts.length === 0 ? (
        <EmptyState icon={<Store />} title="Nenhuma loja conectada"
          description="Você faz login no Mercado Livre e autoriza a FORNEX. Sua senha nunca passa por aqui."
          action={hasActiveSubscription ? <Button size="lg" onClick={connect} loading={connecting} icon={<Link2 className="h-4 w-4" />}>Conectar Mercado Livre</Button> : undefined} />
      ) : (
        <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
          {accounts.map((a) => (
            <motion.div key={a.id} variants={fadeUp} className="card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-fx-md bg-[#FFE600] text-[#2D3277]"><Store className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-base font-bold text-fg">{a.nickname || `Conta ${a.ml_user_id}`}</p>
                  <p className="text-xs text-muted">Mercado Livre · conectada em {formatDate(a.created_at)}</p>
                </div>
                {a.status === 'active' ? <Badge tone="green">Conectada</Badge> : <Badge tone="amber">Reconectar</Badge>}
              </div>
              {a.status !== 'active' && a.last_error && <p className="mt-3 text-xs text-amber-400">{a.last_error}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {a.status !== 'active' && <Button size="sm" onClick={connect} icon={<RefreshCw className="h-3.5 w-3.5" />}>Reconectar</Button>}
                <ButtonLink to={`/app/anuncios?loja=${a.id}`} size="sm" variant="secondary">Ver anúncios</ButtonLink>
                <a href={`https://www.mercadolivre.com.br/perfil/${encodeURIComponent(a.nickname ?? '')}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-fx-md px-3 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">
                  Perfil <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <Button size="sm" variant="ghost" className="ml-auto hover:text-red-400" onClick={() => setToRemove(a)} icon={<Unplug className="h-3.5 w-3.5" />}>Desconectar</Button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="mt-8 rounded-fx-lg border border-line bg-surface-2/40 p-4 text-xs leading-relaxed text-muted">
        <p className="font-semibold text-fg">Como funciona</p>
        <p className="mt-1">
          1. Conecte sua loja. 2. Abra um fornecedor e clique em <strong className="text-fg">Publicar</strong> no produto. 3. Defina sua margem e o anúncio vai para o
          Mercado Livre. Quando vender, você recebe um aviso em <Link to="/app/atualizacoes" className="text-accent hover:underline">Atualizações</Link> para fazer o pedido com o fornecedor.
        </p>
      </div>

      <ConfirmDialog open={!!toRemove} onClose={() => setToRemove(null)} onConfirm={disconnect} confirmLabel="Desconectar"
        title={`Desconectar ${toRemove?.nickname ?? 'esta loja'}?`}
        description="A FORNEX deixa de gerenciar os anúncios desta loja. Os anúncios já publicados continuam no Mercado Livre." />
    </div>
  )
}

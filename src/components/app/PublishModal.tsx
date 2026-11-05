import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, ExternalLink, Store } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { callFunction, FunctionError } from '@/lib/api'
import { formatBRL } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import type { MlAccount, MlListing, SupplierProduct } from '@/types/db'
import { Modal } from '@/components/ui/Modal'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Feedback'

/** Publica um produto do fornecedor numa loja do Mercado Livre do cliente */
export function PublishModal({ product, open, onClose }: { product: SupplierProduct | null; open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState<Pick<MlAccount, 'id' | 'nickname' | 'status'>[] | null>(null)
  const [accountId, setAccountId] = useState('')
  const [markup, setMarkup] = useState('40')
  const [listingType, setListingType] = useState<'gold_special' | 'gold_pro'>('gold_special')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<MlListing | null>(null)

  useEffect(() => {
    if (!open || !user) return
    setDone(null)
    setTitle((product?.name ?? '').slice(0, 60))
    supabase.from('ml_accounts').select('id, nickname, status').eq('user_id', user.id).order('created_at').then(({ data }) => {
      const list = (data ?? []) as Pick<MlAccount, 'id' | 'nickname' | 'status'>[]
      setAccounts(list)
      setAccountId(list.find((a) => a.status === 'active')?.id ?? '')
    })
  }, [open, user, product])

  if (!product) return null
  const m = Math.max(0, Number(markup.replace(',', '.')) || 0)
  const cost = product.price_cents ?? 0
  const sale = Math.max(100, Math.round(cost * (1 + m / 100)))

  async function publish() {
    if (!accountId) return
    setBusy(true)
    try {
      const { listing } = await callFunction<{ listing: MlListing }>('ml-listings', {
        action: 'publish', account_id: accountId, supplier_product_id: product!.id,
        markup_percent: m, listing_type: listingType, title: title.trim(),
      })
      setDone(listing)
      toast.success('Produto publicado no Mercado Livre!')
    } catch (e) {
      toast.error((e as FunctionError).message || 'Não foi possível publicar.')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={done ? 'Anúncio publicado' : 'Publicar no Mercado Livre'}
      description={done ? undefined : product.name}
      footer={done ? (
        <>
          <ButtonLink to="/app/anuncios" variant="secondary">Meus anúncios</ButtonLink>
          {done.permalink && <a href={done.permalink} target="_blank" rel="noopener noreferrer"><Button icon={<ExternalLink className="h-4 w-4" />}>Ver no Mercado Livre</Button></a>}
        </>
      ) : accounts && accounts.length > 0 ? (
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={publish} loading={busy} disabled={!accountId || !cost || title.trim().length < 3}>Publicar anúncio</Button>
        </>
      ) : undefined}>
      {done ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-400"><CircleCheck className="h-7 w-7" /></span>
          <p className="mt-4 font-semibold text-fg">{done.title}</p>
          <p className="mt-1 text-sm text-muted">Publicado por {formatBRL(done.price_cents)}. O Mercado Livre pode levar alguns minutos para exibir o anúncio.</p>
        </div>
      ) : accounts === null ? (
        <p className="py-6 text-center text-sm text-muted">Carregando suas lojas…</p>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-fx-md bg-[#FFE600] text-[#2D3277]"><Store className="h-6 w-6" /></span>
          <p className="mt-4 font-semibold text-fg">Conecte sua loja primeiro</p>
          <p className="mt-1 text-sm text-muted">Para publicar, conecte sua conta do Mercado Livre.</p>
          <ButtonLink to="/app/lojas" className="mt-5">Conectar loja</ButtonLink>
        </div>
      ) : (
        <div className="space-y-4">
          {!cost && <Notice tone="warning" title="Produto sem preço do fornecedor">Não é possível calcular o preço de venda.</Notice>}
          <Select label="Loja" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id} disabled={a.status !== 'active'}>{a.nickname ?? 'Loja'}{a.status !== 'active' ? ' (reconectar)' : ''}</option>)}
          </Select>
          <Input label="Título do anúncio" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} hint={`${title.length}/60 caracteres`} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Sua margem (%)" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value.replace(/[^\d.,]/g, ''))} />
            <Select label="Tipo de anúncio" value={listingType} onChange={(e) => setListingType(e.target.value as 'gold_special' | 'gold_pro')}>
              <option value="gold_special">Clássico</option>
              <option value="gold_pro">Premium (parcela sem juros)</option>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-fx-md border border-line bg-bg/50 p-3 text-center">
            <div><p className="text-[11px] text-muted">Custo</p><p className="text-sm font-semibold text-fg">{formatBRL(cost)}</p></div>
            <div><p className="text-[11px] text-muted">Preço de venda</p><p className="text-sm font-bold text-accent">{formatBRL(sale)}</p></div>
            <div><p className="text-[11px] text-muted">Diferença</p><p className="text-sm font-semibold text-emerald-400">{formatBRL(sale - cost)}</p></div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            A diferença ainda não desconta a tarifa e o frete do Mercado Livre. Fotos, estoque e categoria vêm do fornecedor e da sugestão do Mercado Livre.
            Confira as regras de revenda em <Link to="/app/suporte" className="text-accent hover:underline">Suporte</Link>.
          </p>
        </div>
      )}
    </Modal>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, AtSign, Camera, Check, Copy, ExternalLink, Globe, Mail, MapPin, MessageCircle, Music2, Package, ThumbsUp,
  Phone, ShieldCheck, Truck, FileText, StickyNote, Lock, ImageOff, Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { copyToClipboard, formatBRL, formatDate, formatNumber, safeUrl, socialUrl, whatsappUrl } from '@/lib/utils'
import type { Supplier, SupplierProduct } from '@/types/db'
import { FavoriteButton, SupplierLogo } from '@/components/app/Shared'
import { PublishModal } from '@/components/app/PublishModal'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { EASE } from '@/components/ui/motion'

const DETAIL_COLUMNS =
  'id, name, slug, logo_url, category_id, description, city, state, phone, whatsapp, email, website, instagram, facebook, tiktok, commercial_terms, min_order, shipping_info, notes, tags, min_access_level, is_verified, is_demo, is_published, created_at, updated_at, category:supplier_categories(id, name, slug, icon)'
const PRODUCT_COLUMNS = 'id, supplier_id, integration_id, external_id, name, sku, description, price_cents, stock, image_url, product_url, is_active, updated_at'
const PRODUCTS_PAGE = 24

export default function SupplierDetail() {
  const { slug } = useParams()
  const [s, setS] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [productTotal, setProductTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [publishing, setPublishing] = useState<SupplierProduct | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      const { data } = await supabase.from('suppliers').select(DETAIL_COLUMNS).eq('slug', slug ?? '').maybeSingle()
      if (!active) return
      const sup = data as unknown as Supplier | null
      setS(sup)
      setLoading(false)
      if (sup) {
        void supabase.rpc('track_supplier_view', { p_supplier_id: sup.id })
        const p = await supabase.from('supplier_products').select(PRODUCT_COLUMNS, { count: 'exact' })
          .eq('supplier_id', sup.id).eq('is_active', true).order('name').range(0, PRODUCTS_PAGE - 1)
        if (!active) return
        setProducts((p.data as SupplierProduct[]) ?? [])
        setProductTotal(p.count ?? 0)
      }
    })()
    return () => { active = false }
  }, [slug])

  const loadMore = async () => {
    if (!s) return
    setLoadingMore(true)
    const { data } = await supabase.from('supplier_products').select(PRODUCT_COLUMNS)
      .eq('supplier_id', s.id).eq('is_active', true).order('name').range(products.length, products.length + PRODUCTS_PAGE - 1)
    setProducts((prev) => [...prev, ...((data as SupplierProduct[]) ?? [])])
    setLoadingMore(false)
  }

  if (loading) return <DetailSkeleton />
  if (!s) {
    return (
      <EmptyState icon={<Lock />} title="Fornecedor indisponível"
        description="Este fornecedor não existe ou não está incluído no seu plano atual."
        action={<div className="flex flex-wrap justify-center gap-2">
          <ButtonLink to="/app/fornecedores" variant="secondary">Voltar ao catálogo</ButtonLink>
          <ButtonLink to="/app/assinatura">Ver planos</ButtonLink>
        </div>} />
    )
  }

  const wa = whatsappUrl(s.whatsapp, `Olá! Encontrei a ${s.name} pela FORNEX e gostaria de mais informações.`)
  const site = safeUrl(s.website)
  const socials = [
    { kind: 'instagram' as const, icon: Camera, label: 'Instagram', url: socialUrl('instagram', s.instagram) },
    { kind: 'facebook' as const, icon: ThumbsUp, label: 'Facebook', url: socialUrl('facebook', s.facebook) },
    { kind: 'tiktok' as const, icon: Music2, label: 'TikTok', url: socialUrl('tiktok', s.tiktok) },
  ].filter((x) => x.url)
  const location = [s.city, s.state].filter(Boolean).join(' / ')

  const copyAll = async () => {
    const lines = [
      s.name, s.category?.name && `Categoria: ${s.category.name}`, location && `Local: ${location}`,
      s.phone && `Telefone: ${s.phone}`, s.whatsapp && `WhatsApp: ${s.whatsapp}`, s.email && `E-mail: ${s.email}`,
      site && `Site: ${site}`, s.instagram && `Instagram: ${s.instagram}`, s.min_order && `Pedido mínimo: ${s.min_order}`,
    ].filter(Boolean)
    if (await copyToClipboard(lines.join('\n'))) toast.success('Informações copiadas')
    else toast.error('Não foi possível copiar')
  }

  return (
    <div>
      <Link to="/app/fornecedores" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
      </Link>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
        className="card overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-fornex-navy via-[#14306b] to-fornex-electric sm:h-24" />
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="rounded-fx-lg bg-surface p-1 shadow-soft"><SupplierLogo name={s.name} url={s.logo_url} size="lg" /></div>
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-fg sm:text-2xl">{s.name}</h1>
                  {s.is_verified && <Badge tone="blue"><ShieldCheck className="h-3 w-3" /> Dados conferidos</Badge>}
                  {s.is_demo && <Badge tone="amber">Demonstração — dados fictícios</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  {s.category && <span className="flex items-center gap-1.5"><CategoryIcon name={s.category.icon} className="h-4 w-4" />{s.category.name}</span>}
                  {location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{location}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button icon={<MessageCircle className="h-4 w-4" />}>Chamar no WhatsApp</Button></a>}
              <Button variant="secondary" onClick={copyAll} icon={<Copy className="h-4 w-4" />}>Copiar dados</Button>
              <FavoriteButton id={s.id} name={s.name} className="h-11 w-11" />
            </div>
          </div>
          <p className="mt-4 text-xs text-muted">Última atualização: {formatDate(s.updated_at, true)}</p>
        </div>
      </motion.section>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <InfoSection icon={<FileText />} title="Sobre o fornecedor">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{s.description || 'Descrição não informada.'}</p>
            {s.tags?.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{s.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
          </InfoSection>

          <InfoSection icon={<Truck />} title="Condições comerciais">
            <dl className="grid grid-cols-2 gap-4">
              <Info label="Pedido mínimo" value={s.min_order} />
              <Info label="Envio e frete" value={s.shipping_info} />
            </dl>
            {s.commercial_terms && <p className="mt-4 whitespace-pre-line border-t border-line pt-4 text-sm leading-relaxed text-muted">{s.commercial_terms}</p>}
            {!s.min_order && !s.shipping_info && !s.commercial_terms && <p className="text-sm text-muted">Condições não informadas. Consulte diretamente o fornecedor.</p>}
          </InfoSection>

          {s.notes && (
            <InfoSection icon={<StickyNote />} title="Observações">
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{s.notes}</p>
            </InfoSection>
          )}

          <InfoSection icon={<Package />} title={`Produtos disponíveis${productTotal ? ` (${formatNumber(productTotal)})` : ''}`}>
            {products.length === 0 ? (
              <p className="text-sm text-muted">Nenhum produto cadastrado ou sincronizado para este fornecedor.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
                  {products.map((p) => <ProductCard key={p.id} p={p} onPublish={setPublishing} />)}
                </div>
                {products.length < productTotal && (
                  <div className="mt-5 flex justify-center">
                    <Button variant="secondary" loading={loadingMore} onClick={loadMore}>Carregar mais produtos</Button>
                  </div>
                )}
              </>
            )}
          </InfoSection>
        </div>

        <aside className="space-y-5">
          <InfoSection icon={<Phone />} title="Contato">
            <ul className="space-y-1">
              <ContactRow icon={<MessageCircle />} label="WhatsApp" value={s.whatsapp} href={wa} />
              <ContactRow icon={<Phone />} label="Telefone" value={s.phone} href={s.phone ? `tel:${s.phone.replace(/[^\d+]/g, '')}` : null} />
              <ContactRow icon={<Mail />} label="E-mail" value={s.email} href={s.email ? `mailto:${s.email}` : null} />
              <ContactRow icon={<Globe />} label="Site" value={site ? new URL(site).hostname : null} href={site} copyValue={site} />
            </ul>
            {!s.whatsapp && !s.phone && !s.email && !site && <p className="text-sm text-muted">Nenhum contato cadastrado.</p>}
          </InfoSection>

          {socials.length > 0 && (
            <InfoSection icon={<AtSign />} title="Redes sociais">
              <div className="flex flex-col gap-2">
                {socials.map((x) => (
                  <a key={x.kind} href={x.url!} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-fx-md border border-line px-3 py-2.5 text-sm text-fg transition hover:border-accent/40">
                    <x.icon className="h-4 w-4 text-accent" />{x.label}<ExternalLink className="ml-auto h-3.5 w-3.5 text-muted" />
                  </a>
                ))}
              </div>
            </InfoSection>
          )}

          <div className="rounded-fx-lg border border-line bg-surface-2/50 p-4 text-xs leading-relaxed text-muted">
            As negociações são feitas diretamente com o fornecedor. Confirme preços, prazos e condições antes de fechar pedidos.
          </div>
        </aside>
      </div>
      <PublishModal product={publishing} open={!!publishing} onClose={() => setPublishing(null)} />
    </div>
  )
}

function InfoSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg"><span className="text-accent [&>svg]:h-4 [&>svg]:w-4">{icon}</span>{title}</h2>
      {children}
    </section>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{value || 'Não informado'}</dd>
    </div>
  )
}

function ContactRow({ icon, label, value, href, copyValue }: { icon: ReactNode; label: string; value: string | null; href: string | null; copyValue?: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <li className="flex items-center gap-3 rounded-fx-md px-1 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-fx-sm bg-accent/10 text-accent [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted">{label}</p>
        {href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="block truncate text-sm font-medium text-fg hover:text-accent">{value}</a>
          : <p className="truncate text-sm font-medium text-fg">{value}</p>}
      </div>
      <button type="button" aria-label={`Copiar ${label}`}
        onClick={async () => { if (await copyToClipboard(copyValue ?? value)) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }}
        className="rounded-fx-sm p-2 text-muted transition hover:bg-surface-2 hover:text-fg">
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </li>
  )
}

function ProductCard({ p, onPublish }: { p: SupplierProduct; onPublish: (p: SupplierProduct) => void }) {
  const img = safeUrl(p.image_url)
  const link = safeUrl(p.product_url)
  const body = (
    <div className="flex h-full flex-col overflow-hidden rounded-fx-md border border-line bg-surface transition hover:border-accent/40">
      <div className="grid aspect-[4/3] place-items-center bg-surface-2">
        {img ? <img src={img} alt={p.name} loading="lazy" className="h-full w-full object-cover" /> : <ImageOff className="h-6 w-6 text-muted" />}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-sm font-medium text-fg">{p.name}</p>
        {p.sku && <p className="mt-0.5 text-[11px] text-muted">SKU {p.sku}</p>}
        <div className="mt-auto flex items-end justify-between pt-3">
          <span className="font-heading text-base font-bold text-fg">{p.price_cents != null ? formatBRL(p.price_cents) : 'Sob consulta'}</span>
          {p.stock != null && <span className="text-[11px] text-muted">{p.stock > 0 ? `${formatNumber(p.stock)} em estoque` : 'Sem estoque'}</span>}
        </div>
      </div>
    </div>
  )
  return (
    <div className="flex h-full flex-col">
      {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="block flex-1">{body}</a> : <div className="flex-1">{body}</div>}
      <Button size="sm" variant="subtle" className="mt-1.5 w-full" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => onPublish(p)}
        disabled={!p.price_cents || !p.stock}>
        {p.stock ? 'Publicar no ML' : 'Sem estoque'}
      </Button>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-32" />
      <div className="card overflow-hidden">
        <Skeleton className="h-24 rounded-none" />
        <div className="flex gap-4 p-6"><Skeleton className="-mt-12 h-20 w-20" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-1/4" /></div></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-48 lg:col-span-2" /><Skeleton className="h-48" />
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImageUp, Package, Pencil, Plug, Plus, Save, Trash, X } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { errorMessage, formatBRL, formatDate, slugify } from '@/lib/utils'
import { BR_STATES } from '@/lib/config'
import type { Category, Integration, Supplier, SupplierProduct } from '@/types/db'
import { centsToReais, DataTable, PageHeader, Pagination, reaisToCents, StatusBadge, INTEGRATION_TYPES } from '@/components/admin/AdminUI'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Input, Select, Switch, Textarea } from '@/components/ui/Field'
import { Badge, EmptyState, PageLoader } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'

const optText = (max: number) => z.string().trim().max(max).transform((v) => v || null)
const optUrl = z.string().trim().max(500)
  .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), 'Informe uma URL começando com https:// ou http://')
  .transform((v) => v || null)

const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  slug: z.string().regex(/^[a-z0-9-]{2,120}$/, 'Use letras minúsculas, números e hífen'),
  logo_url: optUrl,
  category_id: z.string().transform((v) => v || null),
  description: optText(4000),
  city: optText(80),
  state: z.string().refine((v) => !v || (BR_STATES as readonly string[]).includes(v), 'UF inválida').transform((v) => v || null),
  phone: optText(30),
  whatsapp: optText(30),
  email: z.string().trim().max(120).refine((v) => !v || z.email().safeParse(v).success, 'E-mail inválido').transform((v) => v || null),
  website: optUrl,
  instagram: optText(200),
  facebook: optText(200),
  tiktok: optText(200),
  commercial_terms: optText(4000),
  min_order: optText(200),
  shipping_info: optText(1000),
  notes: optText(4000),
  tags: z.array(z.string().trim().min(1).max(30)).max(20),
  min_access_level: z.number().int().min(0).max(100),
  is_verified: z.boolean(),
  is_published: z.boolean(),
}).strict()

type FormState = {
  [K in keyof Omit<z.input<typeof supplierSchema>, 'tags' | 'min_access_level' | 'is_verified' | 'is_published'>]: string
} & { tags: string[]; min_access_level: string; is_verified: boolean; is_published: boolean }

const EMPTY: FormState = {
  name: '', slug: '', logo_url: '', category_id: '', description: '', city: '', state: '', phone: '', whatsapp: '',
  email: '', website: '', instagram: '', facebook: '', tiktok: '', commercial_terms: '', min_order: '', shipping_info: '',
  notes: '', tags: [], min_access_level: '1', is_verified: false, is_published: false,
}

const SUPPLIER_COLUMNS = 'id, name, slug, logo_url, category_id, description, city, state, phone, whatsapp, email, website, instagram, facebook, tiktok, commercial_terms, min_order, shipping_info, notes, tags, min_access_level, is_verified, is_published, created_at, updated_at'

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export default function SupplierForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [slugTouched, setSlugTouched] = useState(isEdit)
  const [categories, setCategories] = useState<Pick<Category, 'id' | 'name'>[]>([])
  const [tagInput, setTagInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase.from('supplier_categories').select('id, name').order('sort_order').then(({ data }) => setCategories(data ?? []))
  }, [])

  useEffect(() => {
    if (!id) return
    supabase.from('suppliers').select(SUPPLIER_COLUMNS).eq('id', id).maybeSingle().then(({ data, error }) => {
      if (error || !data) { toast.error('Fornecedor não encontrado.'); navigate('/admin/fornecedores'); return }
      const s = data as Supplier
      const str = (v: string | null) => v ?? ''
      setForm({
        name: s.name, slug: s.slug, logo_url: str(s.logo_url), category_id: str(s.category_id), description: str(s.description),
        city: str(s.city), state: str(s.state), phone: str(s.phone), whatsapp: str(s.whatsapp), email: str(s.email),
        website: str(s.website), instagram: str(s.instagram), facebook: str(s.facebook), tiktok: str(s.tiktok),
        commercial_terms: str(s.commercial_terms), min_order: str(s.min_order), shipping_info: str(s.shipping_info),
        notes: str(s.notes), tags: s.tags ?? [], min_access_level: String(s.min_access_level),
        is_verified: s.is_verified, is_published: s.is_published,
      })
      setUpdatedAt(s.updated_at)
      setLoading(false)
    })
  }, [id, navigate])

  async function uploadLogo(file: File) {
    const types: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
    const ext = types[file.type]
    if (!ext) { toast.error('Envie uma imagem PNG, JPG ou WEBP.'); return }
    if (file.size > 2 * 1024 * 1024) { toast.error('A imagem deve ter no máximo 2 MB.'); return }
    setUploading(true)
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('supplier-logos').upload(path, file, { contentType: file.type, upsert: false })
    setUploading(false)
    if (error) { toast.error(errorMessage(error, 'Falha no envio da imagem.')); return }
    const { data } = supabase.storage.from('supplier-logos').getPublicUrl(path)
    set('logo_url', data.publicUrl)
    toast.success('Logo enviado. Salve para aplicar.')
  }

  function addTag() {
    const t = tagInput.trim().replace(/,$/, '')
    if (t && !form.tags.includes(t) && form.tags.length < 20) set('tags', [...form.tags, t.slice(0, 30)])
    setTagInput('')
  }

  async function save() {
    const parsed = supplierSchema.safeParse({ ...form, min_access_level: Number(form.min_access_level) })
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      toast.error('Revise os campos destacados.')
      return
    }
    setErrors({})
    setSaving(true)
    const payload = parsed.data
    const res = isEdit
      ? await supabase.from('suppliers').update(payload).eq('id', id!).select('id, updated_at').single()
      : await supabase.from('suppliers').insert(payload).select('id, updated_at').single()
    setSaving(false)
    if (res.error) { toast.error(errorMessage(res.error)); return }
    toast.success(isEdit ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.')
    setUpdatedAt(res.data.updated_at)
    if (!isEdit) navigate(`/admin/fornecedores/${res.data.id}`, { replace: true })
  }

  if (loading) return <PageLoader />

  const field = (k: keyof FormState, label: string, extra: Partial<Parameters<typeof Input>[0]> = {}) => (
    <Input label={label} value={form[k] as string} error={errors[k]} onChange={(e) => set(k, e.target.value as never)} {...extra} />
  )

  return (
    <div>
      <Link to="/admin/fornecedores" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Fornecedores</Link>
      <PageHeader title={isEdit ? form.name || 'Editar fornecedor' : 'Novo fornecedor'}
        description={isEdit ? `Última atualização: ${formatDate(updatedAt, true)}` : 'Preencha as informações reais do fornecedor. Campos vazios não são exibidos aos assinantes.'}
        actions={<Button onClick={save} loading={saving} icon={<Save className="h-4 w-4" />}>Salvar</Button>} />

      <div className="space-y-6">
        <Section title="Identificação">
          {field('name', 'Nome da empresa *', {
            onChange: (e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })),
          })}
          {field('slug', 'Slug (URL)', { hint: 'Gerado a partir do nome', onChange: (e) => { setSlugTouched(true); set('slug', slugify(e.target.value)) } })}
          <Select label="Categoria" value={form.category_id} onChange={(e) => set('category_id', e.target.value)} error={errors.category_id}>
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div>
            <span className="label">Logotipo</span>
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-fx-md border border-line bg-surface-2 text-muted">
                {form.logo_url ? <img src={form.logo_url} alt="Logo" className="h-full w-full object-cover" /> : <ImageUp className="h-5 w-5" />}
              </span>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = '' }} />
              <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>Enviar imagem</Button>
              {form.logo_url && <Button variant="ghost" size="sm" onClick={() => set('logo_url', '')}>Remover</Button>}
            </div>
            <p className="mt-1.5 text-xs text-muted">PNG, JPG ou WEBP até 2 MB.</p>
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Descrição" rows={4} value={form.description} error={errors.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <span className="label">Tags</span>
            <div className="field flex min-h-[44px] flex-wrap items-center gap-1.5 py-1.5">
              {form.tags.map((t) => (
                <Badge key={t} tone="blue" className="py-1">
                  {t}
                  <button type="button" aria-label={`Remover ${t}`} onClick={() => set('tags', form.tags.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder={form.tags.length ? '' : 'Digite e pressione Enter'}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }} onBlur={addTag}
                className="min-w-[140px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70" aria-label="Adicionar tag" />
            </div>
          </div>
        </Section>

        <Section title="Localização e contato">
          {field('city', 'Cidade')}
          <Select label="Estado (UF)" value={form.state} onChange={(e) => set('state', e.target.value)} error={errors.state}>
            <option value="">—</option>
            {BR_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          {field('phone', 'Telefone', { inputMode: 'tel' })}
          {field('whatsapp', 'WhatsApp', { inputMode: 'tel', hint: 'Com DDD. Ex.: 11 91234-5678' })}
          {field('email', 'E-mail', { type: 'email' })}
          {field('website', 'Site', { placeholder: 'https://' })}
          {field('instagram', 'Instagram', { placeholder: '@perfil ou URL' })}
          {field('facebook', 'Facebook', { placeholder: 'perfil ou URL' })}
          {field('tiktok', 'TikTok', { placeholder: '@perfil ou URL' })}
        </Section>

        <Section title="Condições comerciais">
          {field('min_order', 'Pedido mínimo', { placeholder: 'Ex.: R$ 300,00 ou 10 unidades' })}
          {field('shipping_info', 'Envio / logística', { placeholder: 'Ex.: envia para todo o Brasil' })}
          <div className="sm:col-span-2">
            <Textarea label="Condições comerciais" rows={4} value={form.commercial_terms} error={errors.commercial_terms} onChange={(e) => set('commercial_terms', e.target.value)}
              hint="Prazos, formas de pagamento, dropshipping, descontos por volume…" />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Observações" rows={3} value={form.notes} error={errors.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </Section>

        <Section title="Acesso e publicação" description="Defina quem pode ver este fornecedor.">
          <Select label="Nível de acesso mínimo" value={form.min_access_level} onChange={(e) => set('min_access_level', e.target.value)}
            hint="Comparado ao access_level do plano do assinante.">
            <option value="0">0 — Gratuito (todos os assinantes)</option>
            <option value="1">1 — Planos pagos</option>
            <option value="2">2 — Planos de nível 2+</option>
            {Number(form.min_access_level) > 2 && <option value={form.min_access_level}>{form.min_access_level} — Personalizado</option>}
          </Select>
          <div />
          <Switch checked={form.is_published} onChange={(v) => set('is_published', v)} label="Publicado"
            description="Visível para assinantes com nível de acesso suficiente." />
          <Switch checked={form.is_verified} onChange={(v) => set('is_verified', v)} label="Dados conferidos pela equipe"
            description="Ative somente após confirmar de verdade os contatos e dados com o fornecedor." />
        </Section>

        <div className="flex justify-end">
          <Button onClick={save} loading={saving} size="lg" icon={<Save className="h-4 w-4" />}>Salvar fornecedor</Button>
        </div>

        {isEdit && id && <ProductsSection supplierId={id} />}
        {isEdit && id && <IntegrationsSection supplierId={id} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const PRODUCT_PAGE = 10
const productSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(300),
  sku: optText(80),
  description: optText(4000),
  price_cents: z.number().int().min(0).nullable(),
  stock: z.number().int().nullable(),
  image_url: optUrl,
  product_url: optUrl,
  is_active: z.boolean(),
}).strict()

type ProductForm = { name: string; sku: string; description: string; price: string; stock: string; image_url: string; product_url: string; is_active: boolean }
const EMPTY_PRODUCT: ProductForm = { name: '', sku: '', description: '', price: '', stock: '', image_url: '', product_url: '', is_active: true }

function ProductsSection({ supplierId }: { supplierId: string }) {
  const [rows, setRows] = useState<SupplierProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierProduct | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_PRODUCT)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<SupplierProduct | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, count, error } = await supabase.from('supplier_products')
      .select('id, supplier_id, integration_id, external_id, name, sku, description, price_cents, stock, image_url, product_url, is_active, updated_at', { count: 'exact' })
      .eq('supplier_id', supplierId).order('updated_at', { ascending: false })
      .range(page * PRODUCT_PAGE, page * PRODUCT_PAGE + PRODUCT_PAGE - 1)
    if (error) toast.error(errorMessage(error))
    setRows((data as SupplierProduct[]) ?? []); setTotal(count ?? 0); setLoading(false)
  }, [supplierId, page])
  useEffect(() => { void load() }, [load])

  function openForm(p: SupplierProduct | null) {
    setEditing(p); setErrors({})
    setForm(p ? {
      name: p.name, sku: p.sku ?? '', description: p.description ?? '', price: centsToReais(p.price_cents),
      stock: p.stock == null ? '' : String(p.stock), image_url: p.image_url ?? '', product_url: p.product_url ?? '', is_active: p.is_active,
    } : EMPTY_PRODUCT)
    setOpen(true)
  }

  async function save() {
    const parsed = productSchema.safeParse({
      name: form.name, sku: form.sku, description: form.description,
      price_cents: reaisToCents(form.price), stock: form.stock.trim() === '' ? null : Number.parseInt(form.stock, 10),
      image_url: form.image_url, product_url: form.product_url, is_active: form.is_active,
    })
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return }
    setSaving(true)
    const { error } = editing
      ? await supabase.from('supplier_products').update(parsed.data).eq('id', editing.id)
      : await supabase.from('supplier_products').insert({ ...parsed.data, supplier_id: supplierId })
    setSaving(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success(editing ? 'Produto atualizado.' : 'Produto adicionado.')
    setOpen(false); void load()
  }

  async function remove() {
    if (!toDelete) return
    const { error } = await supabase.from('supplier_products').delete().eq('id', toDelete.id)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Produto excluído.'); void load()
  }

  const f = (k: keyof ProductForm) => ({ value: form[k] as string, error: errors[k === 'price' ? 'price_cents' : k], onChange: (e: { target: { value: string } }) => setForm((s) => ({ ...s, [k]: e.target.value })) })

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Produtos <span className="text-sm font-normal text-muted">({total})</span></h2>
          <p className="text-sm text-muted">Cadastre manualmente, importe por planilha ou sincronize via integração.</p>
        </div>
        <Button size="sm" onClick={() => openForm(null)} icon={<Plus className="h-4 w-4" />}>Adicionar</Button>
      </div>
      <DataTable<SupplierProduct> loading={loading} rows={rows} rowKey={(r) => r.id}
        empty={{ icon: <Package />, title: 'Nenhum produto', description: 'Este fornecedor ainda não tem produtos cadastrados.' }}
        columns={[
          {
            header: 'Produto', cell: (p) => (
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-fx-sm border border-line bg-surface-2">
                  {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Package className="h-4 w-4 text-muted" />}
                </span>
                <span className="min-w-0"><span className="block max-w-[260px] truncate font-medium">{p.name}</span>
                  <span className="block text-xs text-muted">{p.sku ? `SKU ${p.sku}` : p.external_id ? `ID ${p.external_id}` : '—'}</span></span>
              </div>
            ),
          },
          { header: 'Preço', cell: (p) => formatBRL(p.price_cents) },
          { header: 'Estoque', cell: (p) => (p.stock == null ? '—' : p.stock) },
          { header: 'Origem', cell: (p) => <Badge tone={p.integration_id ? 'blue' : 'neutral'}>{p.integration_id ? 'Integração' : 'Manual/planilha'}</Badge> },
          { header: 'Status', cell: (p) => <Badge tone={p.is_active ? 'green' : 'neutral'}>{p.is_active ? 'Ativo' : 'Inativo'}</Badge> },
          {
            header: 'Ações', className: 'text-right', cell: (p) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openForm(p)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setToDelete(p)} className="hover:text-red-400"><Trash className="h-4 w-4" /></Button>
              </div>
            ),
          },
        ]} />
      <Pagination page={page} total={total} pageSize={PRODUCT_PAGE} onChange={setPage} />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar produto' : 'Novo produto'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input label="Nome *" {...f('name')} autoFocus /></div>
          <Input label="SKU" {...f('sku')} />
          <Input label="Preço (R$)" inputMode="decimal" placeholder="0,00" {...f('price')} />
          <Input label="Estoque" type="number" {...f('stock')} />
          <Input label="URL da imagem" placeholder="https://" {...f('image_url')} />
          <div className="sm:col-span-2"><Input label="Link do produto" placeholder="https://" {...f('product_url')} /></div>
          <div className="sm:col-span-2"><Textarea label="Descrição" rows={3} {...f('description')} /></div>
          <div className="sm:col-span-2"><Switch checked={form.is_active} onChange={(v) => setForm((s) => ({ ...s, is_active: v }))} label="Produto ativo" /></div>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} confirmLabel="Excluir"
        title="Excluir produto?" description={toDelete?.name} />
    </section>
  )
}

function IntegrationsSection({ supplierId }: { supplierId: string }) {
  const [rows, setRows] = useState<Integration[] | null>(null)
  useEffect(() => {
    supabase.from('integrations').select('id, supplier_id, name, type, status, config, sync_interval_minutes, last_sync_at, last_sync_status, last_error, created_at, updated_at')
      .eq('supplier_id', supplierId).order('created_at').then(({ data }) => setRows((data as Integration[]) ?? []))
  }, [supplierId])
  if (!rows) return null
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Integrações</h2>
        <ButtonLink to="/admin/integracoes" size="sm" variant="secondary" icon={<Plug className="h-4 w-4" />}>Gerenciar</ButtonLink>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Plug />} title="Sem integração" description="Conecte a API ou o webhook do fornecedor para manter os produtos atualizados automaticamente." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((i) => (
            <Link key={i.id} to={`/admin/integracoes/${i.id}`} className="card flex items-center justify-between gap-3 p-4 transition hover:border-accent/40">
              <div>
                <p className="font-medium">{i.name}</p>
                <p className="text-xs text-muted">{INTEGRATION_TYPES[i.type].label} · última sincronização {formatDate(i.last_sync_at, true)}</p>
              </div>
              <StatusBadge kind="integration" status={i.status} />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

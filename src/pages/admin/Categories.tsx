import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Tags, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { cn, errorMessage, slugify } from '@/lib/utils'
import type { Category } from '@/types/db'
import { PageHeader } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Field'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { CATEGORY_ICONS, CategoryIcon } from '@/components/ui/CategoryIcon'

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(60),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/, 'Use letras minúsculas, números e hífen'),
  description: z.string().trim().max(300).nullable(),
  icon: z.string().refine((v) => v in CATEGORY_ICONS, 'Ícone inválido'),
  sort_order: z.number().int().min(0).max(9999),
})

type Form = { name: string; slug: string; description: string; icon: string; sort_order: string }
const EMPTY: Form = { name: '', slug: '', description: '', icon: 'package', sort_order: '0' }

export default function AdminCategories() {
  const [rows, setRows] = useState<(Category & { total?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Category | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(EMPTY)
  const [slugTouched, setSlugTouched] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<Category | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, counts] = await Promise.all([
      supabase.from('supplier_categories').select('id, name, slug, description, icon, sort_order').order('sort_order'),
      supabase.rpc('public_category_counts'),
    ])
    if (error) toast.error(errorMessage(error))
    const map = new Map(((counts.data as { category_id: string; total: number }[]) ?? []).map((c) => [c.category_id, Number(c.total)]))
    setRows(((data as Category[]) ?? []).map((c) => ({ ...c, total: map.get(c.id) ?? 0 })))
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  function openNew() {
    setEditing(null); setForm({ ...EMPTY, sort_order: String(rows.length + 1) }); setSlugTouched(false); setErrors({}); setOpen(true)
  }
  function openEdit(c: Category) {
    setEditing(c)
    setForm({ name: c.name, slug: c.slug, description: c.description ?? '', icon: c.icon, sort_order: String(c.sort_order) })
    setSlugTouched(true); setErrors({}); setOpen(true)
  }

  async function save() {
    const parsed = schema.safeParse({
      name: form.name, slug: form.slug, description: form.description.trim() || null, icon: form.icon, sort_order: Number(form.sort_order) || 0,
    })
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setSaving(true)
    const { error } = editing
      ? await supabase.from('supplier_categories').update(parsed.data).eq('id', editing.id)
      : await supabase.from('supplier_categories').insert(parsed.data)
    setSaving(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success(editing ? 'Categoria atualizada.' : 'Categoria criada.')
    setOpen(false)
    void load()
  }

  async function remove() {
    if (!toDelete) return
    const { error } = await supabase.from('supplier_categories').delete().eq('id', toDelete.id)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Categoria excluída.')
    void load()
  }

  return (
    <div>
      <PageHeader title="Categorias" description="Organize o catálogo. A ordem define a exibição no site e no painel."
        actions={<Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Nova categoria</Button>} />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Tags />} title="Nenhuma categoria" description="Crie categorias para organizar os fornecedores."
          action={<Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>Criar categoria</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <div key={c.id} className="card flex items-start gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fx-md bg-accent/10 text-accent"><CategoryIcon name={c.icon} className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted">/{c.slug} · ordem {c.sort_order} · {c.total} publicado(s)</p>
                {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setToDelete(c)} className="hover:text-red-400"><Trash className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Editar categoria' : 'Nova categoria'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
        <div className="space-y-4">
          <Input label="Nome" value={form.name} error={errors.name} autoFocus
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) }))} />
          <Input label="Slug" value={form.slug} error={errors.slug} hint="Usado na URL. Gerado a partir do nome."
            onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: slugify(e.target.value) })) }} />
          <Textarea label="Descrição (opcional)" rows={2} value={form.description} error={errors.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Input label="Ordem" type="number" min={0} value={form.sort_order} error={errors.sort_order}
            onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
          <div>
            <span className="label">Ícone</span>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {Object.keys(CATEGORY_ICONS).map((key) => (
                <button key={key} type="button" title={key} aria-label={key} aria-pressed={form.icon === key}
                  onClick={() => setForm((f) => ({ ...f, icon: key }))}
                  className={cn('grid aspect-square place-items-center rounded-fx-sm border transition',
                    form.icon === key ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:border-accent/40 hover:text-fg')}>
                  <CategoryIcon name={key} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} confirmLabel="Excluir"
        title={`Excluir a categoria ${toDelete?.name ?? ''}?`}
        description="Os fornecedores desta categoria não serão excluídos — ficarão sem categoria." />
    </div>
  )
}

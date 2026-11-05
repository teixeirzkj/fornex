import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building, Pencil, Plus, Search, Trash, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { sanitizeSearch } from '@/lib/api'
import { errorMessage, formatDate } from '@/lib/utils'
import { BR_STATES } from '@/lib/config'
import type { Category, Supplier } from '@/types/db'
import { DataTable, FilterBar, PAGE_SIZE, PageHeader, Pagination } from '@/components/admin/AdminUI'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'

type Row = Pick<Supplier, 'id' | 'name' | 'slug' | 'logo_url' | 'city' | 'state' | 'is_published' | 'is_verified' | 'is_demo' | 'min_access_level' | 'updated_at'> & {
  category: { name: string } | null
}

export default function AdminSuppliers() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState('')
  const [published, setPublished] = useState('')
  const [state, setState] = useState('')
  const [categories, setCategories] = useState<Pick<Category, 'id' | 'name'>[]>([])
  const [toDelete, setToDelete] = useState<Row | null>(null)

  useEffect(() => { const t = setTimeout(() => setDebounced(sanitizeSearch(q)), 300); return () => clearTimeout(t) }, [q])
  useEffect(() => { setPage(0) }, [debounced, category, published, state])
  useEffect(() => {
    supabase.from('supplier_categories').select('id, name').order('sort_order').then(({ data }) => setCategories(data ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('suppliers')
      .select('id, name, slug, logo_url, city, state, is_published, is_verified, is_demo, min_access_level, updated_at, category:supplier_categories(name)', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (debounced) query = query.ilike('name', `%${debounced}%`)
    if (category) query = query.eq('category_id', category)
    if (published) query = query.eq('is_published', published === 'yes')
    if (state) query = query.eq('state', state)
    const { data, count, error } = await query
    if (error) toast.error(errorMessage(error, 'Erro ao carregar fornecedores.'))
    setRows((data as unknown as Row[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, debounced, category, published, state])

  useEffect(() => { void load() }, [load])

  async function togglePublish(r: Row) {
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, is_published: !r.is_published } : x)))
    const { error } = await supabase.from('suppliers').update({ is_published: !r.is_published }).eq('id', r.id)
    if (error) {
      toast.error(errorMessage(error))
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, is_published: r.is_published } : x)))
    } else toast.success(!r.is_published ? 'Fornecedor publicado.' : 'Fornecedor ocultado dos assinantes.')
  }

  async function remove() {
    if (!toDelete) return
    const { error } = await supabase.from('suppliers').delete().eq('id', toDelete.id)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Fornecedor excluído.')
    void load()
  }

  return (
    <div>
      <PageHeader title="Fornecedores" description="Cadastre, edite e publique fornecedores. Somente fornecedores publicados aparecem para os assinantes."
        actions={<>
          <ButtonLink to="/admin/importar" variant="secondary" icon={<Upload className="h-4 w-4" />}>Importar</ButtonLink>
          <ButtonLink to="/admin/fornecedores/novo" icon={<Plus className="h-4 w-4" />}>Novo fornecedor</ButtonLink>
        </>} />

      <FilterBar>
        <Input placeholder="Buscar por nome…" value={q} onChange={(e) => setQ(e.target.value)} icon={<Search />} aria-label="Buscar" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={published} onChange={(e) => setPublished(e.target.value)} aria-label="Publicação">
          <option value="">Publicados e rascunhos</option>
          <option value="yes">Publicados</option>
          <option value="no">Não publicados</option>
        </Select>
        <Select value={state} onChange={(e) => setState(e.target.value)} aria-label="Estado">
          <option value="">Todos os estados</option>
          {BR_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </FilterBar>

      <DataTable<Row>
        loading={loading} rows={rows} rowKey={(r) => r.id}
        empty={{
          icon: <Building />, title: debounced || category || published || state ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado',
          description: 'Cadastre manualmente ou importe uma planilha para começar.',
          action: <ButtonLink to="/admin/fornecedores/novo" icon={<Plus className="h-4 w-4" />}>Cadastrar fornecedor</ButtonLink>,
        }}
        columns={[
          {
            header: 'Fornecedor', cell: (r) => (
              <Link to={`/admin/fornecedores/${r.id}`} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-fx-sm border border-line bg-surface-2 text-xs font-bold text-muted">
                  {r.logo_url ? <img src={r.logo_url} alt="" className="h-full w-full object-cover" /> : r.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <span className="block font-medium hover:text-accent">{r.name}{r.is_demo && <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">demo</span>}</span>
                  <span className="block text-xs text-muted">/{r.slug}</span>
                </span>
              </Link>
            ),
          },
          { header: 'Categoria', cell: (r) => <span className="text-muted">{r.category?.name ?? '—'}</span> },
          { header: 'Local', cell: (r) => <span className="text-muted">{[r.city, r.state].filter(Boolean).join(' / ') || '—'}</span> },
          { header: 'Acesso', cell: (r) => <Badge tone={r.min_access_level === 0 ? 'green' : 'blue'}>{r.min_access_level === 0 ? 'Gratuito' : `Nível ${r.min_access_level}`}</Badge> },
          {
            header: 'Publicado', cell: (r) => (
              <button type="button" role="switch" aria-checked={r.is_published} aria-label="Publicar fornecedor" onClick={() => togglePublish(r)}
                className={`relative h-6 w-11 rounded-full transition ${r.is_published ? 'bg-fornex-electric' : 'bg-line'}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.is_published ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            ),
          },
          { header: 'Atualizado', cell: (r) => <span className="text-muted">{formatDate(r.updated_at)}</span> },
          {
            header: 'Ações', className: 'text-right', cell: (r) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => navigate(`/admin/fornecedores/${r.id}`)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setToDelete(r)} className="hover:text-red-400"><Trash className="h-4 w-4" /></Button>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} total={total} onChange={setPage} />

      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} confirmLabel="Excluir fornecedor"
        title={`Excluir ${toDelete?.name ?? ''}?`}
        description="Os produtos, integrações, favoritos e histórico ligados a este fornecedor também serão removidos. Esta ação não pode ser desfeita." />
    </div>
  )
}

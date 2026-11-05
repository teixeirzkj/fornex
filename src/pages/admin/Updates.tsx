import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Send, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { errorMessage, formatDate } from '@/lib/utils'
import type { Notification } from '@/types/db'
import { PageHeader } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'

const KINDS: Record<Notification['kind'], string> = {
  update: 'Atualização da plataforma', new_supplier: 'Novo fornecedor', system: 'Aviso do sistema', billing: 'Cobrança',
}

const schema = z.object({
  kind: z.enum(['update', 'new_supplier', 'system', 'billing']),
  title: z.string().trim().min(2, 'Informe o título').max(140),
  body: z.string().trim().max(4000).transform((v) => v || null),
  link: z.string().trim().max(500).refine((v) => !v || /^(\/(?!\/)|https:\/\/)/.test(v), 'O link deve começar com / ou https://').transform((v) => v || null),
  published_at: z.string(),
})

export default function AdminUpdates() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ kind: 'update' as Notification['kind'], title: '', body: '', link: '', published_at: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<Notification | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('notifications').select('id, user_id, kind, title, body, link, published_at, created_at')
      .is('user_id', null).order('published_at', { ascending: false }).limit(100)
    if (error) toast.error(errorMessage(error))
    setRows((data as Notification[]) ?? []); setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function publish() {
    const parsed = schema.safeParse({ ...form, published_at: form.published_at ? new Date(form.published_at).toISOString() : new Date().toISOString() })
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); return }
    setErrors({}); setSaving(true)
    const { error } = await supabase.from('notifications').insert({ ...parsed.data, user_id: null, created_by: user?.id ?? null })
    setSaving(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success(form.published_at && new Date(form.published_at) > new Date() ? 'Atualização agendada.' : 'Atualização publicada para todos os assinantes.')
    setForm({ kind: 'update', title: '', body: '', link: '', published_at: '' })
    void load()
  }

  async function remove() {
    if (!toDelete) return
    const { error } = await supabase.from('notifications').delete().eq('id', toDelete.id)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Atualização removida.'); void load()
  }

  return (
    <div>
      <PageHeader title="Atualizações" description="Comunicados exibidos em Atualizações no painel de todos os assinantes." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section className="card h-fit p-5">
          <h2 className="mb-4 font-semibold">Nova publicação</h2>
          <div className="space-y-4">
            <Select label="Tipo" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as Notification['kind'] }))}>
              {Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Input label="Título" value={form.title} error={errors.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <Textarea label="Mensagem" rows={5} value={form.body} error={errors.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
            <Input label="Link (opcional)" placeholder="/app/fornecedores/slug ou https://" value={form.link} error={errors.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} />
            <Input label="Agendar (opcional)" type="datetime-local" value={form.published_at} hint="Em branco = publicar agora"
              onChange={(e) => setForm((f) => ({ ...f, published_at: e.target.value }))} />
            <Button onClick={publish} loading={saving} className="w-full" icon={<Send className="h-4 w-4" />}>Publicar</Button>
          </div>
        </section>

        <section>
          {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
            : rows.length === 0 ? <EmptyState icon={<Megaphone />} title="Nenhuma atualização publicada" description="Avise os assinantes sobre novos fornecedores e melhorias." />
              : (
                <ul className="space-y-3">
                  {rows.map((n) => {
                    const scheduled = new Date(n.published_at) > new Date()
                    return (
                      <li key={n.id} className="card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone="blue">{KINDS[n.kind]}</Badge>
                              {scheduled && <Badge tone="amber">Agendada</Badge>}
                              <span className="text-xs text-muted">{formatDate(n.published_at, true)}</span>
                            </div>
                            <p className="mt-2 font-semibold">{n.title}</p>
                            {n.body && <p className="mt-1 whitespace-pre-line text-sm text-muted">{n.body}</p>}
                            {n.link && <p className="mt-1 truncate text-xs text-accent">{n.link}</p>}
                          </div>
                          <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setToDelete(n)} className="hover:text-red-400"><Trash className="h-4 w-4" /></Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
        </section>
      </div>
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} confirmLabel="Excluir"
        title="Excluir esta atualização?" description="Ela deixará de aparecer para os assinantes." />
    </div>
  )
}

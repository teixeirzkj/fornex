import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, PackageSearch } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { callFunction, FunctionError } from '@/lib/api'
import { copyToClipboard } from '@/lib/utils'
import type { Category } from '@/types/db'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Badge, Notice } from '@/components/ui/Feedback'

interface DsSupplier { id: number; apelido: string; status: string; crossdocking: string; dropshipping: string; ja_importado: boolean }
interface Discover { empresa: { apelido: string | null; status: string | null; dropshipping: string | null; crossdocking: string | null }; fornecedores: DsSupplier[] }

const PROJECT_REF = 'tfqqyskomsnmenpbgaiz'

/** Conecta a conta DSlite e importa os fornecedores vinculados (cada um vira fornecedor + integração) */
export function DsliteConnect({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [env, setEnv] = useState<'production' | 'homologacao'>('production')
  const [secret, setSecret] = useState('SUPPLIER_DSLITE_TOKEN')
  const [priceField, setPriceField] = useState('preco_dropshipping')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState<Pick<Category, 'id' | 'name'>[]>([])
  const [data, setData] = useState<Discover | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [created, setCreated] = useState<{ integration_id: string; nome: string }[] | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setData(null); setSelected(new Set()); setCreated(null)
    supabase.from('supplier_categories').select('id, name').order('sort_order').then(({ data: c }) => setCategories((c as Pick<Category, 'id' | 'name'>[]) ?? []))
  }, [open])

  const command = `npx.cmd supabase secrets set --project-ref ${PROJECT_REF} ${secret}=SEU_TOKEN_DO_DSLITE`

  async function discover() {
    setLoading(true)
    try {
      const r = await callFunction<Discover>('integration-sync', { action: 'dslite_discover', env, secret_env: secret })
      setData(r)
      setSelected(new Set(r.fornecedores.filter((f) => !f.ja_importado && f.status === 'Ativo').map((f) => f.id)))
    } catch (e) {
      toast.error((e as FunctionError).message || 'Não foi possível consultar o DSlite.')
    } finally { setLoading(false) }
  }

  async function importSelected() {
    if (!data) return
    setImporting(true)
    try {
      const fornecedores = data.fornecedores.filter((f) => selected.has(f.id)).map((f) => ({ id: f.id, apelido: f.apelido }))
      const r = await callFunction<{ created: { integration_id: string; nome: string }[] }>('integration-sync', {
        action: 'dslite_import', env, secret_env: secret, price_field: priceField, category_id: categoryId || null, fornecedores,
      })
      setCreated(r.created)
      toast.success(`${r.created.length} fornecedor(es) importado(s) do DSlite`)
      onImported()
    } catch (e) {
      toast.error((e as FunctionError).message || 'Falha ao importar.')
    } finally { setImporting(false) }
  }

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Conectar DSlite"
      description="Importe os fornecedores nacionais vinculados à sua conta DSlite, com catálogo, estoque, preço e fotos."
      footer={created ? <Button onClick={onClose}>Concluir</Button> : data ? (
        <>
          <Button variant="secondary" onClick={() => setData(null)}>Voltar</Button>
          <Button onClick={importSelected} loading={importing} disabled={selected.size === 0}>Importar {selected.size} fornecedor(es)</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={discover} loading={loading} icon={<PackageSearch className="h-4 w-4" />}>Buscar fornecedores do DSlite</Button>
        </>
      )}>
      {created ? (
        <div className="space-y-3">
          <Notice title="Fornecedores criados (ainda não publicados)">
            Abra cada integração e clique em <strong>Testar conexão</strong> e depois <strong>Sincronizar agora</strong>. Com os produtos carregados,
            publique o fornecedor em Admin → Fornecedores para os clientes verem.
          </Notice>
          <ul className="divide-y divide-line rounded-fx-md border border-line">
            {created.map((c) => (
              <li key={c.integration_id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="truncate">{c.nome}</span>
                <Link to={`/admin/integracoes/${c.integration_id}`} onClick={onClose} className="shrink-0 text-accent hover:underline">Abrir e sincronizar</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Conta DSlite:</span><strong>{data.empresa.apelido ?? '—'}</strong>
            <Badge tone={data.empresa.status === 'Ativo' ? 'green' : 'amber'}>{data.empresa.status ?? '—'}</Badge>
            <Badge tone={data.empresa.dropshipping === 'Ativo' ? 'green' : 'neutral'}>Dropshipping: {data.empresa.dropshipping ?? '—'}</Badge>
          </div>
          {data.fornecedores.length === 0 ? (
            <Notice tone="warning" title="Nenhum fornecedor vinculado">Vincule fornecedores no painel do DSlite e busque novamente.</Notice>
          ) : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-fx-md border border-line">
              {data.fornecedores.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface-2/50">
                    <input type="checkbox" className="h-4 w-4 accent-[#155EEF]" checked={selected.has(f.id)} disabled={f.ja_importado} onChange={() => toggle(f.id)} />
                    <span className="flex-1 truncate font-medium">{f.apelido} <span className="text-xs text-muted">#{f.id}</span></span>
                    {f.ja_importado ? <Badge tone="blue">Já importado</Badge> : <Badge tone={f.status === 'Ativo' ? 'green' : 'neutral'}>{f.status}</Badge>}
                    <Badge tone={f.dropshipping === 'Ativo' ? 'green' : 'neutral'}>Drop {f.dropshipping === 'Ativo' ? 'sim' : 'não'}</Badge>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Preço de custo usado" value={priceField} onChange={(e) => setPriceField(e.target.value)}>
              <option value="preco_dropshipping">Preço dropshipping</option>
              <option value="preco_crossdocking">Preço cross-docking</option>
              <option value="preco_normal">Preço normal</option>
            </Select>
            <Select label="Categoria (opcional)" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Definir depois</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>Crie a conta em <a href="https://www.dslite.com.br" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">dslite.com.br</a> e vincule os fornecedores que quer revender.</li>
            <li>Peça ao DSlite o <strong className="text-fg">token de API</strong> da sua empresa.</li>
            <li>Guarde o token no Supabase rodando no terminal do VS Code (o token nunca passa pelo navegador):</li>
          </ol>
          <div className="flex items-center gap-2 rounded-fx-md border border-line bg-bg/60 p-2.5">
            <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs text-fg">{command}</code>
            <Button size="sm" variant="ghost" onClick={async () => { if (await copyToClipboard(command)) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }}
              icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>{copied ? 'Copiado' : 'Copiar'}</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Ambiente" value={env} onChange={(e) => setEnv(e.target.value as 'production' | 'homologacao')}>
              <option value="production">Produção</option>
              <option value="homologacao">Homologação (testes)</option>
            </Select>
            <Input label="Nome da secret" value={secret} onChange={(e) => setSecret(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              hint="Precisa começar com SUPPLIER_" />
          </div>
        </div>
      )}
    </Modal>
  )
}

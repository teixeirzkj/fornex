import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CircleCheck, CircleX, Copy, FlaskConical, RefreshCw, Save, Trash, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { callFunction, FunctionError } from '@/lib/api'
import { cn, copyToClipboard, errorMessage, formatBRL, formatDate, timeAgo } from '@/lib/utils'
import type { Integration, IntegrationConfig, IntegrationLog, IntegrationStatus } from '@/types/db'
import { INTEGRATION_TYPES, PageHeader, StatusBadge } from '@/components/admin/AdminUI'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Badge, EmptyState, Notice, PageLoader } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Modal'

type FieldKey = keyof NonNullable<IntegrationConfig['field_map']>
const FIELDS: { key: FieldKey; label: string; placeholder: string; required?: boolean }[] = [
  { key: 'external_id', label: 'ID externo', placeholder: 'id', required: true },
  { key: 'name', label: 'Nome', placeholder: 'title', required: true },
  { key: 'sku', label: 'SKU', placeholder: 'sku' },
  { key: 'description', label: 'Descrição', placeholder: 'description' },
  { key: 'price', label: 'Preço', placeholder: 'price' },
  { key: 'stock', label: 'Estoque', placeholder: 'stock.quantity' },
  { key: 'image_url', label: 'Imagem', placeholder: 'images.0.url' },
  { key: 'product_url', label: 'Link do produto', placeholder: 'permalink' },
]

const SECRET_RE = /^SUPPLIER_[A-Z0-9_]+$/
const dotPath = z.string().trim().max(120).regex(/^[\w.-]*$/, 'Use caminho com pontos, ex.: data.items')

const configSchema = z.object({
  base_url: z.string().trim().max(500).refine((v) => !v || /^https:\/\/[^\s]+$/i.test(v), 'A URL deve começar com https://').optional(),
  method: z.enum(['GET', 'POST']).optional(),
  items_path: dotPath.optional(),
  auth_header: z.string().trim().max(60).regex(/^[A-Za-z0-9-]*$/, 'Nome de header inválido').optional(),
  auth_scheme: z.string().trim().max(30).regex(/^[A-Za-z]*$/, 'Use apenas letras (ex.: Bearer)').optional(),
  secret_env: z.string().trim().refine((v) => !v || SECRET_RE.test(v), 'Deve seguir o padrão SUPPLIER_NOME_TOKEN').optional(),
  price_unit: z.enum(['reais', 'cents']).optional(),
  pagination: z.object({ param: z.string().regex(/^[\w-]{1,30}$/), start: z.number().int().min(0), max_pages: z.number().int().min(1).max(100) }).nullable().optional(),
  field_map: z.record(z.string(), dotPath).optional(),
})

type SyncResult = {
  ok: boolean; dry_run: boolean; fetched: number; upserted: number; skipped: number
  sample?: { external_id: string; name: string; sku: string | null; price_cents: number | null; stock: number | null; image_url: string | null; product_url: string | null }[]
  errors?: string[]
}

export default function IntegrationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [cfg, setCfg] = useState<IntegrationConfig>({})
  const [name, setName] = useState('')
  const [status, setStatus] = useState<IntegrationStatus>('draft')
  const [syncInterval, setSyncInterval] = useState('')
  const [usePagination, setUsePagination] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [fnUnavailable, setFnUnavailable] = useState(false)
  const [logs, setLogs] = useState<IntegrationLog[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('integrations')
      .select('id, supplier_id, name, type, status, config, sync_interval_minutes, last_sync_at, last_sync_status, last_error, created_at, updated_at, supplier:suppliers(id, name)')
      .eq('id', id!).maybeSingle()
    if (error || !data) { toast.error('Integração não encontrada.'); navigate('/admin/integracoes'); return }
    const i = data as unknown as Integration
    setIntegration(i); setName(i.name); setStatus(i.status); setCfg(i.config ?? {})
    setSyncInterval(i.sync_interval_minutes ? String(i.sync_interval_minutes) : '')
    setUsePagination(!!i.config?.pagination)
  }, [id, navigate])

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.from('integration_logs')
      .select('id, integration_id, supplier_id, level, event, message, items_processed, details, created_at')
      .eq('integration_id', id!).order('created_at', { ascending: false }).limit(50)
    setLogs((data as IntegrationLog[]) ?? [])
  }, [id])

  useEffect(() => { void load(); void loadLogs() }, [load, loadLogs])

  const setC = <K extends keyof IntegrationConfig>(k: K, v: IntegrationConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const setMap = (k: FieldKey, v: string) => setCfg((c) => ({ ...c, field_map: { ...(c.field_map ?? {}), [k]: v } }))

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://SEU-PROJETO.supabase.co'}/functions/v1/integration-webhook?integration_id=${id}`

  const checklist = useMemo(() => {
    if (!integration) return []
    const fm = cfg.field_map ?? {}
    const items: { ok: boolean; label: string; detail?: string }[] = []
    if (integration.type === 'rest_api') {
      items.push({ ok: !!cfg.base_url && /^https:\/\//.test(cfg.base_url), label: 'URL da API (https) configurada', detail: 'Endpoint de produtos fornecido pelo fornecedor.' })
      items.push({ ok: !!cfg.secret_env || !cfg.auth_header, label: 'Credencial definida', detail: cfg.auth_header ? `Defina secret_env e rode: supabase secrets set ${cfg.secret_env || 'SUPPLIER_NOME_TOKEN'}=<token>` : 'Sem autenticação configurada (API pública).' })
    }
    if (integration.type === 'webhook') {
      items.push({ ok: !!cfg.secret_env, label: 'Segredo do webhook definido', detail: `Rode: supabase secrets set ${cfg.secret_env || 'SUPPLIER_NOME_WEBHOOK_SECRET'}=<valor forte> e envie o valor ao fornecedor.` })
      items.push({ ok: false, label: 'Fornecedor configurou o envio', detail: 'Envie ao fornecedor a URL e o header abaixo. Confirme pelo registro de logs.' })
    }
    if (integration.type === 'dslite') {
      items.push({ ok: !!cfg.secret_env, label: 'Token do DSlite guardado como secret', detail: `Rode no terminal: npx.cmd supabase secrets set --project-ref tfqqyskomsnmenpbgaiz ${cfg.secret_env || 'SUPPLIER_DSLITE_TOKEN'}=SEU_TOKEN` })
      items.push({ ok: !!integration.last_sync_at && integration.last_sync_status !== 'error', label: 'Primeira sincronização concluída', detail: 'Clique em Testar conexão e depois em Sincronizar agora.' })
      items.push({ ok: status === 'active', label: 'Integração ativa', detail: 'Ativa = sincroniza sozinha no intervalo definido (com o agendamento ligado).' })
    }
    if (integration.type === 'rest_api' || integration.type === 'webhook') {
      items.push({ ok: !!fm.external_id && !!fm.name, label: 'Mapeamento mínimo (ID externo e nome)' })
      items.push({ ok: !fnUnavailable, label: 'Edge Functions publicadas', detail: 'supabase functions deploy integration-sync integration-webhook' })
      items.push({ ok: status === 'active', label: 'Integração ativada', detail: 'Altere o status para “Ativa” após um teste bem-sucedido.' })
    }
    return items
  }, [integration, cfg, status, fnUnavailable])

  async function save(silent = false) {
    if (!integration) return false
    if (integration.type === 'dslite') {
      const errs: Record<string, string> = {}
      const secret = (cfg.secret_env ?? 'SUPPLIER_DSLITE_TOKEN').trim()
      if (!SECRET_RE.test(secret)) errs.secret_env = 'Deve seguir o padrão SUPPLIER_NOME_TOKEN'
      if (!/^\d{1,14}$/.test(String(cfg.fornecedorid ?? ''))) errs.fornecedorid = 'ID do fornecedor inválido'
      const intervalNum = syncInterval ? Number.parseInt(syncInterval, 10) : null
      if (intervalNum != null && (Number.isNaN(intervalNum) || intervalNum < 15)) errs.interval = 'Mínimo de 15 minutos'
      setErrors(errs)
      if (Object.keys(errs).length) { toast.error('Revise a configuração.'); return false }
      setSaving(true)
      const { error } = await supabase.from('integrations').update({
        name: name.trim(), status, sync_interval_minutes: intervalNum,
        config: { env: cfg.env === 'homologacao' ? 'homologacao' : 'production', secret_env: secret, fornecedorid: String(cfg.fornecedorid),
          price_field: cfg.price_field ?? 'preco_dropshipping', sync_cursor: cfg.sync_cursor ?? null },
      }).eq('id', integration.id)
      setSaving(false)
      if (error) { toast.error(errorMessage(error)); return false }
      if (!silent) toast.success('Configuração salva.')
      void load()
      return true
    }
    const cleanMap = Object.fromEntries(Object.entries(cfg.field_map ?? {}).filter(([, v]) => v && v.trim()))
    const candidate: IntegrationConfig = {
      ...cfg,
      method: cfg.method ?? 'GET',
      price_unit: cfg.price_unit ?? 'reais',
      pagination: usePagination ? (cfg.pagination ?? { param: 'page', start: 1, max_pages: 10 }) : null,
      field_map: cleanMap,
    }
    for (const k of ['base_url', 'items_path', 'auth_header', 'auth_scheme', 'secret_env'] as const) {
      if (!candidate[k]) delete candidate[k]
    }
    const parsed = configSchema.safeParse(candidate)
    const intervalNum = syncInterval ? Number.parseInt(syncInterval, 10) : null
    const errs: Record<string, string> = {}
    if (!parsed.success) for (const i of parsed.error.issues) errs[i.path.join('.')] = i.message
    if (intervalNum != null && (Number.isNaN(intervalNum) || intervalNum < 15)) errs.interval = 'Mínimo de 15 minutos'
    if (name.trim().length < 2) errs.name = 'Informe um nome'
    setErrors(errs)
    if (Object.keys(errs).length) { toast.error('Revise a configuração.'); return false }
    setSaving(true)
    const { error } = await supabase.from('integrations').update({
      name: name.trim(), status, config: parsed.data, sync_interval_minutes: intervalNum,
    }).eq('id', integration.id)
    setSaving(false)
    if (error) { toast.error(errorMessage(error)); return false }
    if (!silent) toast.success('Configuração salva.')
    void load()
    return true
  }

  async function run(dry: boolean) {
    if (!integration) return
    if (!(await save(true))) return
    dry ? setTesting(true) : setSyncing(true)
    setResult(null)
    try {
      const res = await callFunction<SyncResult>('integration-sync', { integration_id: integration.id, dry_run: dry })
      setFnUnavailable(false)
      setResult(res)
      if (res.ok) toast.success(dry ? `Conexão OK — ${res.fetched} item(ns) lidos.` : `Sincronizado: ${res.upserted} produto(s) atualizados.`)
      else toast.error('A sincronização terminou com erros. Veja os detalhes.')
    } catch (e) {
      const err = e as FunctionError
      if (err.code === 'function_unavailable') setFnUnavailable(true)
      toast.error(err.message || 'Falha na sincronização.')
    } finally {
      setTesting(false); setSyncing(false)
      void load(); void loadLogs()
    }
  }

  async function remove() {
    if (!integration) return
    const { error } = await supabase.from('integrations').delete().eq('id', integration.id)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Integração excluída.')
    navigate('/admin/integracoes')
  }

  if (!integration) return <PageLoader />
  const fm = cfg.field_map ?? {}
  const examplePayload = JSON.stringify({
    products: [Object.fromEntries(FIELDS.filter((f) => fm[f.key]).map((f) => [fm[f.key]!, f.key === 'price' ? 129.9 : f.key === 'stock' ? 25 : `<${f.label.toLowerCase()}>`]))],
  }, null, 2)

  return (
    <div>
      <Link to="/admin/integracoes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />Integrações</Link>
      <PageHeader title={integration.name}
        description={<span className="flex flex-wrap items-center gap-2">
          <Link to={`/admin/fornecedores/${integration.supplier_id}`} className="text-accent hover:underline">{integration.supplier?.name}</Link>
          <span>·</span><Badge>{INTEGRATION_TYPES[integration.type].label}</Badge><StatusBadge kind="integration" status={integration.status} />
          <span>· última sincronização: {integration.last_sync_at ? timeAgo(integration.last_sync_at) : 'nunca'}</span>
        </span>}
        actions={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} icon={<Trash className="h-4 w-4" />} className="hover:text-red-400">Excluir</Button>
          <Button onClick={() => save()} loading={saving} icon={<Save className="h-4 w-4" />}>Salvar</Button>
        </>} />

      {integration.last_error && (
        <div className="mb-6"><Notice tone="warning" title="Último erro registrado">{integration.last_error}</Notice></div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="font-semibold">Geral</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input label="Nome" value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
              <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as IntegrationStatus)}>
                <option value="draft">Rascunho</option>
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
                {integration.status === 'error' && <option value="error">Com erro</option>}
              </Select>
            </div>
          </section>

          {integration.type === 'dslite' && (
            <section className="card p-5 sm:p-6">
              <h2 className="font-semibold">Conexão com o DSlite</h2>
              <p className="mt-0.5 text-sm text-muted">Catálogo, estoque, preços e fotos vêm direto do DSlite. O token fica guardado como secret no Supabase, nunca no banco.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Select label="Ambiente" value={cfg.env ?? 'production'} onChange={(e) => setC('env', e.target.value as 'production' | 'homologacao')}>
                  <option value="production">Produção</option>
                  <option value="homologacao">Homologação (testes, valores fictícios)</option>
                </Select>
                <Input label="Nome da secret do token" value={cfg.secret_env ?? 'SUPPLIER_DSLITE_TOKEN'} error={errors.secret_env}
                  onChange={(e) => setC('secret_env', e.target.value.toUpperCase())} />
                <Input label="ID do fornecedor no DSlite" value={cfg.fornecedorid ?? ''} error={errors.fornecedorid} inputMode="numeric"
                  onChange={(e) => setC('fornecedorid', e.target.value.replace(/\D/g, ''))} />
                <Select label="Preço de custo usado" value={cfg.price_field ?? 'preco_dropshipping'}
                  onChange={(e) => setC('price_field', e.target.value as 'preco_dropshipping' | 'preco_crossdocking' | 'preco_normal')}>
                  <option value="preco_dropshipping">Preço dropshipping</option>
                  <option value="preco_crossdocking">Preço cross-docking</option>
                  <option value="preco_normal">Preço normal</option>
                </Select>
              </div>
              <p className="mt-3 text-xs text-muted">Se o preço escolhido vier zerado para um produto, o sistema usa o próximo disponível (dropshipping → cross-docking → normal).</p>
              {cfg.sync_cursor ? <p className="mt-2 text-xs text-amber-400">Sincronização em andamento: continua a partir da página {cfg.sync_cursor} na próxima execução.</p> : null}
            </section>
          )}

          {integration.type === 'rest_api' && (
            <section className="card p-5 sm:p-6">
              <h2 className="font-semibold">Conexão com a API</h2>
              <p className="mt-0.5 text-sm text-muted">A Edge Function <code>integration-sync</code> chama esta URL no servidor. O token nunca passa pelo navegador.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Input label="URL do endpoint de produtos" placeholder="https://api.fornecedor.com.br/v1/products" value={cfg.base_url ?? ''} error={errors.base_url} onChange={(e) => setC('base_url', e.target.value)} /></div>
                <Select label="Método" value={cfg.method ?? 'GET'} onChange={(e) => setC('method', e.target.value as 'GET' | 'POST')}>
                  <option value="GET">GET</option><option value="POST">POST</option>
                </Select>
                <Input label="Caminho da lista no JSON" placeholder="data.items (vazio = raiz)" value={cfg.items_path ?? ''} error={errors.items_path} onChange={(e) => setC('items_path', e.target.value)} />
                <Input label="Header de autenticação" placeholder="Authorization" value={cfg.auth_header ?? ''} error={errors.auth_header} onChange={(e) => setC('auth_header', e.target.value)} />
                <Input label="Esquema" placeholder="Bearer (opcional)" value={cfg.auth_scheme ?? ''} error={errors.auth_scheme} onChange={(e) => setC('auth_scheme', e.target.value)} />
                <div className="sm:col-span-2">
                  <Input label="Variável do segredo (secret_env)" placeholder="SUPPLIER_ACME_TOKEN" value={cfg.secret_env ?? ''} error={errors.secret_env}
                    onChange={(e) => setC('secret_env', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    hint="Somente o NOME fica no banco. Defina o valor com: supabase secrets set SUPPLIER_ACME_TOKEN=seu_token" />
                </div>
                <Select label="Unidade do preço" value={cfg.price_unit ?? 'reais'} onChange={(e) => setC('price_unit', e.target.value as 'reais' | 'cents')}>
                  <option value="reais">Reais (ex.: 129.90)</option><option value="cents">Centavos (ex.: 12990)</option>
                </Select>
                <Input label="Sincronização automática (min)" type="number" min={15} placeholder="Vazio = manual" value={syncInterval} error={errors.interval}
                  onChange={(e) => setSyncInterval(e.target.value)} hint="Requer agendamento (cron) configurado — veja o README." />
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={usePagination} onChange={(e) => setUsePagination(e.target.checked)} className="h-4 w-4 accent-[#155EEF]" />
                  A API é paginada por parâmetro de URL
                </label>
                {usePagination && (
                  <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
                    <Input label="Parâmetro" value={cfg.pagination?.param ?? 'page'} error={errors['pagination.param']}
                      onChange={(e) => setC('pagination', { param: e.target.value, start: cfg.pagination?.start ?? 1, max_pages: cfg.pagination?.max_pages ?? 10 })} />
                    <Input label="Primeira página" type="number" min={0} value={String(cfg.pagination?.start ?? 1)}
                      onChange={(e) => setC('pagination', { param: cfg.pagination?.param ?? 'page', start: Number(e.target.value) || 0, max_pages: cfg.pagination?.max_pages ?? 10 })} />
                    <Input label="Máximo de páginas" type="number" min={1} max={100} value={String(cfg.pagination?.max_pages ?? 10)} error={errors['pagination.max_pages']}
                      onChange={(e) => setC('pagination', { param: cfg.pagination?.param ?? 'page', start: cfg.pagination?.start ?? 1, max_pages: Number(e.target.value) || 1 })} />
                  </div>
                )}
              </div>
            </section>
          )}

          {integration.type === 'webhook' && (
            <section className="card p-5 sm:p-6">
              <h2 className="font-semibold">Recebimento por webhook</h2>
              <p className="mt-0.5 text-sm text-muted">O sistema do fornecedor envia um POST com os produtos sempre que houver alteração.</p>
              <div className="mt-4 space-y-4">
                <div>
                  <span className="label">URL do endpoint</span>
                  <div className="flex gap-2">
                    <code className="field block flex-1 overflow-x-auto whitespace-nowrap">{webhookUrl}</code>
                    <Button variant="secondary" size="icon" aria-label="Copiar URL" onClick={async () => toast[(await copyToClipboard(webhookUrl)) ? 'success' : 'error']('URL copiada.')}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <Input label="Variável do segredo (secret_env)" placeholder="SUPPLIER_ACME_WEBHOOK_SECRET" value={cfg.secret_env ?? ''} error={errors.secret_env}
                  onChange={(e) => setC('secret_env', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                  hint="O fornecedor deve enviar o header x-webhook-secret com o valor desta variável (definida via supabase secrets set)." />
                <Input label="Caminho da lista no JSON" placeholder="products" value={cfg.items_path ?? ''} error={errors.items_path} onChange={(e) => setC('items_path', e.target.value)} />
                <Select label="Unidade do preço" value={cfg.price_unit ?? 'reais'} onChange={(e) => setC('price_unit', e.target.value as 'reais' | 'cents')}>
                  <option value="reais">Reais</option><option value="cents">Centavos</option>
                </Select>
                <div>
                  <span className="label">Exemplo de requisição</span>
                  <pre className="scrollbar-thin overflow-x-auto rounded-fx-md border border-line bg-bg p-3 text-xs text-muted">{`POST ${webhookUrl}
Content-Type: application/json
x-webhook-secret: <valor de ${cfg.secret_env || 'SUPPLIER_..._SECRET'}>

${examplePayload}`}</pre>
                </div>
              </div>
            </section>
          )}

          {(integration.type === 'rest_api' || integration.type === 'webhook') && (
            <section className="card p-5 sm:p-6">
              <h2 className="font-semibold">Mapeamento de campos</h2>
              <p className="mt-0.5 text-sm text-muted">Informe onde cada dado está em cada item do JSON do fornecedor (caminho com pontos, ex.: <code>price.amount</code>).</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <Input key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} placeholder={f.placeholder} value={fm[f.key] ?? ''}
                    error={errors[`field_map.${f.key}`]} onChange={(e) => setMap(f.key, e.target.value)} />
                ))}
              </div>
            </section>
          )}

          {(integration.type === 'csv' || integration.type === 'manual') && (
            <section className="card p-5 sm:p-6">
              <h2 className="font-semibold">{integration.type === 'csv' ? 'Atualização por planilha' : 'Cadastro manual'}</h2>
              <p className="mt-1 text-sm text-muted">
                {integration.type === 'csv'
                  ? 'Importe a planilha do fornecedor no modo “Produtos de um fornecedor”. Produtos com o mesmo ID externo são atualizados.'
                  : 'Os produtos são cadastrados diretamente na página do fornecedor.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {integration.type === 'csv' && <ButtonLink to="/admin/importar" icon={<Upload className="h-4 w-4" />}>Importar planilha</ButtonLink>}
                <ButtonLink to={`/admin/fornecedores/${integration.supplier_id}`} variant="secondary">Abrir fornecedor</ButtonLink>
              </div>
            </section>
          )}

          {result && (
            <section className="card p-5 sm:p-6">
              <div className="flex items-center gap-2">
                {result.ok ? <CircleCheck className="h-5 w-5 text-emerald-400" /> : <CircleX className="h-5 w-5 text-red-400" />}
                <h2 className="font-semibold">{result.dry_run ? 'Resultado do teste' : 'Resultado da sincronização'}</h2>
              </div>
              <p className="mt-1 text-sm text-muted">Lidos: {result.fetched} · {result.dry_run ? 'nada foi gravado' : `gravados: ${result.upserted}`} · ignorados: {result.skipped}</p>
              {result.errors && result.errors.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-fx-md border border-red-500/20 bg-red-500/[.05] p-3 text-sm text-red-300">
                  {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
              {result.sample && result.sample.length > 0 && (
                <div className="scrollbar-thin mt-4 overflow-x-auto rounded-fx-md border border-line">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead><tr className="border-b border-line bg-surface-2/40 text-xs uppercase tracking-wider text-muted">
                      <th className="px-3 py-2">ID</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Preço</th><th className="px-3 py-2">Estoque</th>
                    </tr></thead>
                    <tbody>
                      {result.sample.map((s, i) => (
                        <tr key={`${s.external_id}-${i}`} className="border-b border-line/60 last:border-0">
                          <td className="px-3 py-2 text-muted">{s.external_id}</td><td className="px-3 py-2">{s.name}</td>
                          <td className="px-3 py-2 text-muted">{s.sku ?? '—'}</td><td className="px-3 py-2">{formatBRL(s.price_cents)}</td>
                          <td className="px-3 py-2">{s.stock ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Histórico de eventos</h2>
              <Button variant="ghost" size="sm" onClick={() => void loadLogs()} icon={<RefreshCw className="h-4 w-4" />}>Atualizar</Button>
            </div>
            {logs.length === 0 ? <EmptyState icon={<RefreshCw />} title="Nenhum evento ainda" description="Testes, sincronizações e webhooks recebidos ficam registrados aqui." />
              : (
                <div className="card scrollbar-thin overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead><tr className="border-b border-line bg-surface-2/40 text-xs uppercase tracking-wider text-muted">
                      <th className="px-4 py-3">Quando</th><th className="px-4 py-3">Nível</th><th className="px-4 py-3">Evento</th><th className="px-4 py-3">Mensagem</th><th className="px-4 py-3">Itens</th>
                    </tr></thead>
                    <tbody>
                      {logs.map((l) => (
                        <Fragment key={l.id}>
                          <tr onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="cursor-pointer border-b border-line/60 hover:bg-surface-2/40">
                            <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(l.created_at, true)}</td>
                            <td className="px-4 py-2.5"><Badge tone={l.level === 'error' ? 'red' : l.level === 'warn' ? 'amber' : 'blue'}>{l.level}</Badge></td>
                            <td className="px-4 py-2.5 text-muted">{l.event}</td>
                            <td className="max-w-[360px] truncate px-4 py-2.5">{l.message}</td>
                            <td className="px-4 py-2.5 tabular-nums">{l.items_processed}</td>
                          </tr>
                          {expanded === l.id && l.details != null && (
                            <tr className="border-b border-line/60"><td colSpan={5} className="bg-bg px-4 py-3">
                              <pre className="scrollbar-thin max-h-64 overflow-auto text-xs text-muted">{JSON.stringify(l.details, null, 2)}</pre>
                            </td></tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
        </div>

        <aside className="space-y-4">
          {(integration.type === 'rest_api' || integration.type === 'dslite') && (
            <div className="card space-y-2 p-5">
              <h2 className="font-semibold">Executar</h2>
              <p className="text-sm text-muted">O teste lê a primeira página e mostra uma amostra sem gravar nada. A sincronização grava os produtos.</p>
              <Button variant="secondary" className="w-full" loading={testing} disabled={syncing} onClick={() => run(true)} icon={<FlaskConical className="h-4 w-4" />}>Testar conexão</Button>
              <Button className="w-full" loading={syncing} disabled={testing} onClick={() => run(false)} icon={<RefreshCw className="h-4 w-4" />}>Sincronizar agora</Button>
            </div>
          )}
          {checklist.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold">O que falta para ativar</h2>
              <ul className="mt-3 space-y-3">
                {checklist.map((c) => (
                  <li key={c.label} className="flex gap-2.5 text-sm">
                    {c.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-line" />}
                    <span>
                      <span className={cn('block', c.ok ? 'text-muted line-through decoration-muted/40' : 'text-fg')}>{c.label}</span>
                      {!c.ok && c.detail && <span className="mt-0.5 block break-words text-xs text-muted">{c.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Notice title="Segurança">Tokens e segredos ficam somente nas variáveis de ambiente das Edge Functions. Nunca cole tokens nos campos desta página.</Notice>
        </aside>
      </div>

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} confirmLabel="Excluir integração"
        title="Excluir esta integração?" description="Os logs serão removidos. Os produtos já sincronizados permanecem no fornecedor." />
    </div>
  )
}

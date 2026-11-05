import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, Download, FileSpreadsheet, Upload } from 'lucide-react'
import Papa from 'papaparse'
import { readSheet } from 'read-excel-file/browser'
import { toast } from 'sonner'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { cn, errorMessage, formatNumber, slugify } from '@/lib/utils'
import { BR_STATES } from '@/lib/config'
import { PageHeader, reaisToCents, SupplierPicker } from '@/components/admin/AdminUI'
import { Button } from '@/components/ui/Button'
import { Select, Switch } from '@/components/ui/Field'
import { Badge, Notice } from '@/components/ui/Feedback'

type Mode = 'suppliers' | 'products'
type Step = 'upload' | 'map' | 'preview' | 'done'
type RawRow = Record<string, string>

const MAX_BYTES = 5 * 1024 * 1024
const MAX_ROWS = 5000
const CHUNK = 200

interface TargetField { key: string; label: string; required?: boolean; aliases: string[] }

const SUPPLIER_FIELDS: TargetField[] = [
  { key: 'name', label: 'Nome', required: true, aliases: ['nome', 'name', 'empresa', 'fornecedor', 'razaosocial', 'nomefantasia'] },
  { key: 'category', label: 'Categoria (nome ou slug)', aliases: ['categoria', 'category', 'segmento', 'nicho'] },
  { key: 'description', label: 'Descrição', aliases: ['descricao', 'description', 'sobre'] },
  { key: 'city', label: 'Cidade', aliases: ['cidade', 'city', 'municipio'] },
  { key: 'state', label: 'Estado (UF)', aliases: ['estado', 'uf', 'state'] },
  { key: 'phone', label: 'Telefone', aliases: ['telefone', 'phone', 'fone', 'tel'] },
  { key: 'whatsapp', label: 'WhatsApp', aliases: ['whatsapp', 'whats', 'zap', 'celular'] },
  { key: 'email', label: 'E-mail', aliases: ['email', 'e-mail', 'mail'] },
  { key: 'website', label: 'Site', aliases: ['site', 'website', 'url', 'link'] },
  { key: 'instagram', label: 'Instagram', aliases: ['instagram', 'insta'] },
  { key: 'facebook', label: 'Facebook', aliases: ['facebook', 'fb'] },
  { key: 'tiktok', label: 'TikTok', aliases: ['tiktok'] },
  { key: 'commercial_terms', label: 'Condições comerciais', aliases: ['condicoescomerciais', 'condicoes', 'commercialterms'] },
  { key: 'min_order', label: 'Pedido mínimo', aliases: ['pedidominimo', 'minimo', 'minorder'] },
  { key: 'shipping_info', label: 'Envio', aliases: ['envio', 'frete', 'shipping', 'logistica'] },
  { key: 'notes', label: 'Observações', aliases: ['observacoes', 'obs', 'notes', 'notas'] },
  { key: 'tags', label: 'Tags (separe com ; ou |)', aliases: ['tags', 'etiquetas', 'palavraschave'] },
  { key: 'min_access_level', label: 'Nível de acesso (0 ou 1)', aliases: ['nivelacesso', 'nivel', 'accesslevel', 'minaccesslevel'] },
]

const PRODUCT_FIELDS: TargetField[] = [
  { key: 'external_id', label: 'ID externo (recomendado)', aliases: ['idexterno', 'externalid', 'id', 'codigo', 'cod', 'referencia', 'ref'] },
  { key: 'name', label: 'Nome', required: true, aliases: ['nome', 'name', 'produto', 'titulo', 'title', 'descricaocurta'] },
  { key: 'sku', label: 'SKU', aliases: ['sku', 'ean', 'gtin', 'codigobarras'] },
  { key: 'description', label: 'Descrição', aliases: ['descricao', 'description', 'detalhes'] },
  { key: 'price', label: 'Preço (R$)', aliases: ['preco', 'price', 'valor', 'precovenda', 'precocusto', 'custo'] },
  { key: 'stock', label: 'Estoque', aliases: ['estoque', 'stock', 'quantidade', 'qtd', 'saldo'] },
  { key: 'image_url', label: 'URL da imagem', aliases: ['imagemurl', 'imagem', 'image', 'imageurl', 'foto', 'thumbnail'] },
  { key: 'product_url', label: 'Link do produto', aliases: ['linkproduto', 'link', 'url', 'producturl', 'permalink'] },
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const text = (max: number) => z.string().trim().max(max).transform((v) => v || null)
const url = z.string().trim().max(500)
  .transform((v) => (v && !/^https?:\/\//i.test(v) && /^[\w-]+(\.[\w-]+)+/.test(v) ? `https://${v}` : v))
  .refine((v) => !v || /^https?:\/\/\S+$/i.test(v), 'URL inválida').transform((v) => v || null)

const supplierRow = z.object({
  name: z.string().trim().min(2, 'Nome obrigatório').max(120),
  category: z.string().trim(),
  description: text(4000), city: text(80),
  state: z.string().trim().toUpperCase().refine((v) => !v || (BR_STATES as readonly string[]).includes(v), 'UF inválida').transform((v) => v || null),
  phone: text(30), whatsapp: text(30),
  email: z.string().trim().max(120).refine((v) => !v || z.email().safeParse(v).success, 'E-mail inválido').transform((v) => v || null),
  website: url, instagram: text(200), facebook: text(200), tiktok: text(200),
  commercial_terms: text(4000), min_order: text(200), shipping_info: text(1000), notes: text(4000),
  tags: z.string().transform((v) => v.split(/[;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 20).map((t) => t.slice(0, 30))),
  min_access_level: z.string().trim().transform((v) => (v === '' ? 1 : Number(v))).pipe(z.number().int('Nível inválido').min(0).max(100)),
})

const productRow = z.object({
  external_id: text(120),
  name: z.string().trim().min(1, 'Nome obrigatório').max(300),
  sku: text(80), description: text(4000),
  price: z.string().trim().transform((v) => (v ? reaisToCents(v) : null)).refine((v) => v === null || v >= 0, 'Preço inválido'),
  stock: z.string().trim().transform((v) => (v ? Number.parseInt(v.replace(/\D/g, ''), 10) : null)).refine((v) => v === null || Number.isFinite(v), 'Estoque inválido'),
  image_url: url, product_url: url,
})

type ParsedRow = { index: number; ok: true; data: Record<string, unknown> } | { index: number; ok: false; errors: string[] }

function cellToString(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v).replace('.', ',')
  return String(v)
}

function downloadTemplate(mode: Mode) {
  const headers = mode === 'suppliers'
    ? ['nome', 'categoria', 'descricao', 'cidade', 'estado', 'telefone', 'whatsapp', 'email', 'site', 'instagram', 'facebook', 'tiktok', 'condicoes_comerciais', 'pedido_minimo', 'envio', 'observacoes', 'tags', 'nivel_acesso']
    : ['id_externo', 'nome', 'sku', 'descricao', 'preco', 'estoque', 'imagem_url', 'link_produto']
  const blob = new Blob(['﻿' + headers.join(';') + '\n'], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = mode === 'suppliers' ? 'modelo-fornecedores.csv' : 'modelo-produtos.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const STEPS: [Step, string][] = [['upload', 'Arquivo'], ['map', 'Colunas'], ['preview', 'Revisão'], ['done', 'Concluído']]

export default function AdminImport() {
  const [mode, setMode] = useState<Mode>('suppliers')
  const [supplierId, setSupplierId] = useState('')
  const [encoding, setEncoding] = useState('UTF-8')
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<RawRow[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [publish, setPublish] = useState(false)
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [summary, setSummary] = useState<{ total: number; valid: number; invalid: number; imported: number; failed: number; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fields = mode === 'suppliers' ? SUPPLIER_FIELDS : PRODUCT_FIELDS

  function reset() {
    setStep('upload'); setFileName(''); setHeaders([]); setRows([]); setMapping({}); setSummary(null); setProgress(0)
  }

  async function readFile(file: File) {
    if (file.size > MAX_BYTES) { toast.error('Arquivo maior que 5 MB.'); return }
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xlsx', 'txt'].includes(ext ?? '')) { toast.error('Envie um arquivo .csv ou .xlsx.'); return }
    setReading(true)
    try {
      let table: string[][]
      if (ext === 'xlsx') {
        const data = await readSheet(file)
        table = data.map((r) => r.map(cellToString))
      } else {
        table = await new Promise<string[][]>((resolve, reject) => {
          Papa.parse<string[]>(file, {
            skipEmptyLines: 'greedy', encoding,
            complete: (res) => resolve(res.data), error: (err) => reject(err),
          })
        })
      }
      const [head, ...body] = table
      if (!head || body.length === 0) { toast.error('A planilha está vazia ou sem cabeçalho.'); return }
      if (body.length > MAX_ROWS) { toast.error(`Máximo de ${formatNumber(MAX_ROWS)} linhas por importação.`); return }
      const hs = head.map((h, i) => (h || '').trim() || `Coluna ${i + 1}`)
      const objects = body.map((r) => Object.fromEntries(hs.map((h, i) => [h, (r[i] ?? '').toString()])))
      // Auto-mapeamento por nome normalizado
      const auto: Record<string, string> = {}
      const used = new Set<string>()
      for (const f of fields) {
        const match = hs.find((h) => !used.has(h) && (norm(h) === norm(f.key) || f.aliases.includes(norm(h))))
        if (match) { auto[f.key] = match; used.add(match) }
      }
      setFileName(file.name); setHeaders(hs); setRows(objects); setMapping(auto); setStep('map')
    } catch {
      toast.error('Não foi possível ler o arquivo. Verifique o formato.')
    } finally {
      setReading(false)
    }
  }

  const parsed = useMemo<ParsedRow[]>(() => {
    if (step !== 'preview' && step !== 'done') return []
    const schema = mode === 'suppliers' ? supplierRow : productRow
    return rows.map((r, index) => {
      const obj = Object.fromEntries(fields.map((f) => [f.key, mapping[f.key] ? (r[mapping[f.key]] ?? '') : '']))
      const res = schema.safeParse(obj)
      return res.success ? { index, ok: true, data: res.data as Record<string, unknown> }
        : { index, ok: false, errors: res.error.issues.map((i) => `${fields.find((f) => f.key === i.path[0])?.label ?? String(i.path[0])}: ${i.message}`) }
    })
  }, [step, rows, mapping, mode, fields])

  const validCount = parsed.filter((p) => p.ok).length
  const missingRequired = fields.filter((f) => f.required && !mapping[f.key])

  async function runImport() {
    const valid = parsed.filter((p): p is Extract<ParsedRow, { ok: true }> => p.ok).map((p) => p.data)
    if (valid.length === 0) { toast.error('Nenhuma linha válida para importar.'); return }
    if (mode === 'products' && !supplierId) { toast.error('Selecione o fornecedor.'); return }
    setImporting(true); setProgress(0)
    let imported = 0; let failed = 0
    const errors: string[] = []

    try {
      let records: Record<string, unknown>[] = []
      if (mode === 'suppliers') {
        const [{ data: cats }, { data: slugs }] = await Promise.all([
          supabase.from('supplier_categories').select('id, name, slug'),
          supabase.from('suppliers').select('slug').limit(100000),
        ])
        const catMap = new Map<string, string>()
        for (const c of cats ?? []) { catMap.set(norm(c.slug), c.id); catMap.set(norm(c.name), c.id) }
        const taken = new Set((slugs ?? []).map((s) => s.slug))
        records = valid.map((v) => {
          const base = slugify(String(v.name)) || 'fornecedor'
          let slug = base; let n = 2
          while (taken.has(slug)) slug = `${base.slice(0, 110)}-${n++}`
          taken.add(slug)
          const catKey = norm(String(v.category ?? ''))
          return {
            name: v.name, slug, category_id: catKey ? catMap.get(catKey) ?? null : null,
            description: v.description, city: v.city, state: v.state, phone: v.phone, whatsapp: v.whatsapp, email: v.email,
            website: v.website, instagram: v.instagram, facebook: v.facebook, tiktok: v.tiktok, commercial_terms: v.commercial_terms,
            min_order: v.min_order, shipping_info: v.shipping_info, notes: v.notes, tags: v.tags, min_access_level: v.min_access_level,
            is_published: publish, is_verified: false,
          }
        })
      } else {
        const byExt = new Map<string, Record<string, unknown>>()
        const noExt: Record<string, unknown>[] = []
        for (const v of valid) {
          const rec = {
            supplier_id: supplierId, external_id: v.external_id, name: v.name, sku: v.sku, description: v.description,
            price_cents: v.price, stock: v.stock, image_url: v.image_url, product_url: v.product_url, is_active: true,
          }
          if (v.external_id) byExt.set(String(v.external_id), rec)
          else noExt.push(rec)
        }
        records = [...byExt.values(), ...noExt]
      }

      for (let i = 0; i < records.length; i += CHUNK) {
        const chunk = records.slice(i, i + CHUNK)
        let error
        if (mode === 'suppliers') {
          ({ error } = await supabase.from('suppliers').insert(chunk))
        } else {
          const withExt = chunk.filter((c) => c.external_id)
          const without = chunk.filter((c) => !c.external_id)
          if (withExt.length) ({ error } = await supabase.from('supplier_products').upsert(withExt, { onConflict: 'supplier_id,external_id' }))
          if (!error && without.length) ({ error } = await supabase.from('supplier_products').insert(without))
        }
        if (error) { failed += chunk.length; errors.push(`Linhas ${i + 1}–${i + chunk.length}: ${errorMessage(error, error.message)}`) }
        else imported += chunk.length
        setProgress(Math.round(((i + chunk.length) / records.length) * 100))
      }
    } catch (e) {
      errors.push(errorMessage(e))
    }

    const invalid = parsed.length - valid.length
    await supabase.from('integration_logs').insert({
      integration_id: null, supplier_id: mode === 'products' ? supplierId : null,
      level: failed || errors.length ? 'error' : invalid ? 'warn' : 'info', event: 'import',
      message: `Importação de ${mode === 'suppliers' ? 'fornecedores' : 'produtos'} (${fileName}): ${imported} importado(s), ${invalid} inválido(s), ${failed} com falha`,
      items_processed: imported,
      details: { file: fileName, mode, total: parsed.length, valid: valid.length, invalid, imported, failed, errors: errors.slice(0, 20) },
    })

    setSummary({ total: parsed.length, valid: valid.length, invalid, imported, failed, errors })
    setImporting(false); setStep('done')
    if (imported) toast.success(`${formatNumber(imported)} registro(s) importado(s).`)
    else toast.error('Nenhum registro foi importado.')
  }

  const stepIndex = STEPS.findIndex(([s]) => s === step)

  return (
    <div>
      <PageHeader title="Importar planilha" description="Cadastre fornecedores ou atualize produtos em massa a partir de CSV ou Excel (.xlsx)." />

      <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map(([s, label], i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn('grid h-6 w-6 place-items-center rounded-full text-xs font-semibold',
              i < stepIndex ? 'bg-emerald-500/20 text-emerald-400' : i === stepIndex ? 'bg-fornex-electric text-white' : 'bg-surface-2 text-muted')}>{i + 1}</span>
            <span className={i === stepIndex ? 'font-medium text-fg' : 'text-muted'}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>

      {step === 'upload' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="card space-y-5 p-5 sm:p-6">
            <div>
              <span className="label">O que você vai importar?</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {([['suppliers', 'Fornecedores', 'Cria novos fornecedores no catálogo.'], ['products', 'Produtos de um fornecedor', 'Cria ou atualiza produtos pelo ID externo.']] as const).map(([m, t, d]) => (
                  <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                    className={cn('rounded-fx-md border p-4 text-left transition', mode === m ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/40')}>
                    <span className="block font-medium">{t}</span><span className="mt-0.5 block text-xs text-muted">{d}</span>
                  </button>
                ))}
              </div>
            </div>
            {mode === 'products' && <SupplierPicker value={supplierId} onChange={setSupplierId} required />}
            <Select label="Codificação do CSV" value={encoding} onChange={(e) => setEncoding(e.target.value)} hint="Use Latin-1 se os acentos aparecerem errados (CSV de Excel antigo).">
              <option value="UTF-8">UTF-8 (padrão)</option>
              <option value="ISO-8859-1">Latin-1 / Windows</option>
            </Select>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = '' }} />
            <button type="button" disabled={reading || (mode === 'products' && !supplierId)} onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !(mode === 'products' && !supplierId)) void readFile(f) }}
              className="flex w-full flex-col items-center justify-center rounded-fx-lg border-2 border-dashed border-line px-6 py-12 text-center transition hover:border-accent/50 hover:bg-accent/[.03] disabled:cursor-not-allowed disabled:opacity-50">
              <span className="grid h-12 w-12 place-items-center rounded-fx-md bg-accent/10 text-accent"><Upload className="h-5 w-5" /></span>
              <span className="mt-3 font-medium">{reading ? 'Lendo arquivo…' : 'Clique ou arraste o arquivo aqui'}</span>
              <span className="mt-1 text-xs text-muted">{mode === 'products' && !supplierId ? 'Selecione o fornecedor primeiro' : 'CSV ou XLSX · até 5 MB · até 5.000 linhas'}</span>
            </button>
          </section>
          <aside className="space-y-4">
            <div className="card p-5">
              <h2 className="font-semibold">Modelos de planilha</h2>
              <p className="mt-1 text-sm text-muted">Baixe o modelo com as colunas esperadas. Você também pode usar sua própria planilha e mapear as colunas.</p>
              <div className="mt-4 space-y-2">
                <Button variant="secondary" className="w-full" onClick={() => downloadTemplate('suppliers')} icon={<Download className="h-4 w-4" />}>Modelo de fornecedores</Button>
                <Button variant="secondary" className="w-full" onClick={() => downloadTemplate('products')} icon={<Download className="h-4 w-4" />}>Modelo de produtos</Button>
              </div>
            </div>
            <Notice title="Dados reais">Importe apenas dados fornecidos ou autorizados pelos fornecedores.</Notice>
          </aside>
        </motion.div>
      )}

      {step === 'map' && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-accent" />
            <h2 className="font-semibold">{fileName}</h2>
            <Badge>{formatNumber(rows.length)} linha(s)</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">Associe as colunas da sua planilha aos campos da FORNEX. Identificamos automaticamente as que têm nomes conhecidos.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <Select key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} value={mapping[f.key] ?? ''}
                onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                <option value="">— Não importar —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            ))}
          </div>
          {mode === 'suppliers' && (
            <div className="mt-5 max-w-md">
              <Switch checked={publish} onChange={setPublish} label="Publicar imediatamente"
                description="Desligado: os fornecedores entram como rascunho para revisão." />
            </div>
          )}
          {mode === 'products' && !mapping.external_id && (
            <div className="mt-5"><Notice tone="warning" title="Sem ID externo">Sem essa coluna, cada importação cria produtos novos em vez de atualizar os existentes.</Notice></div>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={reset} icon={<ArrowLeft className="h-4 w-4" />}>Trocar arquivo</Button>
            <Button disabled={missingRequired.length > 0} onClick={() => setStep('preview')} icon={<ArrowRight className="h-4 w-4" />}>
              {missingRequired.length ? `Mapeie: ${missingRequired.map((f) => f.label).join(', ')}` : 'Revisar dados'}
            </Button>
          </div>
        </motion.section>
      )}

      {step === 'preview' && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="card p-4"><p className="text-xs uppercase tracking-wider text-muted">Linhas</p><p className="mt-1 text-2xl font-bold">{formatNumber(parsed.length)}</p></div>
            <div className="card p-4"><p className="text-xs uppercase tracking-wider text-muted">Válidas</p><p className="mt-1 text-2xl font-bold text-emerald-400">{formatNumber(validCount)}</p></div>
            <div className="card p-4"><p className="text-xs uppercase tracking-wider text-muted">Com erro (ignoradas)</p><p className="mt-1 text-2xl font-bold text-red-400">{formatNumber(parsed.length - validCount)}</p></div>
          </div>
          <div className="card scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className="border-b border-line bg-surface-2/40 text-xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2.5">#</th><th className="px-3 py-2.5">Status</th>
                {fields.filter((f) => mapping[f.key]).slice(0, 6).map((f) => <th key={f.key} className="px-3 py-2.5">{f.label}</th>)}
              </tr></thead>
              <tbody>
                {parsed.slice(0, 20).map((p) => (
                  <tr key={p.index} className="border-b border-line/60 align-top last:border-0">
                    <td className="px-3 py-2 text-muted">{p.index + 2}</td>
                    <td className="px-3 py-2">
                      {p.ok ? <CircleCheck className="h-4 w-4 text-emerald-400" />
                        : <span className="flex items-start gap-1.5 text-xs text-red-300"><CircleX className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />{p.errors.join('; ')}</span>}
                    </td>
                    {fields.filter((f) => mapping[f.key]).slice(0, 6).map((f) => (
                      <td key={f.key} className="max-w-[200px] truncate px-3 py-2">{rows[p.index]?.[mapping[f.key]] || <span className="text-muted">—</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.length > 20 && <p className="text-xs text-muted">Mostrando as 20 primeiras linhas. A numeração considera o cabeçalho como linha 1.</p>}
          {importing && (
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full bg-fornex-electric" animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" disabled={importing} onClick={() => setStep('map')} icon={<ArrowLeft className="h-4 w-4" />}>Ajustar colunas</Button>
            <Button loading={importing} disabled={validCount === 0} onClick={runImport} icon={<Upload className="h-4 w-4" />}>
              Importar {formatNumber(validCount)} registro(s)
            </Button>
          </div>
        </motion.section>
      )}

      {step === 'done' && summary && (
        <motion.section initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card mx-auto max-w-xl p-6 text-center sm:p-8">
          <span className={cn('mx-auto grid h-14 w-14 place-items-center rounded-full', summary.imported ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
            {summary.imported ? <CircleCheck className="h-7 w-7" /> : <CircleX className="h-7 w-7" />}
          </span>
          <h2 className="mt-4 text-xl font-bold">{summary.imported ? 'Importação concluída' : 'Importação não concluída'}</h2>
          <p className="mt-2 text-sm text-muted">
            {formatNumber(summary.imported)} importado(s) · {formatNumber(summary.invalid)} linha(s) inválida(s) · {formatNumber(summary.failed)} com falha no banco
          </p>
          {summary.errors.length > 0 && (
            <ul className="mt-4 space-y-1 rounded-fx-md border border-red-500/20 bg-red-500/[.05] p-3 text-left text-xs text-red-300">
              {summary.errors.slice(0, 8).map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="secondary" onClick={reset}>Nova importação</Button>
            <Link to={mode === 'suppliers' ? '/admin/fornecedores' : `/admin/fornecedores/${supplierId}`}
              className="inline-flex h-11 items-center justify-center rounded-fx-md bg-fornex-electric px-4 text-sm font-medium text-white hover:bg-fornex-electric-hover">
              {mode === 'suppliers' ? 'Ver fornecedores' : 'Ver produtos'}
            </Link>
          </div>
        </motion.section>
      )}
    </div>
  )
}

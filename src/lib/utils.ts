import { clsx, type ClassValue } from 'clsx'

export const cn = (...inputs: ClassValue[]) => clsx(inputs)

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatBRL = (cents: number | null | undefined) =>
  cents == null ? '—' : brl.format(cents / 100)

export const formatNumber = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR').format(n)

export const formatDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' })
}

export const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']]
  let value = -diff
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit)
    value /= size
  }
  return formatDate(iso)
}

export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)

export const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

export const whatsappUrl = (phone: string | null | undefined, text?: string) => {
  let d = onlyDigits(phone)
  if (!d) return null
  if (d.length <= 11) d = '55' + d
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/** Garante que links externos sejam http(s) — bloqueia javascript: e afins */
export const safeUrl = (u: string | null | undefined) => {
  if (!u) return null
  try {
    const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch { return null }
}

export const socialUrl = (kind: 'instagram' | 'facebook' | 'tiktok', handle: string | null | undefined) => {
  if (!handle) return null
  if (/^https?:\/\//i.test(handle)) return safeUrl(handle)
  const h = handle.replace(/^@/, '').trim()
  if (!/^[\w.-]{1,60}$/.test(h)) return null
  return { instagram: `https://instagram.com/${h}`, facebook: `https://facebook.com/${h}`, tiktok: `https://tiktok.com/@${h}` }[kind]
}

export async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export const initials = (name: string | null | undefined) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')

/** Mensagens de erro amigáveis (sem expor detalhes internos) */
export function errorMessage(err: unknown, fallback = 'Algo deu errado. Tente novamente.') {
  const msg = (err as { message?: string })?.message ?? ''
  const map: Record<string, string> = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'User already registered': 'Este e-mail já possui cadastro.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.',
    already_subscribed: 'Você já possui uma assinatura ativa.',
    free_plan_unavailable: 'O plano gratuito não está disponível no momento.',
    forbidden: 'Você não tem permissão para esta ação.',
    cannot_demote_self: 'Você não pode remover seu próprio acesso de administrador.',
  }
  for (const k of Object.keys(map)) if (msg.includes(k)) return map[k]
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde um pouco e tente novamente.'
  if (/password should be/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (/duplicate key/i.test(msg)) return 'Já existe um registro com esses dados (ex.: slug repetido).'
  return fallback
}

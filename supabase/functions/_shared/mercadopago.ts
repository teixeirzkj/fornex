import { HttpError } from './http.ts'

const MP_API = 'https://api.mercadopago.com'

export function mpToken(): string | null {
  return Deno.env.get('MP_ACCESS_TOKEN') || null
}

/** Chamada autenticada à API do Mercado Pago. */
export async function mpFetch<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const token = mpToken()
  if (!token) {
    throw new HttpError(503, 'gateway_not_configured',
      'O pagamento online ainda não foi configurado. Defina MP_ACCESS_TOKEN nas secrets do Supabase.')
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  if (init.idempotencyKey) headers['X-Idempotency-Key'] = init.idempotencyKey
  const res = await fetch(`${MP_API}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error('Mercado Pago', res.status, path, text.slice(0, 500))
    throw new HttpError(res.status >= 500 ? 502 : 400, 'gateway_error',
      `O Mercado Pago recusou a operação (HTTP ${res.status}).`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

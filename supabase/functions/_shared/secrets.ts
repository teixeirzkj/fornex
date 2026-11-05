// Segredos de integrações ficam em variáveis de ambiente das Edge Functions
// (supabase secrets set SUPPLIER_XYZ_TOKEN=...). O banco guarda apenas o NOME.
// O prefixo obrigatório impede que uma configuração leia SUPABASE_SERVICE_ROLE_KEY etc.

const SECRET_NAME_RE = /^SUPPLIER_[A-Z0-9_]{2,60}$/

export function isValidSecretName(name: unknown): name is string {
  return typeof name === 'string' && SECRET_NAME_RE.test(name)
}

/** Retorna o valor do segredo, ou null se o nome for inválido ou não estiver definido. */
export function readSupplierSecret(name: unknown): string | null {
  if (!isValidSecretName(name)) return null
  const value = Deno.env.get(name)
  return value && value.length > 0 ? value : null
}

/** Comparação em tempo constante (evita timing attacks). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  // Compara sempre o comprimento máximo para não vazar o tamanho por tempo.
  const len = Math.max(ab.length, bb.length)
  let diff = ab.length ^ bb.length
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

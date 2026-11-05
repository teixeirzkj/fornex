// CORS restrito: apenas a origem do frontend (APP_URL).
// Em desenvolvimento, defina ALLOW_LOCALHOST=true para liberar http://localhost:5173.

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type'

function allowedOrigins(): string[] {
  const list: string[] = []
  const app = Deno.env.get('APP_URL')
  if (app) list.push(app.replace(/\/+$/, ''))
  if (Deno.env.get('ALLOW_LOCALHOST') === 'true') {
    list.push('http://localhost:5173', 'http://127.0.0.1:5173')
  }
  return list
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

/** Responde ao preflight. Retorna null se não for OPTIONS. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response('ok', { headers: corsHeaders(req) })
}

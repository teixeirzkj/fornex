// Respostas JSON padronizadas. Erros: { error: '<codigo>', message: '<texto pt-BR>' }.
// Nunca devolver stack trace ou mensagens internas ao cliente.

export function json(status: number, body: unknown, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function fail(status: number, code: string, message: string, cors: Record<string, string> = {}): Response {
  return json(status, { error: code, message }, cors)
}

/** Erro de domínio com código e status HTTP, convertido em resposta pelo handler. */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export function errorResponse(err: unknown, cors: Record<string, string> = {}): Response {
  if (err instanceof HttpError) return fail(err.status, err.code, err.message, cors)
  console.error(err) // log interno apenas
  return fail(500, 'internal_error', 'Erro interno. Tente novamente em instantes.', cors)
}

/** Lê o corpo JSON com limite de tamanho. */
export async function readJson<T = unknown>(req: Request, maxBytes = 64 * 1024): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? '0')
  if (len > maxBytes) throw new HttpError(413, 'payload_too_large', 'Corpo da requisição muito grande.')
  const text = await req.text()
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError(413, 'payload_too_large', 'Corpo da requisição muito grande.')
  }
  if (!text) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON inválido.')
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

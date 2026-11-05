import { supabase } from './supabase'

/** Campos de fornecedor usados nas listagens (nunca select('*') em listas) */
export const SUPPLIER_LIST_COLUMNS =
  'id, name, slug, logo_url, category_id, description, city, state, tags, is_verified, is_demo, updated_at, min_access_level, category:supplier_categories(id, name, slug, icon)'

export class FunctionError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

/** Chama uma Edge Function com o JWT do usuário logado */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> })
  if (error) {
    let code = 'unknown'
    let message = 'Não foi possível concluir a operação.'
    try {
      const ctx = (error as { context?: Response }).context
      const json = ctx ? await ctx.json() : null
      if (json?.error) code = json.error
      if (json?.message) message = json.message
    } catch { /* corpo não-JSON */ }
    if (code === 'unknown' && /Failed to send|fetch/i.test(error.message)) {
      code = 'function_unavailable'
      message = `A função "${name}" ainda não foi publicada no Supabase.`
    }
    throw new FunctionError(code, message)
  }
  return data as T
}

/** Remove caracteres que poderiam alterar filtros PostgREST montados com .or() */
export const sanitizeSearch = (q: string) => q.replace(/[^\p{L}\p{N}\s.-]/gu, ' ').trim().slice(0, 60)

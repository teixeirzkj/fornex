import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './http.ts'

/** Cliente com service role — ignora RLS. Usar SOMENTE no servidor. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Valida o JWT do usuário no Supabase Auth (getUser revalida o token;
 * nunca confiar em getSession no servidor).
 */
export async function getUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

export async function requireUser(req: Request): Promise<User> {
  const user = await getUser(req)
  if (!user) throw new HttpError(401, 'unauthorized', 'Faça login para continuar.')
  return user
}

/** Papel lido da tabela profiles (coluna protegida contra edição do usuário). */
export async function requireAdmin(user: User, db: SupabaseClient = adminClient()): Promise<void> {
  const { data, error } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (data?.role !== 'admin') throw new HttpError(403, 'forbidden', 'Acesso restrito a administradores.')
}

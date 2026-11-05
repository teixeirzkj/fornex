import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true quando as variáveis públicas do Supabase foram definidas no .env */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('SEU-PROJETO'))

// Somente a chave PÚBLICA (anon/publishable) vai para o navegador.
// A segurança dos dados é garantida pelas políticas RLS no banco.
export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } },
)

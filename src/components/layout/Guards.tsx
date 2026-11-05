import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import { PageLoader } from '@/components/ui/Feedback'
import { SetupRequired } from '@/components/SetupRequired'

/**
 * Guards de rota servem para UX (redirecionar). A proteção REAL dos dados
 * está nas políticas RLS do banco: mesmo que alguém force a rota, o
 * Supabase não devolve dados sem permissão.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth()
  const location = useLocation()
  if (!isSupabaseConfigured) return <SetupRequired />
  if (loading) return <PageLoader />
  if (!session) return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, session, profile, isAdmin } = useAuth()
  if (!isSupabaseConfigured) return <SetupRequired />
  if (loading || (session && !profile)) return <PageLoader />
  if (!session) return <Navigate to="/entrar?next=/admin" replace />
  if (!isAdmin) return <Navigate to="/app" replace />
  return <>{children}</>
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth()
  const params = new URLSearchParams(window.location.search)
  if (loading) return <PageLoader />
  if (session) {
    const plano = params.get('plano')
    const to = plano && /^[a-z0-9-]{2,40}$/.test(plano) ? `/app/assinatura?plano=${plano}` : safeNext(params.get('next'))
    return <Navigate to={to} replace />
  }
  return <>{children}</>
}

/** Evita open redirect: só aceita caminhos internos */
export function safeNext(next: string | null, fallback = '/app') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback
  return next
}

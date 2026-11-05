import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Profile, Subscription } from '@/types/db'

interface AuthState {
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  subscription: Subscription | null
  /** -1 = sem assinatura ativa; 0 = gratuito; 1+ = planos pagos; 1000 = admin */
  accessLevel: number
  isAdmin: boolean
  hasActiveSubscription: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const LIVE: Subscription['status'][] = ['active', 'past_due', 'paused', 'pending']

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [accessLevel, setAccessLevel] = useState(-1)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  const loadUserData = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null); setSubscription(null); setAccessLevel(-1)
      return
    }
    const [p, sub, lvl] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, phone, company, avatar_url, role, created_at').eq('id', s.user.id).maybeSingle(),
      supabase.from('subscriptions')
        .select('id, user_id, plan_id, status, gateway, gateway_subscription_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at, plan:plans(id, slug, name, description, price_cents, interval, installments, access_level, features_title, features, limits, cta_label, badge, highlight, is_active, sort_order)')
        .eq('user_id', s.user.id).in('status', LIVE).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.rpc('current_access_level'),
    ])
    setProfile((p.data as Profile) ?? null)
    setSubscription((sub.data as unknown as Subscription) ?? null)
    setAccessLevel(typeof lvl.data === 'number' ? lvl.data : -1)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let mounted = true
    let lastUserId: string | null = null
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      lastUserId = data.session?.user.id ?? null
      setSession(data.session)
      await loadUserData(data.session)
      if (mounted) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      const uid = s?.user.id ?? null
      // SIGNED_IN também dispara ao voltar para a aba: só recarrega se a pessoa logada mudou.
      const changed = uid !== lastUserId
      lastUserId = uid
      // setTimeout evita chamadas ao Supabase dentro do callback síncrono (deadlock conhecido)
      if (event === 'USER_UPDATED' || event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && changed)) {
        setTimeout(() => { void loadUserData(s) }, 0)
      }
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [loadUserData])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadUserData(data.session)
  }, [loadUserData])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null); setProfile(null); setSubscription(null); setAccessLevel(-1)
  }, [])

  // Objeto do usuário estável entre renovações de token (evita recarregar telas à toa)
  const userId = session?.user?.id ?? null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableUser = useMemo(() => session?.user ?? null, [userId])

  const value = useMemo<AuthState>(() => ({
    loading, session, user: stableUser, profile, subscription, accessLevel,
    isAdmin: profile?.role === 'admin',
    hasActiveSubscription: accessLevel >= 0,
    refresh, signOut,
  }), [loading, session, stableUser, profile, subscription, accessLevel, refresh, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}

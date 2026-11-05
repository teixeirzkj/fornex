import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface FavoritesState {
  ids: Set<string>
  loading: boolean
  max: number | null
  isFavorite: (id: string) => boolean
  toggle: (id: string, name?: string) => Promise<void>
}

const Ctx = createContext<FavoritesState | null>(null)

/** Estado global de favoritos do usuário (otimista + persistido no banco) */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, subscription, isAdmin } = useAuth()
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const max = isAdmin ? null : (subscription?.plan?.limits?.max_favorites ?? null)

  useEffect(() => {
    if (!user) return
    supabase.from('favorites').select('supplier_id').eq('user_id', user.id).then(({ data }) => {
      setIds(new Set((data ?? []).map((r) => r.supplier_id as string)))
      setLoading(false)
    })
  }, [user])

  const toggle = useCallback(async (id: string, name?: string) => {
    if (!user) return
    const was = ids.has(id)
    if (!was && max != null && ids.size >= max) {
      toast.error(`Seu plano permite até ${max} favoritos.`, { description: 'Faça upgrade para favoritos ilimitados.' })
      return
    }
    setIds((prev) => { const n = new Set(prev); if (was) n.delete(id); else n.add(id); return n })
    const { error } = was
      ? await supabase.from('favorites').delete().eq('user_id', user.id).eq('supplier_id', id)
      : await supabase.from('favorites').insert({ user_id: user.id, supplier_id: id })
    if (error) {
      setIds((prev) => { const n = new Set(prev); if (was) n.add(id); else n.delete(id); return n })
      toast.error('Não foi possível atualizar os favoritos.')
      return
    }
    toast.success(was ? 'Removido dos favoritos' : 'Adicionado aos favoritos', name ? { description: name } : undefined)
  }, [ids, max, user])

  const value = useMemo(() => ({ ids, loading, max, isFavorite: (id: string) => ids.has(id), toggle }), [ids, loading, max, toggle])
  return createElement(Ctx.Provider, { value }, children)
}

export function useFavorites() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFavorites deve ser usado dentro de <FavoritesProvider>')
  return ctx
}

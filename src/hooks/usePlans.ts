import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Plan } from '@/types/db'

export const PLAN_COLUMNS = 'id, slug, name, description, price_cents, interval, installments, access_level, features_title, features, limits, cta_label, badge, highlight, is_active, sort_order'

/** Planos ativos vindos do banco (tabela plans) */
export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.from('plans').select(PLAN_COLUMNS).eq('is_active', true).order('sort_order')
      .then(({ data, error: e }) => {
        if (e) setError('Não foi possível carregar os planos.')
        setPlans((data as Plan[]) ?? [])
        setLoading(false)
      })
  }, [])

  return { plans, loading, error }
}

export const intervalLabel = (i: Plan['interval']) => ({ free: 'grátis', month: '/mês', year: '/ano', lifetime: 'pagamento único' }[i])

/** Valor por parcela quando o plano é parcelado (ex.: vitalício em 12x) */
export const installmentCents = (p: Pick<Plan, 'price_cents' | 'installments'>) =>
  p.installments > 1 ? Math.round(p.price_cents / p.installments) : null

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Heart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SUPPLIER_LIST_COLUMNS } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import type { SupplierListItem } from '@/types/db'
import { PageHeader, SupplierCard, SupplierCardSkeleton } from '@/components/app/Shared'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'

export default function Favorites() {
  const { user } = useAuth()
  const { ids, max } = useFavorites()
  const [items, setItems] = useState<SupplierListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('favorites').select(`created_at, supplier:suppliers(${SUPPLIER_LIST_COLUMNS})`)
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => {
        setItems(((data ?? []) as unknown as { supplier: SupplierListItem | null }[]).map((r) => r.supplier).filter(Boolean) as SupplierListItem[])
        setLoading(false)
      })
  }, [user])

  // Remove da tela assim que o usuário desfavorita
  const visible = useMemo(() => items.filter((s) => ids.has(s.id)), [items, ids])

  return (
    <div>
      <PageHeader eyebrow="Sua seleção" title="Favoritos"
        description={max != null ? `Você está usando ${ids.size} de ${max} favoritos do seu plano.` : 'Fornecedores salvos para consulta rápida.'} />
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <SupplierCardSkeleton key={i} />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Heart />} title="Você ainda não tem favoritos"
          description="Toque no coração de um fornecedor para salvá-lo aqui."
          action={<ButtonLink to="/app/fornecedores">Explorar fornecedores</ButtonLink>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>{visible.map((s, i) => <SupplierCard key={s.id} s={s} index={i} />)}</AnimatePresence>
        </div>
      )}
    </div>
  )
}

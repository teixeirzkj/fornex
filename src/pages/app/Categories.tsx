import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, LayoutGrid } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/types/db'
import { PageHeader } from '@/components/app/Shared'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { fadeUp, stagger } from '@/components/ui/motion'

export default function Categories() {
  const [cats, setCats] = useState<Category[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('supplier_categories').select('id, name, slug, description, icon, sort_order').order('sort_order'),
      supabase.rpc('public_category_counts'),
    ]).then(([c, n]) => {
      setCats((c.data as Category[]) ?? [])
      const map: Record<string, number> = {}
      for (const r of (n.data as { category_id: string; total: number }[]) ?? []) map[r.category_id] = Number(r.total)
      setCounts(map)
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Explorar" title="Categorias" description="Navegue pelos segmentos e encontre fornecedores do seu nicho." />
      {loading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : cats.length === 0 ? (
        <EmptyState icon={<LayoutGrid />} title="Nenhuma categoria cadastrada" description="As categorias são criadas pela equipe da plataforma." />
      ) : (
        <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
          {cats.map((c) => (
            <motion.div key={c.id} variants={fadeUp}>
              <Link to={`/app/fornecedores?categoria=${c.slug}`}
                className="card group flex h-full flex-col p-3.5 sm:p-5 transition duration-300 ease-fx hover:-translate-y-0.5 hover:border-accent/40">
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-fx-md bg-accent/10 text-accent"><CategoryIcon name={c.icon} className="h-5 w-5" /></span>
                  <ArrowUpRight className="h-4 w-4 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
                </div>
                <h3 className="mt-3 font-heading text-sm font-bold text-fg sm:mt-4 sm:text-base">{c.name}</h3>
                {c.description && <p className="mt-1 line-clamp-2 text-xs text-muted sm:text-sm">{c.description}</p>}
                <p className="mt-auto pt-3 text-[11px] font-medium text-muted sm:pt-4 sm:text-xs">
                  {counts[c.id] ? `${counts[c.id]} ${counts[c.id] === 1 ? 'fornecedor publicado' : 'fornecedores publicados'}` : 'Em breve'}
                </p>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

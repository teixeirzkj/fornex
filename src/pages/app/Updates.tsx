import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, CheckCheck, CreditCard, Megaphone, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatDate, timeAgo } from '@/lib/utils'
import type { Notification } from '@/types/db'
import { PageHeader } from '@/components/app/Shared'
import { Button } from '@/components/ui/Button'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { fadeUp, stagger } from '@/components/ui/motion'

const KIND = {
  update: { label: 'Atualização', icon: Megaphone },
  new_supplier: { label: 'Novo fornecedor', icon: Building2 },
  system: { label: 'Sistema', icon: Settings },
  billing: { label: 'Assinatura', icon: CreditCard },
}

export default function Updates() {
  const { user } = useAuth()
  const [items, setItems] = useState<Notification[]>([])
  const [read, setRead] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('notifications').select('id, user_id, kind, title, body, link, published_at, created_at').order('published_at', { ascending: false }).limit(50),
      supabase.from('notification_reads').select('notification_id').eq('user_id', user.id),
    ]).then(([n, r]) => {
      setItems((n.data as Notification[]) ?? [])
      setRead(new Set((r.data ?? []).map((x) => x.notification_id as string)))
      setLoading(false)
    })
  }, [user])

  const unread = items.filter((i) => !read.has(i.id))

  const markAll = async () => {
    if (!user || unread.length === 0) return
    const rows = unread.map((i) => ({ user_id: user.id, notification_id: i.id }))
    const { error } = await supabase.from('notification_reads').upsert(rows, { onConflict: 'user_id,notification_id', ignoreDuplicates: true })
    if (!error) setRead(new Set(items.map((i) => i.id)))
  }

  const markOne = async (id: string) => {
    if (!user || read.has(id)) return
    setRead((p) => new Set(p).add(id))
    await supabase.from('notification_reads').upsert({ user_id: user.id, notification_id: id }, { onConflict: 'user_id,notification_id', ignoreDuplicates: true })
  }

  return (
    <div>
      <PageHeader eyebrow="Novidades" title="Atualizações" description="Novos fornecedores, melhorias e comunicados da plataforma."
        actions={unread.length > 0 && <Button variant="secondary" size="sm" onClick={markAll} icon={<CheckCheck className="h-4 w-4" />}>Marcar todas como lidas</Button>} />
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Megaphone />} title="Nenhuma atualização por enquanto" description="Quando publicarmos novidades, elas aparecerão aqui." />
      ) : (
        <motion.ol variants={stagger(0.05)} initial="hidden" animate="show" className="relative space-y-3 border-l border-line pl-5 sm:pl-6">
          {items.map((n) => {
            const k = KIND[n.kind] ?? KIND.update
            const isUnread = !read.has(n.id)
            return (
              <motion.li key={n.id} variants={fadeUp} className="relative" onMouseEnter={() => markOne(n.id)} onFocus={() => markOne(n.id)}>
                <span className={cn('absolute -left-[27px] top-5 h-3 w-3 rounded-full border-2 border-bg sm:-left-[31px]', isUnread ? 'bg-fornex-blue' : 'bg-line')} />
                <article className={cn('card p-4 sm:p-5', isUnread && 'border-accent/30')} tabIndex={0}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={isUnread ? 'blue' : 'neutral'}><k.icon className="h-3 w-3" />{k.label}</Badge>
                    <time className="text-xs text-muted" dateTime={n.published_at} title={formatDate(n.published_at, true)}>{timeAgo(n.published_at)}</time>
                  </div>
                  <h3 className="mt-2 font-heading text-base font-bold text-fg">{n.title}</h3>
                  {n.body && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted">{n.body}</p>}
                  {n.link && (n.link.startsWith('/') ? (
                    <Link to={n.link} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">Ver mais <ArrowRight className="h-3.5 w-3.5" /></Link>
                  ) : n.link.startsWith('https://') && (
                    <a href={n.link} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">Ver mais <ArrowRight className="h-3.5 w-3.5" /></a>
                  ))}
                </article>
              </motion.li>
            )
          })}
        </motion.ol>
      )}
    </div>
  )
}

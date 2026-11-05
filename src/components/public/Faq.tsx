import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { EASE } from '@/components/ui/motion'
import { cn } from '@/lib/utils'

export interface FaqItem { q: string; a: string }

export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = open === i
        return (
          <div key={item.q} className={cn('overflow-hidden rounded-fx-lg border bg-surface transition-colors', isOpen ? 'border-accent/40' : 'border-line')}>
            <button type="button" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
              <span className="text-[15px] font-semibold text-fg">{item.q}</span>
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.45, ease: EASE }}
                className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line', isOpen ? 'text-accent' : 'text-muted')}>
                <ChevronDown className="h-4 w-4" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.45, ease: EASE }}>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

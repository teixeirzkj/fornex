import { Link, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, Search, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { EASE } from '@/components/ui/motion'
import { BRAND } from '@/lib/config'

const POINTS = [
  { icon: Search, title: 'Encontre com facilidade', text: 'Busque fornecedores por nome, categoria e região.' },
  { icon: Heart, title: 'Organize seus contatos', text: 'Favoritos e histórico para retomar de onde parou.' },
  { icon: ShieldCheck, title: 'Seus dados protegidos', text: 'Cada conta acessa apenas as próprias informações.' },
]

export default function AuthLayout() {
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-fornex-midnight lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_20%,black,transparent_70%)]" />
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-fornex-electric/20 blur-3xl" />
        <Link to="/" className="relative" aria-label="FORNEX — início"><Logo className="h-8" /></Link>

        <div className="relative max-w-md">
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: EASE }}
            className="text-4xl font-extrabold leading-tight text-white">
            {BRAND.tagline}
          </motion.h1>
          <p className="mt-4 text-muted">Centralize suas pesquisas e contatos de fornecedores em uma plataforma feita para quem vende online.</p>
          <ul className="mt-10 space-y-5">
            {POINTS.map((p, i) => (
              <motion.li key={p.title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.6, ease: EASE }} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fx-md border border-line bg-surface text-fornex-ice">
                  <p.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{p.title}</span>
                  <span className="block text-sm text-muted">{p.text}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted">© {new Date().getFullYear()} FORNEX</p>
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8">
        <Link to="/" className="mb-10 lg:hidden" aria-label="FORNEX — início"><Logo className="h-7" /></Link>
        <div className="flex flex-1 items-center justify-center">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }}
            className="w-full max-w-sm">
            <Outlet />
          </motion.div>
        </div>
      </main>
    </div>
  )
}

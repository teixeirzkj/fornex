import { ArrowLeft, Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { PageTransition } from '@/components/ui/motion'

export default function NotFound() {
  return (
    <PageTransition className="container-fx flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-fx-lg border border-line bg-surface text-fornex-ice">
        <Compass className="h-6 w-6" />
      </div>
      <p className="mt-6 font-heading text-6xl font-extrabold text-white">404</p>
      <h1 className="mt-3 text-xl font-bold text-fg">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">O endereço pode ter mudado ou não existe mais. Confira o link ou volte para o início.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink to="/" icon={<ArrowLeft className="h-4 w-4" />}>Voltar ao início</ButtonLink>
        <ButtonLink to="/app" variant="secondary">Ir para o painel</ButtonLink>
      </div>
    </PageTransition>
  )
}

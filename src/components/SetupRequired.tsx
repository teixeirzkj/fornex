import { Database } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { ButtonLink } from '@/components/ui/Button'

/** Exibida quando o .env do Supabase ainda não foi configurado */
export function SetupRequired() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="card w-full max-w-lg p-8">
        <Logo className="h-8" />
        <div className="mt-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-fx-md bg-accent/10 text-accent"><Database className="h-5 w-5" /></div>
          <h1 className="text-xl font-bold">Conecte o banco de dados</h1>
        </div>
        <p className="mt-3 text-sm text-muted">
          A área logada precisa de um projeto Supabase. Siga o passo a passo do <code className="rounded bg-surface-2 px-1.5 py-0.5 text-fg">README.md</code>:
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Crie um projeto em supabase.com.</li>
          <li>Rode a migration <code className="text-fg">supabase/migrations</code> e o <code className="text-fg">supabase/seed.sql</code>.</li>
          <li>Copie <code className="text-fg">.env.example</code> para <code className="text-fg">.env</code> e preencha <code className="text-fg">VITE_SUPABASE_URL</code> e <code className="text-fg">VITE_SUPABASE_ANON_KEY</code>.</li>
          <li>Reinicie o <code className="text-fg">npm run dev</code>.</li>
        </ol>
        <ButtonLink to="/" variant="secondary" className="mt-6">Voltar ao site</ButtonLink>
      </div>
    </div>
  )
}

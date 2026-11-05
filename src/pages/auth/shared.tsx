import type { ReactNode } from 'react'
import { Notice } from '@/components/ui/Feedback'
import { safeNext } from '@/components/layout/Guards'
import { isSupabaseConfigured } from '@/lib/supabase'

/** Destino após login/cadastro: fluxo de plano (?plano=) tem prioridade sobre ?next= */
export function postAuthPath(params: URLSearchParams) {
  const plano = params.get('plano')
  if (plano && /^[a-z0-9-]{2,40}$/.test(plano)) return `/app/assinatura?plano=${plano}`
  return safeNext(params.get('next'))
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-extrabold text-fg sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
    </div>
  )
}

export function NotConfiguredNotice() {
  if (isSupabaseConfigured) return null
  return (
    <div className="mb-6">
      <Notice tone="warning" title="Banco de dados não conectado">
        Configure o Supabase no arquivo .env para habilitar login e cadastro (veja o README).
      </Notice>
    </div>
  )
}

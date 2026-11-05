import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MailCheck, MailX } from 'lucide-react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'

const TYPES: EmailOtpType[] = ['email', 'signup', 'recovery', 'invite', 'magiclink', 'email_change']

/** Extrai só caminho interno do "next" (evita redirecionar para outro site) */
function internalNext(raw: string | null) {
  if (!raw) return null
  try {
    const u = new URL(raw, window.location.origin)
    if (u.origin !== window.location.origin && !/^https:\/\/fornex-[\w-]+\.vercel\.app$|^http:\/\/localhost:\d+$/.test(u.origin)) return null
    return u
  } catch { return null }
}

/**
 * Destino dos links dos e-mails (confirmação, recuperação, troca de e-mail).
 * Usa token_hash + verifyOtp, que funciona mesmo abrindo o e-mail em outro aparelho.
 */
export default function Confirm() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState<'loading' | 'error'>('loading')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const tokenHash = params.get('token_hash')
    const type = params.get('type') as EmailOtpType | null
    if (!tokenHash || !type || !TYPES.includes(type)) { setState('error'); return }

    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      if (error) { setState('error'); return }
      if (type === 'recovery') { navigate('/redefinir-senha', { replace: true }); return }
      if (type === 'email_change') { navigate('/app/conta', { replace: true }); return }
      const next = internalNext(params.get('next'))
      const plano = next?.searchParams.get('plano')
      if (plano && /^[a-z0-9-]{2,40}$/.test(plano)) navigate(`/app/assinatura?plano=${plano}`, { replace: true })
      else navigate('/app', { replace: true })
    })
  }, [params, navigate])

  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-fx-lg bg-accent/10 text-accent"><MailCheck className="h-6 w-6" /></div>
        <Spinner className="h-6 w-6" />
        <p className="mt-4 text-sm text-muted">Confirmando seu acesso…</p>
      </div>
    )
  }
  return (
    <div className="text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-fx-lg bg-red-500/10 text-red-400"><MailX className="h-6 w-6" /></div>
      <h1 className="mt-6 text-2xl font-extrabold text-fg">Link inválido ou expirado</h1>
      <p className="mt-3 text-sm text-muted">Os links enviados por e-mail valem por tempo limitado e só podem ser usados uma vez.</p>
      <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
        <ButtonLink to="/entrar">Ir para o login</ButtonLink>
        <ButtonLink to="/recuperar-senha" variant="secondary">Pedir novo link de senha</ButtonLink>
      </div>
      <p className="mt-6 text-xs text-muted">Se você já confirmou, é só <Link to="/entrar" className="text-accent hover:underline">entrar</Link>.</p>
    </div>
  )
}

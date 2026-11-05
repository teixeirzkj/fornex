import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CircleX as XCircle, Store } from 'lucide-react'
import { toast } from 'sonner'
import { callFunction, FunctionError } from '@/lib/api'
import { Spinner } from '@/components/ui/Feedback'
import { ButtonLink } from '@/components/ui/Button'

/** Retorno do Mercado Livre depois que o cliente autoriza a FORNEX */
export default function StoresCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const code = params.get('code')
    const state = params.get('state')
    if (params.get('error')) { setError('Você cancelou a autorização no Mercado Livre.'); return }
    if (!code || !state) { setError('Retorno do Mercado Livre inválido.'); return }
    callFunction<{ account: { nickname: string | null } }>('ml-oauth', { action: 'callback', code, state })
      .then(({ account }) => {
        toast.success('Loja conectada!', { description: account.nickname ?? undefined })
        navigate('/app/lojas', { replace: true })
      })
      .catch((e: FunctionError) => setError(e.message || 'Não foi possível conectar a loja.'))
  }, [params, navigate])

  return (
    <div className="flex flex-col items-center py-20 text-center">
      {error ? (
        <>
          <span className="grid h-14 w-14 place-items-center rounded-full bg-red-500/10 text-red-400"><XCircle className="h-7 w-7" /></span>
          <h1 className="mt-5 font-heading text-xl font-bold text-fg">Loja não conectada</h1>
          <p className="mt-2 max-w-sm text-sm text-muted">{error}</p>
          <ButtonLink to="/app/lojas" className="mt-6">Voltar para Minhas lojas</ButtonLink>
        </>
      ) : (
        <>
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#FFE600] text-[#2D3277]"><Store className="h-7 w-7" /></span>
          <Spinner className="mt-6 h-6 w-6" />
          <p className="mt-3 text-sm text-muted">Conectando sua loja do Mercado Livre…</p>
        </>
      )}
    </div>
  )
}

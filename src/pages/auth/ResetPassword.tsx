import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Feedback'
import { AuthHeader, NotConfiguredNotice } from './shared'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>(isSupabaseConfigured ? 'checking' : 'invalid')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    // O link de recuperação cria uma sessão temporária (evento PASSWORD_RECOVERY)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) setReady('ok')
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady('ok')
      else setTimeout(() => setReady((r) => (r === 'checking' ? 'invalid' : r)), 2500)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('A senha precisa ter pelo menos 8 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(errorMessage(err, 'Não foi possível atualizar a senha. Solicite um novo link.')); return }
    toast.success('Senha atualizada com sucesso.')
    navigate('/app', { replace: true })
  }

  if (ready === 'checking') {
    return <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>
  }

  if (ready === 'invalid') {
    return (
      <div className="text-center">
        <NotConfiguredNotice />
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-fx-lg bg-accent/10 text-accent"><KeyRound className="h-6 w-6" /></div>
        <h1 className="mt-6 text-2xl font-extrabold text-fg">Link inválido ou expirado</h1>
        <p className="mt-3 text-sm text-muted">Solicite um novo link de recuperação para redefinir sua senha.</p>
        <Link to="/recuperar-senha" className="mt-8 inline-block text-sm font-semibold text-accent hover:underline">Solicitar novo link</Link>
      </div>
    )
  }

  return (
    <>
      <AuthHeader title="Criar nova senha" subtitle="Escolha uma senha com pelo menos 8 caracteres." />
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Nova senha" type="password" autoComplete="new-password" required icon={<Lock />} value={password}
          onChange={(e) => setPassword(e.target.value)} />
        <Input label="Confirmar senha" type="password" autoComplete="new-password" required icon={<Lock />} value={confirm}
          onChange={(e) => setConfirm(e.target.value)} />
        {error && <p className="rounded-fx-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!password || !confirm}>Salvar nova senha</Button>
      </form>
    </>
  )
}

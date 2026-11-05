import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { AuthHeader, NotConfiguredNotice, postAuthPath } from './shared'

export default function Login() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) {
      setLoading(false)
      setError(errorMessage(err, 'E-mail ou senha incorretos.'))
      return
    }
    await refresh()
    toast.success('Bem-vindo de volta!')
    navigate(postAuthPath(params), { replace: true })
  }

  const qs = params.toString()
  return (
    <>
      <AuthHeader title="Entrar na sua conta" subtitle="Acesse seu painel de fornecedores." />
      <NotConfiguredNotice />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label="E-mail" type="email" autoComplete="email" required icon={<Mail />} value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
        <div>
          <Input label="Senha" type="password" autoComplete="current-password" required icon={<Lock />} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" />
          <div className="mt-2 text-right">
            <Link to="/recuperar-senha" className="text-xs font-medium text-accent hover:underline">Esqueci minha senha</Link>
          </div>
        </div>
        {error && <p className="rounded-fx-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!isSupabaseConfigured || !email || !password}>Entrar</Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        Ainda não tem conta? <Link to={`/cadastro${qs ? `?${qs}` : ''}`} className="font-semibold text-accent hover:underline">Criar conta</Link>
      </p>
    </>
  )
}

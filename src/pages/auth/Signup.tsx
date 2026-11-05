import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Mail, MailCheck, User } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { cn, errorMessage } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { AuthHeader, NotConfiguredNotice, postAuthPath } from './shared'

function passwordStrength(p: string) {
  let score = 0
  if (p.length >= 8) score++
  if (p.length >= 12) score++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++
  if (/\d/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  const levels = [
    { label: 'Muito fraca', color: 'bg-red-500' },
    { label: 'Fraca', color: 'bg-red-500' },
    { label: 'Razoável', color: 'bg-amber-500' },
    { label: 'Boa', color: 'bg-fornex-blue' },
    { label: 'Forte', color: 'bg-emerald-500' },
    { label: 'Muito forte', color: 'bg-emerald-500' },
  ]
  return { score, ...levels[score] }
}

export default function Signup() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const strength = useMemo(() => passwordStrength(password), [password])

  const nameOk = name.trim().length >= 2
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const pwdOk = password.length >= 8
  const canSubmit = isSupabaseConfigured && nameOk && emailOk && pwdOk && accepted

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (website) { setSent(true); return } // bot: finge sucesso e descarta
    if (!canSubmit) return
    setLoading(true)
    const plano = params.get('plano')
    const redirect = new URL('/entrar', window.location.origin)
    if (plano && /^[a-z0-9-]{2,40}$/.test(plano)) redirect.searchParams.set('plano', plano)

    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim().slice(0, 120) }, emailRedirectTo: redirect.toString() },
    })
    setLoading(false)
    if (err) { setError(errorMessage(err, 'Não foi possível criar sua conta. Tente novamente.')); return }

    if (data.session) {
      await refresh()
      toast.success('Conta criada com sucesso!')
      navigate(postAuthPath(params), { replace: true })
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-fx-lg bg-accent/10 text-accent"><MailCheck className="h-6 w-6" /></div>
        <h1 className="mt-6 text-2xl font-extrabold text-fg">Confirme seu e-mail</h1>
        <p className="mt-3 text-sm text-muted">
          Enviamos um link de confirmação para <span className="font-medium text-fg">{email || 'seu e-mail'}</span>. Abra a mensagem para ativar sua conta.
        </p>
        <p className="mt-2 text-xs text-muted">Não encontrou? Verifique a caixa de spam.</p>
        <ButtonLink to={`/entrar${params.toString() ? `?${params}` : ''}`} variant="secondary" className="mt-8 w-full">Ir para o login</ButtonLink>
      </motion.div>
    )
  }

  const qs = params.toString()
  return (
    <>
      <AuthHeader title="Crie sua conta" subtitle={params.get('plano') ? 'Depois do cadastro você finaliza a contratação do plano escolhido.' : 'Grátis e em menos de um minuto.'} />
      <NotConfiguredNotice />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label="Nome completo" autoComplete="name" required icon={<User />} value={name} maxLength={120}
          onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
        <Input label="E-mail" type="email" autoComplete="email" required icon={<Mail />} value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com"
          error={email && !emailOk ? 'Informe um e-mail válido.' : null} />
        <div>
          <Input label="Senha" type="password" autoComplete="new-password" required icon={<Lock />} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" />
          {password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < strength.score ? strength.color : 'bg-line')} />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">{pwdOk ? `Força: ${strength.label}` : 'Use pelo menos 8 caracteres.'}</p>
            </div>
          )}
        </div>

        {/* honeypot: invisível para pessoas */}
        <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
          <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" /></label>
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-bg accent-[#155EEF]" />
          <span>
            Li e aceito os <Link to="/legal/termos" target="_blank" className="text-accent hover:underline">Termos de uso</Link> e a{' '}
            <Link to="/legal/privacidade" target="_blank" className="text-accent hover:underline">Política de privacidade</Link>.
          </span>
        </label>

        {error && <p className="rounded-fx-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300" role="alert">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!canSubmit}>Criar conta</Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        Já tem conta? <Link to={`/entrar${qs ? `?${qs}` : ''}`} className="font-semibold text-accent hover:underline">Entrar</Link>
      </p>
    </>
  )
}

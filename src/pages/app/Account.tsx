import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, Mail, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { errorMessage, formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/app/Shared'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'

const ProfileSchema = z.object({
  full_name: z.string().trim().min(2, 'Informe seu nome').max(120),
  phone: z.string().trim().max(30).regex(/^[\d\s()+-]*$/, 'Telefone inválido'),
  company: z.string().trim().max(120),
}).strict()

export default function Account() {
  const { user, profile, refresh, signOut } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', phone: '', company: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [pwd, setPwd] = useState({ next: '', confirm: '' })
  const [savingPwd, setSavingPwd] = useState(false)

  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name ?? '', phone: profile.phone ?? '', company: profile.company ?? '' })
    if (user?.email) setEmail(user.email)
  }, [profile, user])

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    const parsed = ProfileSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setErrors({}); setSaving(true)
    // Somente colunas permitidas (o banco também restringe via GRANT)
    const { error } = await supabase.from('profiles').update({
      full_name: parsed.data.full_name, phone: parsed.data.phone || null, company: parsed.data.company || null,
    }).eq('id', user!.id)
    setSaving(false)
    if (error) { toast.error(errorMessage(error)); return }
    toast.success('Dados atualizados')
    await refresh()
  }

  const saveEmail = async (e: FormEvent) => {
    e.preventDefault()
    if (!z.email().safeParse(email).success) { toast.error('Informe um e-mail válido.'); return }
    if (email === user?.email) return
    setSavingEmail(true)
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${window.location.origin}/app/conta` })
    setSavingEmail(false)
    if (error) toast.error(errorMessage(error))
    else toast.success('Confirme a alteração', { description: 'Enviamos um link de confirmação para o novo e-mail.' })
  }

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (pwd.next.length < 8) { toast.error('A senha precisa ter pelo menos 8 caracteres.'); return }
    if (pwd.next !== pwd.confirm) { toast.error('As senhas não coincidem.'); return }
    setSavingPwd(true)
    const { error } = await supabase.auth.updateUser({ password: pwd.next })
    setSavingPwd(false)
    if (error) { toast.error(errorMessage(error)); return }
    setPwd({ next: '', confirm: '' })
    toast.success('Senha alterada com sucesso')
  }

  return (
    <div>
      <PageHeader eyebrow="Conta" title="Minha conta" description={profile ? `Cliente desde ${formatDate(profile.created_at)}` : undefined} />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <form onSubmit={saveProfile} className="card p-5 sm:p-6" noValidate>
          <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-fg"><UserRound className="h-4 w-4 text-accent" />Informações pessoais</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Nome completo" value={form.full_name} error={errors.full_name} autoComplete="name"
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <Input label="Telefone / WhatsApp" value={form.phone} error={errors.phone} autoComplete="tel" inputMode="tel"
              onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" />
            <Input label="Empresa / loja" value={form.company} error={errors.company} autoComplete="organization"
              onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Opcional" />
          </div>
          <div className="mt-6 flex justify-end"><Button type="submit" loading={saving}>Salvar alterações</Button></div>
        </form>

        <div className="space-y-5">
          <form onSubmit={saveEmail} className="card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg"><Mail className="h-4 w-4 text-accent" />E-mail de acesso</h2>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label="E-mail" />
            <Button type="submit" variant="secondary" className="mt-3 w-full" loading={savingEmail} disabled={email === user?.email}>Alterar e-mail</Button>
          </form>

          <form onSubmit={savePassword} className="card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg"><KeyRound className="h-4 w-4 text-accent" />Alterar senha</h2>
            <div className="space-y-3">
              <Input type="password" placeholder="Nova senha (mín. 8 caracteres)" value={pwd.next} autoComplete="new-password" aria-label="Nova senha"
                onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
              <Input type="password" placeholder="Confirmar nova senha" value={pwd.confirm} autoComplete="new-password" aria-label="Confirmar nova senha"
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
            </div>
            <Button type="submit" variant="secondary" className="mt-3 w-full" loading={savingPwd}>Atualizar senha</Button>
          </form>

          <Button variant="ghost" className="w-full" icon={<LogOut className="h-4 w-4" />}
            onClick={async () => { await signOut(); navigate('/') }}>Sair da conta</Button>
        </div>
      </div>
    </div>
  )
}

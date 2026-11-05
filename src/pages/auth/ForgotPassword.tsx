import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Mail, MailCheck } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { AuthHeader, NotConfiguredNotice } from './shared'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    // A resposta é sempre a mesma para não revelar se o e-mail tem cadastro
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
    setLoading(false)
    setSent(true)
  }

  if (sent) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-fx-lg bg-accent/10 text-accent"><MailCheck className="h-6 w-6" /></div>
        <h1 className="mt-6 text-2xl font-extrabold text-fg">Verifique seu e-mail</h1>
        <p className="mt-3 text-sm text-muted">
          Se houver uma conta associada a esse endereço, você receberá um link para criar uma nova senha em alguns minutos.
        </p>
        <Link to="/entrar" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">
          <ArrowLeft className="h-4 w-4" /> Voltar ao login
        </Link>
      </motion.div>
    )
  }

  return (
    <>
      <AuthHeader title="Recuperar senha" subtitle="Informe seu e-mail e enviaremos um link para redefinir sua senha." />
      <NotConfiguredNotice />
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="E-mail" type="email" autoComplete="email" required icon={<Mail />} value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" />
        <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!isSupabaseConfigured || !email}>Enviar link</Button>
      </form>
      <Link to="/entrar" className="mt-8 inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Voltar ao login
      </Link>
    </>
  )
}

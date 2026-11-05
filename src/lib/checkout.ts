import { supabase } from './supabase'
import { callFunction, FunctionError } from './api'
import type { Plan } from '@/types/db'

export type CheckoutResult =
  | { kind: 'activated' }                       // plano gratuito ativado
  | { kind: 'redirect'; url: string }           // enviar para o gateway
  | { kind: 'error'; code: string; message: string }

/**
 * Inicia a contratação de um plano.
 * - Gratuito: RPC activate_free_plan (no banco, security definer).
 * - Pago: Edge Function create-checkout. O PREÇO é lido do banco no servidor;
 *   o navegador só envia o slug do plano.
 */
export async function startCheckout(plan: Pick<Plan, 'slug' | 'interval'>): Promise<CheckoutResult> {
  if (plan.interval === 'free') {
    const { error } = await supabase.rpc('activate_free_plan')
    if (error) return { kind: 'error', code: error.message, message: error.message }
    return { kind: 'activated' }
  }
  try {
    const res = await callFunction<{ init_point: string }>('create-checkout', { plan_slug: plan.slug })
    const url = new URL(res.init_point)
    if (url.protocol !== 'https:') throw new FunctionError('invalid_redirect', 'URL de pagamento inválida.')
    return { kind: 'redirect', url: url.toString() }
  } catch (e) {
    const err = e as FunctionError
    const messages: Record<string, string> = {
      gateway_not_configured: 'O pagamento online ainda não foi ativado. Fale com o suporte para contratar.',
      function_unavailable: 'O pagamento online ainda não foi ativado. Fale com o suporte para contratar.',
      already_subscribed: 'Você já possui uma assinatura ativa.',
      invalid_plan: 'Plano indisponível.',
    }
    return { kind: 'error', code: err.code ?? 'unknown', message: messages[err.code] ?? err.message }
  }
}

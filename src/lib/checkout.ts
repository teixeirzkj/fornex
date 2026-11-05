import { supabase } from './supabase'
import type { Plan } from '@/types/db'

export type CheckoutResult =
  | { kind: 'activated' }                       // plano gratuito ativado
  | { kind: 'redirect'; url: string }           // enviar para o gateway
  | { kind: 'route'; to: string }               // checkout transparente dentro do site
  | { kind: 'error'; code: string; message: string }

/**
 * Inicia a contratação de um plano.
 * - Gratuito: RPC activate_free_plan (no banco, security definer).
 * - Pago: tela de checkout transparente (Mercado Pago Bricks) em /app/checkout/:slug.
 *   O preço é definido no servidor (process-payment), nunca no navegador.
 */
export async function startCheckout(plan: Pick<Plan, 'slug' | 'interval'>): Promise<CheckoutResult> {
  if (plan.interval === 'free') {
    const { error } = await supabase.rpc('activate_free_plan')
    if (error) return { kind: 'error', code: error.message, message: error.message }
    return { kind: 'activated' }
  }
  // Checkout Transparente: o pagamento acontece dentro do site (/app/checkout/:slug)
  return { kind: 'route', to: `/app/checkout/${plan.slug}` }
}

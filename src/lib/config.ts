export const BRAND = {
  name: 'FORNEX',
  tagline: 'Seu acesso a novos fornecedores.',
  institutional: 'Conectando empresas aos melhores fornecedores.',
  supportEmail: (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || '',
  supportWhatsapp: (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) || '',
}

export const BR_STATES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const

/**
 * Public Key do Mercado Pago (Checkout Transparente / Bricks).
 * É uma chave PÚBLICA por definição — feita para ficar no navegador.
 * O Access Token (secreto) fica só nas secrets do Supabase.
 */
export const MP_PUBLIC_KEY =
  (import.meta.env.VITE_MP_PUBLIC_KEY as string | undefined) || 'APP_USR-c2509f4c-d6c2-42af-8b17-6d6283bf8b6c'

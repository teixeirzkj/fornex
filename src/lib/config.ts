export const BRAND = {
  name: 'FORNEX',
  tagline: 'Seu acesso a novos fornecedores.',
  institutional: 'Conectando empresas aos melhores fornecedores.',
  supportEmail: (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || '',
  supportWhatsapp: (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) || '',
}

export const BR_STATES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const

import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Logo oficial FORNEX (brand kit — logos/fornex-horizontal-*.svg).
 * Renderizado inline com os mesmos vetores para que o lettering use a
 * fonte Manrope carregada pela página. Não alterar proporções.
 */
export function Logo({ variant = 'dark', className, symbolOnly = false }: {
  variant?: 'dark' | 'light' | 'white'
  className?: string
  symbolOnly?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const white = variant === 'white'
  const stroke = white ? '#FFFFFF' : `url(#fx-g-${id})`
  const textFill = variant === 'light' ? '#080F1D' : '#FFFFFF'
  const symbol = (
    <>
      <defs>
        <linearGradient id={`fx-g-${id}`} x1="18" y1="12" x2="108" y2="112" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" />
          <stop offset="1" stopColor="#155EEF" />
        </linearGradient>
      </defs>
      <path d="M37 100V28H99" fill="none" stroke={stroke} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37 63H82" fill="none" stroke={stroke} strokeWidth="13" strokeLinecap="round" />
      <circle cx="99" cy="28" r="8" fill={white ? '#FFFFFF' : '#93C5FD'} />
      <circle cx="82" cy="63" r="6" fill={white ? '#FFFFFF' : '#3B82F6'} />
    </>
  )

  if (symbolOnly) {
    return (
      <svg viewBox="0 0 128 128" role="img" aria-label="FORNEX" className={cn('h-8 w-8', className)}>{symbol}</svg>
    )
  }
  return (
    <svg viewBox="0 0 440 112" role="img" aria-label="FORNEX" className={cn('h-8 w-auto', className)}>
      <g transform="translate(4 4) scale(.82)">{symbol}</g>
      <text x="112" y="72" fill={textFill} fontFamily="Manrope, Inter, Arial, sans-serif" fontSize="54" fontWeight="800" letterSpacing="1.5">FORNEX</text>
    </svg>
  )
}

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-fx-md font-medium transition duration-300 ease-fx active:scale-[.98] disabled:pointer-events-none disabled:opacity-55'

const variants: Record<Variant, string> = {
  primary: 'bg-fornex-electric text-white shadow-cta hover:bg-fornex-electric-hover',
  secondary: 'border border-line bg-transparent text-fg hover:border-accent/50 hover:bg-surface-2/60',
  ghost: 'text-muted hover:bg-surface-2/70 hover:text-fg',
  subtle: 'bg-accent/10 text-accent hover:bg-accent/15',
  danger: 'bg-fornex-danger/90 text-white hover:bg-fornex-danger',
}
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
  icon: 'h-10 w-10',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, icon, children, disabled, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export function ButtonLink({ variant = 'primary', size = 'md', className, icon, children, ...props }:
  LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {icon}{children}
    </Link>
  )
}

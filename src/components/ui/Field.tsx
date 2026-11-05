import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Common { label?: string; hint?: string; error?: string | null; icon?: ReactNode }

function Wrapper({ id, label, hint, error, children }: Common & { id: string; children: ReactNode }) {
  return (
    <div>
      {label && <label htmlFor={id} className="label">{label}</label>}
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-400" role="alert">{error}</p>
        : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Common>(
  ({ label, hint, error, icon, className, id, type, ...props }, ref) => {
    const auto = useId()
    const fid = id ?? auto
    const [show, setShow] = useState(false)
    const isPwd = type === 'password'
    return (
      <Wrapper id={fid} label={label} hint={hint} error={error}>
        <div className="relative">
          {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
          <input ref={ref} id={fid} type={isPwd && show ? 'text' : type} aria-invalid={!!error}
            className={cn('field', icon && 'pl-9', isPwd && 'pr-10', error && 'border-red-500/60', className)} {...props} />
          {isPwd && (
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-fg">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      </Wrapper>
    )
  },
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Common>(
  ({ label, hint, error, className, id, rows = 4, ...props }, ref) => {
    const auto = useId()
    const fid = id ?? auto
    return (
      <Wrapper id={fid} label={label} hint={hint} error={error}>
        <textarea ref={ref} id={fid} rows={rows} className={cn('field resize-y', className)} {...props} />
      </Wrapper>
    )
  },
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Common>(
  ({ label, hint, error, className, id, children, ...props }, ref) => {
    const auto = useId()
    const fid = id ?? auto
    return (
      <Wrapper id={fid} label={label} hint={hint} error={error}>
        <select ref={ref} id={fid} className={cn('field appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)}
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
          {...props}>
          {children}
        </select>
      </Wrapper>
    )
  },
)
Select.displayName = 'Select'

export function Switch({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-fx-md border border-line bg-bg/40 p-3.5">
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-fornex-electric' : 'bg-line')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ease-fx', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

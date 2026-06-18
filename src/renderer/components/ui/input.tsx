import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm transition-colors',
      'placeholder:text-muted-foreground focus-visible:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }

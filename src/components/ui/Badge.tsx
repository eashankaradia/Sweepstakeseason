'use client'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'muted'

interface BadgeProps {
  variant?: BadgeVariant
  className?: string
  children: React.ReactNode
}

const variants: Record<BadgeVariant, string> = {
  default:  'bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30',
  success:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  danger:   'bg-red-500/15 text-red-400 border-red-500/30',
  info:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  purple:   'bg-purple-500/15 text-purple-400 border-purple-500/30',
  muted:    'bg-[var(--border)] text-[var(--text-secondary)] border-transparent',
}

export function Badge({ variant = 'default', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

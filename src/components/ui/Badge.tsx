'use client'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'muted' | 'live' | 'green'

interface BadgeProps {
  variant?: BadgeVariant
  className?: string
  children: React.ReactNode
}

const variants: Record<BadgeVariant, string> = {
  default:  'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/30',
  success:  'bg-[var(--green-subtle)] text-[var(--green)] border-[var(--green)]/30',
  green:    'bg-[var(--green-subtle)] text-[var(--green)] border-[var(--green)]/30',
  warning:  'bg-[var(--amber-subtle)] text-[var(--amber)] border-[var(--amber)]/30',
  danger:   'bg-[var(--red-subtle)] text-[var(--red)] border-[var(--red)]/30',
  live:     'bg-[var(--red-subtle)] text-[var(--red)] border-[var(--red)]/30',
  info:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  purple:   'bg-[var(--purple-subtle)] text-[var(--purple)] border-[var(--purple)]/30',
  muted:    'bg-[var(--border)] text-[var(--text-secondary)] border-transparent',
}

export function Badge({ variant = 'default', className, children }: BadgeProps) {
  const isLive = variant === 'live'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border',
        variants[variant],
        className
      )}
    >
      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)] animate-pulse" />}
      {children}
    </span>
  )
}

'use client'
import { cn } from '@/lib/utils'

interface CardProps {
  className?: string
  children: React.ReactNode
  onClick?: () => void
}

export function Card({ className, children, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        'bg-[var(--bg-card)] border-[var(--border)]',
        onClick && 'cursor-pointer hover:bg-[var(--bg-card-hover)] active:scale-[0.99]',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mb-3', className)}>{children}</div>
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h3 className={cn('font-semibold text-[var(--text-primary)] text-sm', className)}>
      {children}
    </h3>
  )
}

export function CardDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn('text-xs text-[var(--text-secondary)] mt-0.5', className)}>
      {children}
    </p>
  )
}

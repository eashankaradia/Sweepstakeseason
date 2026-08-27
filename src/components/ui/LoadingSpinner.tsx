'use client'
import { cn } from '@/lib/utils'

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)}>
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 rounded-full border-2 border-[var(--border)]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--accent)] animate-spin" />
      </div>
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="min-h-[60dvh] flex items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <h3 className="font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text-secondary)] max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = "Couldn't load this",
  description = 'Something went wrong reaching the server. Check your connection and try again.',
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="text-4xl mb-3">⚠️</div>
      <h3 className="font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 min-h-11 px-4 rounded-lg bg-[var(--accent)] text-white text-sm font-medium pressable"
        >
          Try again
        </button>
      )}
    </div>
  )
}

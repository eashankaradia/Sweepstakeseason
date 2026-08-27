'use client'
import { cn } from '@/lib/utils'

interface FilterChipProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}

export function FilterChip({ active, onClick, children, className }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 px-3 min-h-9 rounded-full text-xs font-medium border transition-colors pressable',
        active
          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
          : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/60 hover:text-[var(--text-primary)]',
        className
      )}
    >
      {children}
    </button>
  )
}

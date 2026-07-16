'use client'
import { cn } from '@/lib/utils'

interface StatTileProps {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
  className?: string
}

export function StatTile({ label, value, sub, accent, className }: StatTileProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl p-3 border',
        accent
          ? 'bg-[var(--accent-subtle)] border-[var(--accent)]/30'
          : 'bg-[var(--bg-card)] border-[var(--border)]',
        className
      )}
    >
      <span className={cn('text-xl font-black leading-none', accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]')}>
        {value}
      </span>
      {sub && (
        <span className="text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</span>
      )}
      <span className="label-caps mt-1">{label}</span>
    </div>
  )
}

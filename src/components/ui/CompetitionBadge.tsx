'use client'
import { cn } from '@/lib/utils'

type CompetitionType = 'league' | 'cup' | 'european' | 'domestic_cup' | string | null | undefined

interface CompetitionBadgeProps {
  name?: string | null
  shortName?: string | null
  type?: CompetitionType
  className?: string
  size?: 'xs' | 'sm'
}

function getVariantClasses(type: CompetitionType) {
  if (type === 'european') return 'bg-[var(--purple-subtle)] text-[var(--purple)] border-[var(--purple)]/30'
  if (type === 'domestic_cup' || type === 'cup') return 'bg-[var(--amber-subtle)] text-[var(--amber)] border-[var(--amber)]/30'
  return 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/30'
}

export function CompetitionBadge({ name, shortName, type, className, size = 'xs' }: CompetitionBadgeProps) {
  const display = shortName || name || '?'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border font-semibold tracking-wide uppercase leading-none',
        size === 'xs' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5',
        getVariantClasses(type),
        className
      )}
    >
      {display}
    </span>
  )
}

'use client'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  title: string
  action?: React.ReactNode
  className?: string
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-2', className)}>
      <span className="label-caps">{title}</span>
      {action && <div className="text-xs text-[var(--accent)]">{action}</div>}
    </div>
  )
}

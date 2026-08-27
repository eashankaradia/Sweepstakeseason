'use client'
import { cn } from '@/lib/utils'

interface Tab {
  key: string
  label: string
}

interface TabBarProps {
  tabs: Tab[]
  active: string
  onChange: (key: string) => void
  className?: string
}

export function TabBar({ tabs, active, onChange, className }: TabBarProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-1 gap-1',
        className
      )}
    >
      {tabs.map(tab => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'flex-1 min-h-11 rounded-lg px-3 text-xs font-medium transition-all',
            active === tab.key
              ? 'bg-[var(--accent)] text-white shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

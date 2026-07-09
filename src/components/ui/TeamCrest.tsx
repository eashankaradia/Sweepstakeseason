'use client'
import { cn } from '@/lib/utils'
import type { Team } from '@/lib/supabase/types'

interface TeamCrestProps {
  team: Pick<Team, 'name' | 'short_name' | 'primary_color' | 'secondary_color'>
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-sm',
}

export function TeamCrest({ team, size = 'md', className }: TeamCrestProps) {
  const initials = (team.short_name || team.name).slice(0, 3).toUpperCase()
  return (
    <div
      className={cn(
        'rounded-lg flex items-center justify-center font-bold shrink-0',
        sizes[size],
        className
      )}
      style={{
        backgroundColor: team.primary_color,
        color: team.secondary_color,
      }}
    >
      {initials}
    </div>
  )
}

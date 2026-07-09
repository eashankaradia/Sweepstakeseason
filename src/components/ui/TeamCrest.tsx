'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Team } from '@/lib/supabase/types'

interface TeamCrestProps {
  team: Pick<Team, 'name' | 'short_name' | 'primary_color' | 'secondary_color'> & { logo_url?: string | null }
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-sm',
}

const imgSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
}

export function TeamCrest({ team, size = 'md', className }: TeamCrestProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const initials = (team.short_name || team.name).slice(0, 3).toUpperCase()
  const showLogo = !!team.logo_url && !imgFailed
  const px = imgSizes[size]

  return (
    <div
      className={cn(
        'rounded-lg flex items-center justify-center font-bold shrink-0 overflow-hidden',
        sizes[size],
        className
      )}
      style={showLogo ? { backgroundColor: 'transparent' } : { backgroundColor: team.primary_color, color: team.secondary_color }}
    >
      {showLogo ? (
        <img
          src={team.logo_url!}
          alt={team.name}
          width={px}
          height={px}
          className="object-contain w-full h-full p-0.5"
          onError={() => setImgFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  )
}

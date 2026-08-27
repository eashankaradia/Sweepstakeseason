'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Team } from '@/lib/supabase/types'

interface TeamCrestProps {
  team: Pick<Team, 'name' | 'short_name' | 'primary_color' | 'secondary_color'> & { logo_url?: string | null }
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-sm',
  xl: 'w-16 h-16 text-base',
}

const imgSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 64,
}

const FALLBACK_LOGOS: Record<string, string> = {
  'Como': 'https://commons.wikimedia.org/wiki/Special:FilePath/Logo_Como_1907_-_2019.svg',
  'SV Elversberg': 'https://commons.wikimedia.org/wiki/Special:FilePath/SV_Elversberg_Logo.svg',
}

export function TeamCrest({ team, size = 'md', className }: TeamCrestProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const initials = (team.short_name || team.name).slice(0, 3).toUpperCase()
  const logoUrl = team.logo_url || FALLBACK_LOGOS[team.name]
  const showLogo = !!logoUrl && !imgFailed
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
          src={logoUrl!}
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

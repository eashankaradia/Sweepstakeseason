import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export const PLAYER_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#6366F1', '#84CC16', '#06B6D4', '#A855F7',
]

export const COMPETITION_BADGES: Record<string, { label: string; color: string }> = {
  'Premier League':        { label: 'PL',  color: '#3D0066' },
  'La Liga':               { label: 'LL',  color: '#D4B136' },
  'Bundesliga':            { label: 'BL',  color: '#D20515' },
  'Serie A':               { label: 'SA',  color: '#1E3C72' },
  'Champions League':      { label: 'UCL', color: '#1A3A6E' },
  'Europa League':         { label: 'UEL', color: '#F97316' },
  'Conference League':     { label: 'ECL', color: '#16A34A' },
}

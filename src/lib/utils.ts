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

type MonthlyShareRow = {
  player_name: string
  monthly_points: number
  monthly_wins: number
  monthly_draws: number
  monthly_losses: number
}

const MEDALS = ['🥇', '🥈', '🥉']

/**
 * Builds a WhatsApp-friendly text summary of one month's standings and opens
 * wa.me with it pre-filled, letting the sender pick a contact/group. wa.me
 * works whether or not the recipient has the app installed (falls back to
 * WhatsApp Web), and needs no API key or backend.
 */
export function shareMonthlyTableToWhatsApp({
  leagueName,
  month,
  rows,
  publicUrl,
}: {
  leagueName: string
  month: string
  rows: MonthlyShareRow[]
  publicUrl?: string
}) {
  const [y, m] = month.split('-')
  const monthLabel = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const lines = [
    `🏆 ${leagueName} — ${monthLabel}`,
    '',
    ...rows.map((r, i) =>
      `${MEDALS[i] ?? `${i + 1}.`} ${r.player_name} — ${r.monthly_points}pts (${r.monthly_wins}W ${r.monthly_draws}D ${r.monthly_losses}L)`
    ),
  ]
  if (publicUrl) {
    lines.push('', `📊 Full table: ${publicUrl}`)
  }

  const text = encodeURIComponent(lines.join('\n'))
  window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
}

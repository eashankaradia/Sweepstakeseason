'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

const EVENT_ICONS: Record<string, string> = {
  full_time: '⚽',
  giant_killer: '🗡️',
  double_or_nothing: '🎲',
  reverse: '🔄',
  position_change: '📈',
  points_earned: '⭐',
  qualification: '🏆',
  elimination: '❌',
  default: '📢',
}

export default function ActivityPage() {
  const [events, setEvents] = useState<any[]>([])
  const [players, setPlayers] = useState<Map<string, any>>(new Map())
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const [{ data: feed }, { data: playerList }] = await Promise.all([
      supabase.from('activity_feed')
        .select('*')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('players')
        .select('id, name, color')
        .eq('league_id', leagueId),
    ])

    const pMap = new Map((playerList ?? []).map((p: any) => [p.id, p]))
    setPlayers(pMap)
    setEvents(feed ?? [])
    setLoading(false)
  }

  if (loading) return <AppShell title="Activity"><PageLoader /></AppShell>

  return (
    <AppShell title="Activity">
      {events.length === 0 ? (
        <EmptyState
          icon="📢"
          title="No activity yet"
          description="Match results and power-up events will appear here throughout the season."
        />
      ) : (
        <div className="space-y-0">
          {events.map((event, i) => {
            const player = event.player_id ? players.get(event.player_id) : null
            const icon = EVENT_ICONS[event.event_type] ?? EVENT_ICONS.default
            const isPositive = (event.points_delta ?? 0) > 0
            const isNegative = (event.points_delta ?? 0) < 0
            const timeStr = formatRelativeTime(event.created_at)

            return (
              <div
                key={event.id}
                className={[
                  'flex items-start gap-3 py-3 px-0',
                  i < events.length - 1 ? 'border-b border-[var(--border)]' : '',
                ].join(' ')}
              >
                {/* Icon / avatar */}
                <div className="shrink-0 w-8 h-8 mt-0.5">
                  {player ? (
                    <Avatar name={player.name} color={player.color} size="sm" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[var(--border)] flex items-center justify-center text-base">
                      {icon}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text-primary)] leading-snug font-medium">{event.title}</p>
                  {event.body && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">{event.body}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[var(--text-muted)]">{timeStr}</span>
                    {event.fixture_id && (
                      <Link href={`/fixtures/${event.fixture_id}`}>
                        <span className="text-[10px] text-[var(--accent)] hover:underline">View match →</span>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Points delta */}
                {event.points_delta != null && event.points_delta !== 0 && (
                  <div className={`shrink-0 text-sm font-bold ${isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                    {isPositive ? '+' : ''}{event.points_delta}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

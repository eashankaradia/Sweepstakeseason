'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

const EVENT_META: Record<string, { icon: string; color: string; label: string }> = {
  full_time: { icon: '⚽', color: 'text-[var(--text-primary)]', label: 'Result' },
  giant_killer: { icon: '⚔️', color: 'text-amber-400', label: 'Giant Killer' },
  double_or_nothing: { icon: '🎲', color: 'text-[var(--accent)]', label: 'Double or Nothing' },
  reverse: { icon: '🔄', color: 'text-purple-400', label: 'Reverse' },
  position_change: { icon: '📈', color: 'text-emerald-400', label: 'Position Change' },
  points_earned: { icon: '⭐', color: 'text-amber-400', label: 'Points' },
  qualification: { icon: '🏆', color: 'text-amber-400', label: 'Qualification' },
  elimination: { icon: '❌', color: 'text-red-400', label: 'Eliminated' },
  default: { icon: '📢', color: 'text-[var(--text-secondary)]', label: 'Update' },
}

type EventGroup = {
  label: string
  events: any[]
}

export default function ActivityPage() {
  const [groups, setGroups] = useState<EventGroup[]>([])
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
        .limit(150),
      supabase.from('players')
        .select('id, name, color')
        .eq('league_id', leagueId),
    ])

    const pMap = new Map((playerList ?? []).map((p: any) => [p.id, p]))
    setPlayers(pMap)

    // Group events by date
    const grouped = new Map<string, any[]>()
    for (const event of (feed ?? [])) {
      const label = groupLabel(event.created_at)
      if (!grouped.has(label)) grouped.set(label, [])
      grouped.get(label)!.push(event)
    }
    setGroups([...grouped.entries()].map(([label, events]) => ({ label, events })))
    setLoading(false)
  }

  if (loading) return <AppShell title="Activity"><PageLoader /></AppShell>

  const totalEvents = groups.reduce((sum, g) => sum + g.events.length, 0)

  return (
    <AppShell title="Activity">
      {totalEvents === 0 ? (
        <EmptyState
          icon="📢"
          title="No activity yet"
          description="Match results and power-up events will appear here throughout the season."
        />
      ) : (
        <div className="space-y-5">
          {groups.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">
                {group.label}
              </p>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                {group.events.map((event, i) => {
                  const player = event.player_id ? players.get(event.player_id) : null
                  const meta = EVENT_META[event.event_type] ?? EVENT_META.default
                  const isPositive = (event.points_delta ?? 0) > 0
                  const isNegative = (event.points_delta ?? 0) < 0

                  return (
                    <div
                      key={event.id}
                      className={[
                        'flex items-start gap-3 px-3 py-3',
                        i < group.events.length - 1 ? 'border-b border-[var(--border)]' : '',
                      ].join(' ')}
                    >
                      {/* Icon / avatar */}
                      <div className="shrink-0 w-8 h-8 mt-0.5">
                        {player ? (
                          <Avatar name={player.name} color={player.color} size="sm" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[var(--border)] flex items-center justify-center text-base">
                            {meta.icon}
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Event type badge for special events */}
                        {event.event_type !== 'full_time' && event.event_type !== 'points_earned' && (
                          <div className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide mb-0.5 ${meta.color}`}>
                            <span>{meta.icon}</span>
                            <span>{meta.label}</span>
                          </div>
                        )}
                        <p className="text-sm text-[var(--text-primary)] leading-snug font-medium">{event.title}</p>
                        {event.body && (
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">{event.body}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {formatTime(event.created_at)}
                          </span>
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
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}

function groupLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const eventDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (eventDay.getTime() === today.getTime()) return 'Today'
  if (eventDay.getTime() === yesterday.getTime()) return 'Yesterday'

  const diff = Math.floor((today.getTime() - eventDay.getTime()) / 86400000)
  if (diff < 7) return date.toLocaleDateString('en-GB', { weekday: 'long' })
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

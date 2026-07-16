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

const REACTIONS = [
  { type: 'fire', emoji: '🔥' },
  { type: 'laugh', emoji: '😂' },
  { type: 'applause', emoji: '👏' },
  { type: 'unlucky', emoji: '💀' },
]

type Filter = 'all' | 'mine' | 'powerups'

type EventGroup = {
  label: string
  events: any[]
}

export default function ActivityPage() {
  const [groups, setGroups] = useState<EventGroup[]>([])
  const [players, setPlayers] = useState<Map<string, any>>(new Map())
  const [reactions, setReactions] = useState<Map<string, any[]>>(new Map())
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [reactingTo, setReactingTo] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id

    const [{ data: feed }, { data: playerList }, { data: rxns }] = await Promise.all([
      supabase.from('activity_feed')
        .select('*')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false })
        .limit(150),
      supabase.from('players')
        .select('id, name, color, user_id')
        .eq('league_id', leagueId),
      supabase.from('activity_reactions')
        .select('*')
        .eq('league_id', leagueId),
    ])

    const pMap = new Map((playerList ?? []).map((p: any) => [p.id, p]))
    setPlayers(pMap)

    const myPlayer = uid ? (playerList ?? []).find((p: any) => p.user_id === uid) : null
    setMyPlayerId(myPlayer?.id ?? null)

    // Reactions map: event_id → reactions[]
    const rMap = new Map<string, any[]>()
    for (const r of (rxns ?? [])) {
      if (!rMap.has(r.event_id)) rMap.set(r.event_id, [])
      rMap.get(r.event_id)!.push(r)
    }
    setReactions(rMap)

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

  async function toggleReaction(eventId: string, reactionType: string, leagueId: string) {
    if (!myPlayerId || reactingTo) return
    setReactingTo(eventId)

    const existing = (reactions.get(eventId) ?? []).find(r => r.player_id === myPlayerId)

    if (existing) {
      if (existing.reaction_type === reactionType) {
        // Remove reaction
        await supabase.from('activity_reactions').delete().eq('id', existing.id)
        setReactions(prev => {
          const next = new Map(prev)
          next.set(eventId, (next.get(eventId) ?? []).filter(r => r.id !== existing.id))
          return next
        })
      } else {
        // Change reaction
        const { data: updated } = await supabase
          .from('activity_reactions')
          .update({ reaction_type: reactionType })
          .eq('id', existing.id)
          .select()
          .single()
        if (updated) {
          setReactions(prev => {
            const next = new Map(prev)
            next.set(eventId, (next.get(eventId) ?? []).map(r => r.id === existing.id ? updated : r))
            return next
          })
        }
      }
    } else {
      // Add reaction
      const { data: inserted } = await supabase
        .from('activity_reactions')
        .insert({ league_id: leagueId, event_id: eventId, player_id: myPlayerId, reaction_type: reactionType })
        .select()
        .single()
      if (inserted) {
        setReactions(prev => {
          const next = new Map(prev)
          next.set(eventId, [...(next.get(eventId) ?? []), inserted])
          return next
        })
      }
    }

    setReactingTo(null)
  }

  if (loading) return <AppShell title="Activity"><PageLoader /></AppShell>

  const leagueId = getLeagueIdCookie() ?? ''

  // Apply filter across all groups
  const filteredGroups = groups
    .map(g => ({
      ...g,
      events: g.events.filter(e => {
        if (filter === 'mine') return e.player_id === myPlayerId || e.team_id != null
        if (filter === 'powerups') return ['giant_killer', 'double_or_nothing', 'reverse'].includes(e.event_type)
        return true
      }),
    }))
    .filter(g => g.events.length > 0)

  const totalEvents = filteredGroups.reduce((sum, g) => sum + g.events.length, 0)

  return (
    <AppShell title="Activity">
      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-none -mx-4 px-4">
        {([
          { key: 'all', label: 'All' },
          { key: 'mine', label: 'Mine' },
          { key: 'powerups', label: 'Power-ups' },
        ] as { key: Filter; label: string }[]).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === f.key
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {totalEvents === 0 ? (
        <EmptyState
          icon="📢"
          title="No activity yet"
          description="Match results and power-up events will appear here throughout the season."
        />
      ) : (
        <div className="space-y-5">
          {filteredGroups.map(group => (
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
                  const eventReactions = reactions.get(event.id) ?? []
                  const myReaction = myPlayerId ? eventReactions.find(r => r.player_id === myPlayerId) : null

                  return (
                    <div
                      key={event.id}
                      className={[
                        'px-3 pt-3 pb-2',
                        i < group.events.length - 1 ? 'border-b border-[var(--border)]' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-start gap-3">
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

                      {/* Reactions row */}
                      <div className="flex items-center gap-1.5 mt-2 ml-11">
                        {REACTIONS.map(r => {
                          const count = eventReactions.filter(rx => rx.reaction_type === r.type).length
                          const isMine = myReaction?.reaction_type === r.type
                          return (
                            <button
                              key={r.type}
                              onClick={() => myPlayerId && toggleReaction(event.id, r.type, leagueId)}
                              disabled={!myPlayerId || reactingTo === event.id}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-all ${
                                isMine
                                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/50 text-[var(--accent)]'
                                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40'
                              } ${!myPlayerId ? 'opacity-40 cursor-default' : ''}`}
                            >
                              <span>{r.emoji}</span>
                              {count > 0 && <span className="font-semibold">{count}</span>}
                            </button>
                          )
                        })}
                      </div>
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

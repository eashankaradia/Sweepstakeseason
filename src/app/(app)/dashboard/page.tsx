'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

export default function DashboardPage() {
  const [league, setLeague] = useState<any>(null)
  const [standings, setStandings] = useState<any[]>([])
  const [liveFixtures, setLiveFixtures] = useState<any[]>([])
  const [todayFixtures, setTodayFixtures] = useState<any[]>([])
  const [recentResults, setRecentResults] = useState<any[]>([])
  const [activityFeed, setActivityFeed] = useState<any[]>([])
  const [ownerMap, setOwnerMap] = useState<Map<string, any>>(new Map())
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const supabase = createClient()

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); setRefreshing(false); return }

    const [{ data: lg }, { data: authData }] = await Promise.all([
      supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle(),
      supabase.auth.getUser(),
    ])
    setLeague(lg)
    setMyUserId(authData?.user?.id ?? null)
    if (!lg) { setLoading(false); setRefreshing(false); return }

    const today = new Date()
    const todayStr = today.toISOString().substring(0, 10)
    const weekEnd = new Date(today.getTime() + 7 * 86400000).toISOString()

    const [
      { data: players },
      { data: playerScores },
      { data: assignments },
      { data: live },
      { data: todayFix },
      { data: recent },
      { data: feed },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_scores').select('*').eq('league_id', lg.id),
      supabase.from('player_team_assignments').select('team_id, player_id, players(id,name,color)').eq('league_id', lg.id),
      supabase.from('fixtures')
        .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', lg.id)
        .eq('status', 'live'),
      supabase.from('fixtures')
        .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', lg.id)
        .eq('status', 'scheduled')
        .gte('kickoff_time', `${todayStr}T00:00:00`)
        .lte('kickoff_time', `${todayStr}T23:59:59`)
        .order('kickoff_time'),
      supabase.from('fixtures')
        .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', lg.id)
        .eq('status', 'completed')
        .order('kickoff_time', { ascending: false })
        .limit(6),
      supabase.from('activity_feed')
        .select('*')
        .eq('league_id', lg.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    // Build owner map: team_id → player
    const oMap = new Map<string, any>()
    for (const a of (assignments ?? []) as any[]) {
      if (a.players && a.team_id) oMap.set(a.team_id, a.players)
    }
    setOwnerMap(oMap)

    // Build standings
    const rows = (players ?? []).map((p: any) => {
      const score = (playerScores ?? []).find((s: any) => s.player_id === p.id)
      const myTeams = (assignments ?? []).filter((a: any) => a.player_id === p.id)
      return {
        player: p,
        totalPoints: score?.total_points ?? 0,
        wins: score?.wins ?? 0,
        draws: score?.draws ?? 0,
        losses: score?.losses ?? 0,
        played: score?.matches_played ?? 0,
        bonusPoints: score?.bonus_points ?? 0,
        teamCount: myTeams.length,
      }
    }).sort((a: any, b: any) => b.totalPoints - a.totalPoints)

    setStandings(rows)
    setLiveFixtures((live ?? []) as any[])
    setTodayFixtures((todayFix ?? []) as any[])
    setRecentResults((recent ?? []) as any[])
    setActivityFeed((feed ?? []) as any[])
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 60s when there are live matches
  useEffect(() => {
    if (liveFixtures.length === 0) return
    const id = setInterval(() => load(true), 60000)
    return () => clearInterval(id)
  }, [liveFixtures.length, load])

  if (loading) return <AppShell><PageLoader /></AppShell>

  if (!league) {
    return (
      <AppShell>
        <EmptyState
          icon="🏆"
          title="No league set up"
          description="Create a league in settings to get started."
          action={
            <Link href="/settings/league" className="text-[var(--accent)] text-sm font-medium hover:underline">
              Create a league →
            </Link>
          }
        />
      </AppShell>
    )
  }

  const myEntry = myUserId ? standings.find((s: any) => s.player.user_id === myUserId) : null
  const myPos = myEntry ? standings.indexOf(myEntry) + 1 : null
  const leader = standings[0]
  const hasDraft = standings.some((s: any) => s.teamCount > 0)

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="font-black text-xl text-[var(--text-primary)] leading-tight">{league.name}</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">{league.season}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {refreshing && <span className="text-[10px] text-[var(--accent)]">↻</span>}
          <Badge variant={league.status === 'active' ? 'success' : 'warning'}>
            {league.status === 'active' ? 'Live' : 'Setup'}
          </Badge>
        </div>
      </div>

      {/* LIVE MATCHES */}
      {liveFixtures.length > 0 && (
        <section className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="font-bold text-sm text-[var(--text-primary)]">Live Now</h2>
            <Badge variant="danger" className="text-[9px]">{liveFixtures.length}</Badge>
          </div>
          <div className="space-y-2">
            {liveFixtures.map(f => (
              <LiveFixtureCard key={f.id} fixture={f} ownerMap={ownerMap} />
            ))}
          </div>
        </section>
      )}

      {/* My standing */}
      {myEntry && myPos && hasDraft && (
        <div
          className="rounded-2xl p-4 mb-3 border"
          style={{
            background: `linear-gradient(135deg, ${myEntry.player.color}18 0%, transparent 60%)`,
            borderColor: `${myEntry.player.color}30`,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <Avatar name={myEntry.player.name} color={myEntry.player.color} size="lg" />
              <div
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-[var(--bg)]"
                style={{ backgroundColor: myEntry.player.color, color: '#fff' }}
              >
                {myPos}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[var(--text-secondary)] font-medium uppercase tracking-wide">Your standing</p>
              <p className="font-bold text-base text-[var(--text-primary)]">{myEntry.player.name}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                <span className="text-emerald-400">{myEntry.wins}W</span>
                <span className="text-amber-400">{myEntry.draws}D</span>
                <span className="text-red-400">{myEntry.losses}L</span>
                {myEntry.bonusPoints > 0 && (
                  <span className="text-[var(--accent)]">+{myEntry.bonusPoints} bonus</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-black text-2xl text-[var(--text-primary)]">{myEntry.totalPoints}</p>
              <p className="text-[10px] text-[var(--text-secondary)]">points</p>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {standings.length > 0 && hasDraft && (
        <section className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-sm text-[var(--text-primary)]">Leaderboard</h2>
            <Link href="/standings" className="text-xs text-[var(--accent)]">Full table →</Link>
          </div>
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            {standings.slice(0, 5).map((entry: any, idx: number) => {
              const isMe = entry.player.user_id === myUserId
              const posColor = idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-orange-500' : 'text-[var(--text-muted)]'
              const posBg = idx === 0 ? 'bg-amber-500/10' : idx === 1 ? 'bg-slate-400/10' : idx === 2 ? 'bg-orange-500/10' : ''
              return (
                <div
                  key={entry.player.id}
                  className={[
                    'flex items-center gap-2.5 px-3 py-2.5 border-b border-[var(--border)] last:border-0',
                    isMe ? 'bg-[var(--accent)]/5' : 'bg-[var(--bg-card)]',
                  ].join(' ')}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${posBg} ${posColor}`}>
                    {idx + 1}
                  </div>
                  <Avatar name={entry.player.name} color={entry.player.color} size="sm" />
                  <span className="flex-1 text-sm font-medium text-[var(--text-primary)] truncate">
                    {entry.player.name}
                    {isMe && <span className="ml-1 text-[9px] text-[var(--accent)] font-semibold uppercase">You</span>}
                  </span>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-[var(--text-primary)]">{entry.totalPoints}</span>
                    <span className="text-[10px] text-[var(--text-muted)] ml-1">pts</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Draft pending call to action */}
      {!hasDraft && (
        <Card className="mb-4 border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 text-center py-4">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Draft not yet run</p>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            {league.draft_locked ? 'Draft is locked — contact your admin.' : 'Head to the draft room to assign teams.'}
          </p>
          {!league.draft_locked && (
            <Link href="/draft" className="text-xs text-[var(--accent)] font-semibold hover:underline">
              Go to draft room →
            </Link>
          )}
        </Card>
      )}

      {/* Today's fixtures */}
      {todayFixtures.length > 0 && (
        <section className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-sm text-[var(--text-primary)]">Today</h2>
            <Link href="/fixtures" className="text-xs text-[var(--accent)]">All fixtures →</Link>
          </div>
          <div className="space-y-2">
            {todayFixtures.map(f => (
              <MiniFixtureCard key={f.id} fixture={f} ownerMap={ownerMap} />
            ))}
          </div>
        </section>
      )}

      {/* Recent results */}
      {recentResults.length > 0 && (
        <section className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-sm text-[var(--text-primary)]">Recent Results</h2>
            <Link href="/fixtures?tab=results" className="text-xs text-[var(--accent)]">See all →</Link>
          </div>
          <div className="space-y-2">
            {recentResults.slice(0, 4).map(f => (
              <MiniFixtureCard key={f.id} fixture={f} ownerMap={ownerMap} />
            ))}
          </div>
        </section>
      )}

      {/* Activity feed */}
      {activityFeed.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-sm text-[var(--text-primary)]">Activity</h2>
            <Link href="/activity" className="text-xs text-[var(--accent)]">See all →</Link>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {activityFeed.map((event: any, i: number) => (
              <div
                key={event.id}
                className={['px-3 py-2.5 flex items-start gap-2.5', i < activityFeed.length - 1 ? 'border-b border-[var(--border)]' : ''].join(' ')}
              >
                <span className="text-sm shrink-0 mt-0.5">
                  {getEventIcon(event.event_type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-primary)] font-medium leading-snug">{event.title}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{formatRelativeTime(event.created_at)}</p>
                </div>
                {event.points_delta != null && event.points_delta !== 0 && (
                  <span className={`text-xs font-bold shrink-0 ${event.points_delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {event.points_delta > 0 ? '+' : ''}{event.points_delta}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  )
}

function LiveFixtureCard({ fixture, ownerMap }: { fixture: any; ownerMap: Map<string, any> }) {
  const homeOwner = ownerMap.get(fixture.home_team_id)
  const awayOwner = ownerMap.get(fixture.away_team_id)
  return (
    <Link href={`/fixtures/${fixture.id}`}>
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <TeamCrest team={fixture.home_team} size="xs" />
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{fixture.home_team?.name}</span>
            </div>
            {homeOwner && (
              <span className="text-[9px] text-[var(--text-muted)] ml-5">{homeOwner.name}</span>
            )}
          </div>
          <div className="shrink-0 text-center">
            <span className="text-lg font-black text-[var(--text-primary)] tabular-nums">
              {fixture.home_score ?? 0}<span className="text-[var(--text-muted)] mx-0.5">:</span>{fixture.away_score ?? 0}
            </span>
            <div className="text-[9px] text-red-400 font-bold text-center">LIVE</div>
          </div>
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{fixture.away_team?.name}</span>
              <TeamCrest team={fixture.away_team} size="xs" />
            </div>
            {awayOwner && (
              <span className="text-[9px] text-[var(--text-muted)] mr-5">{awayOwner.name}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function MiniFixtureCard({ fixture, ownerMap }: { fixture: any; ownerMap: Map<string, any> }) {
  const homeOwner = ownerMap.get(fixture.home_team_id)
  const awayOwner = ownerMap.get(fixture.away_team_id)
  const isCompleted = fixture.status === 'completed'

  return (
    <Link href={`/fixtures/${fixture.id}`}>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 hover:border-[var(--accent)]/40 transition-colors">
        <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-muted)] mb-1.5">
          <Badge
            variant={(fixture.competition as any)?.competition_type === 'european' ? 'purple' : 'muted'}
            className="text-[9px]"
          >
            {(fixture.competition as any)?.short_name}
          </Badge>
          <span className="ml-auto">
            {fixture.kickoff_time
              ? new Date(fixture.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Home */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <TeamCrest team={fixture.home_team} size="xs" />
              <span className="text-xs font-medium text-[var(--text-primary)] truncate">{fixture.home_team?.name}</span>
            </div>
            {homeOwner && (
              <div className="flex items-center gap-1 mt-0.5 ml-0.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: homeOwner.color }} />
                <span className="text-[9px] text-[var(--text-muted)]">{homeOwner.name}</span>
              </div>
            )}
          </div>
          {/* Score */}
          <div className="shrink-0 min-w-[44px] text-center">
            {isCompleted ? (
              <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                {fixture.home_score}–{fixture.away_score}
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">vs</span>
            )}
          </div>
          {/* Away */}
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center gap-1 justify-end">
              <span className="text-xs font-medium text-[var(--text-primary)] truncate">{fixture.away_team?.name}</span>
              <TeamCrest team={fixture.away_team} size="xs" />
            </div>
            {awayOwner && (
              <div className="flex items-center gap-1 mt-0.5 justify-end mr-0.5">
                <span className="text-[9px] text-[var(--text-muted)]">{awayOwner.name}</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: awayOwner.color }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

const EVENT_ICONS: Record<string, string> = {
  full_time: '⚽',
  giant_killer: '🗡️',
  double_or_nothing: '🎲',
  reverse: '🔄',
  position_change: '📈',
  points_earned: '⭐',
  qualification: '🏆',
  default: '📢',
}

function getEventIcon(type: string): string {
  return EVENT_ICONS[type] ?? EVENT_ICONS.default
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
  return `${days}d ago`
}

'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

export default function DashboardPage() {
  const [league, setLeague] = useState<any>(null)
  const [standings, setStandings] = useState<any[]>([])
  const [liveFixtures, setLiveFixtures] = useState<any[]>([])
  const [todayFixtures, setTodayFixtures] = useState<any[]>([])
  const [recentResults, setRecentResults] = useState<any[]>([])
  const [activityFeed, setActivityFeed] = useState<any[]>([])
  const [ownerMap, setOwnerMap] = useState<Map<string, any>>(new Map())
  const [weeklyPtsMap, setWeeklyPtsMap] = useState<Map<string, number>>(new Map())
  const [formMap, setFormMap] = useState<Map<string, string[]>>(new Map())
  const [posChangeMap, setPosChangeMap] = useState<Map<string, number>>(new Map())
  const [weekFixtures, setWeekFixtures] = useState<any[]>([])
  const [nextMyMatch, setNextMyMatch] = useState<any>(null)
  const [myClubsToday, setMyClubsToday] = useState(0)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pullDist, setPullDist] = useState(0)
  const touchStartY = useRef(0)
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
    const uid = authData?.user?.id ?? null
    setMyUserId(uid)
    if (!lg) { setLoading(false); setRefreshing(false); return }

    const today = new Date()
    const todayStr = today.toISOString().substring(0, 10)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().substring(0, 10)
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndStr = weekEnd.toISOString().substring(0, 10)

    const [
      { data: players },
      { data: playerScores },
      { data: assignments },
      { data: live },
      { data: todayFix },
      { data: recent },
      { data: fullActivity },
      { data: weekFix },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_scores').select('*').eq('league_id', lg.id),
      supabase.from('player_team_assignments').select('team_id, player_id, players(id,name,color)').eq('league_id', lg.id),
      supabase.from('fixtures')
        .select('*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
        .eq('league_id', lg.id).eq('status', 'live'),
      supabase.from('fixtures')
        .select('*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
        .eq('league_id', lg.id).eq('status', 'scheduled')
        .gte('kickoff_time', `${todayStr}T00:00:00`)
        .lte('kickoff_time', `${todayStr}T23:59:59`)
        .order('kickoff_time'),
      supabase.from('fixtures')
        .select('*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
        .eq('league_id', lg.id).eq('status', 'completed')
        .order('kickoff_time', { ascending: false }).limit(6),
      supabase.from('activity_feed')
        .select('*')
        .eq('league_id', lg.id)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase.from('fixtures')
        .select('*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
        .eq('league_id', lg.id).eq('status', 'scheduled')
        .gte('kickoff_time', `${tomorrowStr}T00:00:00`)
        .lte('kickoff_time', `${weekEndStr}T23:59:59`)
        .order('kickoff_time')
        .limit(30),
    ])

    // Owner map: team_id → player
    const oMap = new Map<string, any>()
    for (const a of (assignments ?? []) as any[]) {
      if (a.players && a.team_id) oMap.set(a.team_id, a.players)
    }
    setOwnerMap(oMap)

    // Weekly points per player from last 7 days activity
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const wkPts = new Map<string, number>()
    const fMap = new Map<string, string[]>()

    for (const evt of (fullActivity ?? []) as any[]) {
      if (!evt.player_id) continue
      const evtTime = new Date(evt.created_at).getTime()

      // Weekly points
      if (evtTime > weekAgo && evt.points_delta) {
        wkPts.set(evt.player_id, (wkPts.get(evt.player_id) ?? 0) + evt.points_delta)
      }

      // Form guide: last 5 full_time events per player
      if (evt.event_type === 'full_time') {
        const arr = fMap.get(evt.player_id) ?? []
        if (arr.length < 5) {
          const pts = evt.points_delta ?? 0
          arr.push(pts >= 3 ? 'W' : pts >= 1 ? 'D' : 'L')
          fMap.set(evt.player_id, arr)
        }
      }
    }
    setWeeklyPtsMap(wkPts)
    setFormMap(fMap)

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

    // Position changes: compare current vs. standings without this week's points
    const prevRows = [...rows].map((r: any) => ({
      id: r.player.id,
      prevPts: r.totalPoints - (wkPts.get(r.player.id) ?? 0),
    })).sort((a, b) => b.prevPts - a.prevPts)

    const pcMap = new Map<string, number>()
    rows.forEach((r: any, i: number) => {
      const prevIdx = prevRows.findIndex((p) => p.id === r.player.id)
      pcMap.set(r.player.id, prevIdx - i) // positive = moved up this week
    })
    setPosChangeMap(pcMap)

    setStandings(rows)

    // My clubs playing today + next match
    if (uid) {
      const myPlayer = (players ?? []).find((p: any) => p.user_id === uid)
      if (myPlayer) {
        const myTeamIds = new Set(
          ((assignments ?? []) as any[]).filter(a => a.player_id === myPlayer.id).map(a => a.team_id)
        )
        const todayIds = new Set([
          ...(live ?? []).map((f: any) => f.home_team_id),
          ...(live ?? []).map((f: any) => f.away_team_id),
          ...(todayFix ?? []).map((f: any) => f.home_team_id),
          ...(todayFix ?? []).map((f: any) => f.away_team_id),
        ])
        setMyClubsToday([...todayIds].filter(id => myTeamIds.has(id)).length)

        // Next upcoming match for my clubs
        const allUpcoming = [...(todayFix ?? []), ...(weekFix ?? [])]
          .filter((f: any) => myTeamIds.has(f.home_team_id) || myTeamIds.has(f.away_team_id))
          .sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
        setNextMyMatch(allUpcoming[0] ?? null)
      }
    }

    setLiveFixtures((live ?? []) as any[])
    setTodayFixtures((todayFix ?? []) as any[])
    setWeekFixtures((weekFix ?? []) as any[])
    setRecentResults((recent ?? []) as any[])
    setActivityFeed(((fullActivity ?? []) as any[]).slice(0, 5))
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (liveFixtures.length === 0) return
    const id = setInterval(() => load(true), 60000)
    return () => clearInterval(id)
  }, [liveFixtures.length, load])

  // Pull-to-refresh touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (window.scrollY > 0) return
    const dist = e.touches[0].clientY - touchStartY.current
    if (dist > 0) setPullDist(Math.min(dist, 80))
  }
  const handleTouchEnd = () => {
    if (pullDist >= 60 && !refreshing) load(true)
    setPullDist(0)
  }

  if (loading) return <AppShell><DashboardSkeleton /></AppShell>

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
  const hasDraft = standings.some((s: any) => s.teamCount > 0)

  const todayTeamCount = new Set([
    ...liveFixtures.map((f: any) => f.home_team_id),
    ...liveFixtures.map((f: any) => f.away_team_id),
    ...todayFixtures.map((f: any) => f.home_team_id),
    ...todayFixtures.map((f: any) => f.away_team_id),
  ]).size

  const weekFixtureCount = weekFixtures.length + todayFixtures.length + liveFixtures.length

  // Biggest movers this week
  const standingsWithWeekly = standings.map(e => ({ ...e, wkPts: weeklyPtsMap.get(e.player.id) ?? 0 }))
  const topGainer = [...standingsWithWeekly].filter(e => e.wkPts > 0).sort((a, b) => b.wkPts - a.wkPts)[0]
  const topLoser = [...standingsWithWeekly].filter(e => e.wkPts < 0).sort((a, b) => a.wkPts - b.wkPts)[0]

  // Group week fixtures by day
  const weekByDay = new Map<string, any[]>()
  for (const f of weekFixtures) {
    const day = (f.kickoff_time as string).substring(0, 10)
    if (!weekByDay.has(day)) weekByDay.set(day, [])
    weekByDay.get(day)!.push(f)
  }

  return (
    <AppShell
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {pullDist > 20 && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all"
          style={{ height: pullDist * 0.6, opacity: pullDist / 80 }}
        >
          <span className="text-xs text-[var(--accent)]" style={{ transform: `rotate(${pullDist * 3}deg)` }}>↻</span>
        </div>
      )}
      {refreshing && (
        <div className="flex items-center justify-center py-1">
          <span className="text-[10px] text-[var(--accent)]">Refreshing...</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="font-black text-xl text-[var(--text-primary)] leading-tight">{league.name}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
            {weekFixtureCount > 0 && (
              <span className="text-[10px] text-[var(--text-muted)]">· {weekFixtureCount} game{weekFixtureCount !== 1 ? 's' : ''} this week</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={league.status === 'active' ? 'success' : 'warning'}>
            {league.status === 'active' ? 'Live' : 'Setup'}
          </Badge>
        </div>
      </div>

      {/* LIVE matches */}
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

      {/* My standing hero card */}
      {myEntry && myPos && hasDraft && (
        <MyStandingCard
          entry={myEntry}
          pos={myPos}
          posDelta={posChangeMap.get(myEntry.player.id) ?? 0}
          form={formMap.get(myEntry.player.id) ?? []}
          weeklyPts={weeklyPtsMap.get(myEntry.player.id) ?? 0}
          clubsToday={myClubsToday}
          liveCount={liveFixtures.length}
          nextMatch={nextMyMatch}
        />
      )}

      {/* Draft pending */}
      {!hasDraft && (
        <div className="rounded-2xl border border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 text-center py-5 px-4 mb-4">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Draft not yet run</p>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            {league.draft_locked ? 'Draft is locked — contact your admin.' : 'Head to the draft room to assign teams.'}
          </p>
          {!league.draft_locked && (
            <Link href="/draft" className="text-xs text-[var(--accent)] font-semibold hover:underline">
              Go to draft room →
            </Link>
          )}
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
            {standings.slice(0, 5).map((entry: any, idx: number) => (
              <LeaderboardRow
                key={entry.player.id}
                entry={entry}
                position={idx + 1}
                isMe={entry.player.user_id === myUserId}
                posDelta={posChangeMap.get(entry.player.id) ?? 0}
                form={formMap.get(entry.player.id) ?? []}
                weeklyPts={weeklyPtsMap.get(entry.player.id) ?? 0}
              />
            ))}
          </div>
        </section>
      )}

      {/* Biggest Movers this week */}
      {hasDraft && (topGainer || topLoser) && (
        <section className="mb-4">
          <h2 className="font-bold text-sm text-[var(--text-primary)] mb-2">This Week</h2>
          <div className={`grid gap-2 ${topGainer && topLoser ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {topGainer && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-2">🚀 Top scorer</p>
                <div className="flex items-center gap-2">
                  <Avatar name={topGainer.player.name} color={topGainer.player.color} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{topGainer.player.name.split(' ')[0]}</p>
                    <p className="text-base font-black text-emerald-400">+{topGainer.wkPts}</p>
                  </div>
                </div>
              </div>
            )}
            {topLoser && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-2">📉 Struggling</p>
                <div className="flex items-center gap-2">
                  <Avatar name={topLoser.player.name} color={topLoser.player.color} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{topLoser.player.name.split(' ')[0]}</p>
                    <p className="text-base font-black text-red-400">{topLoser.wkPts}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Today's fixtures */}
      {(todayFixtures.length > 0) && (
        <section className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-sm text-[var(--text-primary)]">
              Today
              {todayTeamCount > 0 && (
                <span className="ml-1.5 font-normal text-xs text-[var(--text-muted)]">
                  · {todayTeamCount} clubs
                </span>
              )}
            </h2>
            <Link href="/fixtures" className="text-xs text-[var(--accent)]">All fixtures →</Link>
          </div>
          <div className="space-y-2">
            {todayFixtures.map(f => (
              <MiniFixtureCard key={f.id} fixture={f} ownerMap={ownerMap} />
            ))}
          </div>
        </section>
      )}

      {/* This week's upcoming fixtures */}
      {weekFixtures.length > 0 && (
        <section className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-sm text-[var(--text-primary)]">Coming Up</h2>
            <Link href="/fixtures" className="text-xs text-[var(--accent)]">All fixtures →</Link>
          </div>
          <div className="space-y-3">
            {[...weekByDay.entries()].map(([day, dayFixtures]) => (
              <div key={day}>
                <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  {new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
                <div className="space-y-1.5">
                  {dayFixtures.map((f: any) => (
                    <MiniFixtureCard key={f.id} fixture={f} ownerMap={ownerMap} />
                  ))}
                </div>
              </div>
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
            {recentResults.slice(0, 3).map(f => (
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
                <span className="text-sm shrink-0 mt-0.5">{getEventIcon(event.event_type)}</span>
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function MyStandingCard({
  entry, pos, posDelta, form, weeklyPts, clubsToday, liveCount, nextMatch,
}: {
  entry: any; pos: number; posDelta: number; form: string[]
  weeklyPts: number; clubsToday: number; liveCount: number; nextMatch: any
}) {
  return (
    <div
      className="rounded-2xl p-4 mb-3 border"
      style={{
        background: `linear-gradient(135deg, ${entry.player.color}18 0%, transparent 60%)`,
        borderColor: `${entry.player.color}30`,
      }}
    >
      <div className="flex items-center gap-3">
        {/* Avatar + position badge */}
        <div className="relative shrink-0">
          <Avatar name={entry.player.name} color={entry.player.color} size="lg" />
          <div
            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-[var(--bg)]"
            style={{ backgroundColor: entry.player.color, color: '#fff' }}
          >
            {pos}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-[var(--text-secondary)] font-medium uppercase tracking-wide">Your standing</p>
          <p className="font-bold text-base text-[var(--text-primary)]">{entry.player.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Form dots */}
            {form.length > 0 && (
              <div className="flex items-center gap-0.5">
                {form.map((r, i) => (
                  <span
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full text-[7px] font-bold flex items-center justify-center ${
                      r === 'W' ? 'bg-emerald-500 text-white' : r === 'D' ? 'bg-amber-500 text-white' : 'bg-red-500/70 text-white'
                    }`}
                  >{r}</span>
                ))}
              </div>
            )}
            {/* Position arrow */}
            {posDelta !== 0 && (
              <span className={`text-[11px] font-bold ${posDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {posDelta > 0 ? `↑${posDelta}` : `↓${Math.abs(posDelta)}`}
              </span>
            )}
            {posDelta === 0 && form.length > 0 && (
              <span className="text-[11px] text-[var(--text-muted)]">→</span>
            )}
          </div>
          {/* Clubs playing today */}
          {clubsToday > 0 && (
            <p className="text-[10px] font-medium mt-1" style={{ color: liveCount > 0 ? '#f87171' : '#fbbf24' }}>
              {liveCount > 0 ? '🔴' : '⚽'} {clubsToday} of your club{clubsToday !== 1 ? 's' : ''} {liveCount > 0 ? 'playing live' : 'playing today'}
            </p>
          )}
          {/* Next match countdown */}
          {clubsToday === 0 && nextMatch && nextMatch.kickoff_time && (
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              ⏱ {nextMatch.home_team?.short_name || nextMatch.home_team?.name} vs {nextMatch.away_team?.short_name || nextMatch.away_team?.name}{' '}
              <span className="text-[var(--accent)] font-medium">{formatCountdown(nextMatch.kickoff_time)}</span>
            </p>
          )}
        </div>

        {/* Points */}
        <div className="text-right shrink-0">
          <p className="font-black text-2xl text-[var(--text-primary)]">{entry.totalPoints}</p>
          <p className="text-[10px] text-[var(--text-muted)]">points</p>
          {weeklyPts !== 0 && (
            <p className={`text-[10px] font-semibold mt-0.5 ${weeklyPts > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {weeklyPts > 0 ? '+' : ''}{weeklyPts} this wk
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function LeaderboardRow({
  entry, position, isMe, posDelta, form, weeklyPts,
}: {
  entry: any; position: number; isMe: boolean
  posDelta: number; form: string[]; weeklyPts: number
}) {
  const posColor = position === 1 ? 'text-amber-400' : position === 2 ? 'text-slate-400' : position === 3 ? 'text-orange-500' : 'text-[var(--text-muted)]'
  const posBg = position === 1 ? 'bg-amber-500/10' : position === 2 ? 'bg-slate-400/10' : position === 3 ? 'bg-orange-500/10' : ''
  return (
    <div className={[
      'flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)] last:border-0',
      isMe ? 'bg-[var(--accent)]/5' : 'bg-[var(--bg-card)]',
    ].join(' ')}>
      {/* Position */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${posBg} ${posColor}`}>
        {position}
      </div>

      <Avatar name={entry.player.name} color={entry.player.color} size="sm" />

      {/* Name + form */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {entry.player.name}
          </span>
          {isMe && <span className="text-[9px] text-[var(--accent)] font-semibold uppercase shrink-0">You</span>}
          {posDelta > 0 && (
            <span className="text-[10px] font-bold text-emerald-400 shrink-0">↑{posDelta}</span>
          )}
          {posDelta < 0 && (
            <span className="text-[10px] font-bold text-red-400 shrink-0">↓{Math.abs(posDelta)}</span>
          )}
        </div>
        {/* Form dots */}
        {form.length > 0 && (
          <div className="flex items-center gap-0.5 mt-0.5">
            {form.map((r, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${r === 'W' ? 'bg-emerald-500' : r === 'D' ? 'bg-amber-500' : 'bg-red-500/50'}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Points + weekly */}
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1 justify-end">
          {weeklyPts > 0 && (
            <span className="text-[10px] text-emerald-400 font-semibold">+{weeklyPts}</span>
          )}
          {weeklyPts < 0 && (
            <span className="text-[10px] text-red-400 font-semibold">{weeklyPts}</span>
          )}
          <span className="text-sm font-bold text-[var(--text-primary)]">{entry.totalPoints}</span>
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">pts</span>
      </div>
    </div>
  )
}

function LiveFixtureCard({ fixture, ownerMap }: { fixture: any; ownerMap: Map<string, any> }) {
  const homeOwner = ownerMap.get(fixture.home_team_id)
  const awayOwner = ownerMap.get(fixture.away_team_id)
  return (
    <Link href={`/fixtures/${fixture.id}`}>
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
        <div className="flex items-center gap-2">
          {/* Home */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <TeamCrest team={fixture.home_team} size="xs" />
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{fixture.home_team?.short_name || fixture.home_team?.name}</span>
            </div>
            {homeOwner && <span className="text-[9px] text-[var(--text-muted)] ml-5">{homeOwner.name}</span>}
          </div>
          {/* Score */}
          <div className="shrink-0 text-center px-1">
            <span className="text-lg font-black text-[var(--text-primary)] tabular-nums">
              {fixture.home_score ?? 0}<span className="text-[var(--text-muted)] mx-0.5">-</span>{fixture.away_score ?? 0}
            </span>
            <div className="text-[9px] text-red-400 font-bold text-center animate-pulse">LIVE</div>
          </div>
          {/* Away */}
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{fixture.away_team?.short_name || fixture.away_team?.name}</span>
              <TeamCrest team={fixture.away_team} size="xs" />
            </div>
            {awayOwner && <span className="text-[9px] text-[var(--text-muted)] mr-5">{awayOwner.name}</span>}
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
  const isLive = fixture.status === 'live'

  return (
    <Link href={`/fixtures/${fixture.id}`}>
      <div className={[
        'rounded-xl border bg-[var(--bg-card)] px-3 py-2.5 transition-colors',
        isLive ? 'border-red-500/30 bg-red-500/5' : 'border-[var(--border)] hover:border-[var(--accent)]/40',
      ].join(' ')}>
        <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-muted)] mb-1.5">
          <Badge
            variant={(fixture.competition as any)?.competition_type === 'european' ? 'purple' : 'muted'}
            className="text-[9px]"
          >
            {(fixture.competition as any)?.short_name}
          </Badge>
          <span className="ml-auto">
            {isLive ? (
              <span className="text-red-400 font-bold animate-pulse">LIVE</span>
            ) : fixture.kickoff_time ? (
              new Date(fixture.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            ) : '—'}
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
          {/* Score/vs */}
          <div className="shrink-0 min-w-[44px] text-center">
            {(isCompleted || isLive) ? (
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  full_time: '⚽',
  giant_killer: '⚔️',
  double_or_nothing: '🎲',
  reverse: '🔄',
  position_change: '📈',
  points_earned: '⭐',
  qualification: '🏆',
  elimination: '❌',
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

function formatCountdown(kickoff: string): string {
  const diff = new Date(kickoff).getTime() - Date.now()
  if (diff <= 0) return 'now'
  const totalMins = Math.floor(diff / 60000)
  if (totalMins < 60) return `in ${totalMins}m`
  const hrs = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hrs < 24) return `in ${hrs}h${mins > 0 ? ` ${mins}m` : ''}`
  const days = Math.floor(hrs / 24)
  return `in ${days}d`
}

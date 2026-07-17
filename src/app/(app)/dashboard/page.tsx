'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { OwnerStack } from '@/components/ui/OwnerStack'
import { CompetitionBadge } from '@/components/ui/CompetitionBadge'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

export default function DashboardPage() {
  const [league, setLeague] = useState<any>(null)
  const [standings, setStandings] = useState<any[]>([])
  const [liveFixtures, setLiveFixtures] = useState<any[]>([])
  const [todayFixtures, setTodayFixtures] = useState<any[]>([])
  const [activityFeed, setActivityFeed] = useState<any[]>([])
  const [ownerMap, setOwnerMap] = useState<Map<string, any[]>>(new Map())
  const [weeklyPtsMap, setWeeklyPtsMap] = useState<Map<string, number>>(new Map())
  const [formMap, setFormMap] = useState<Map<string, string[]>>(new Map())
  const [posChangeMap, setPosChangeMap] = useState<Map<string, number>>(new Map())
  const [weekFixtures, setWeekFixtures] = useState<any[]>([])
  const [nextMyMatch, setNextMyMatch] = useState<any>(null)
  const [myClubsToday, setMyClubsToday] = useState(0)
  const [myPowerUps, setMyPowerUps] = useState<any[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
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
      { data: fullActivity },
      { data: weekFix },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_scores').select('*').eq('league_id', lg.id),
      supabase.from('player_team_assignments').select('team_id, player_id, players(id,name,color), teams(id,short_name,name,logo_url,primary_color,secondary_color)').eq('league_id', lg.id),
      supabase.from('fixtures')
        .select('*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
        .eq('league_id', lg.id).eq('status', 'live'),
      supabase.from('fixtures')
        .select('*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
        .eq('league_id', lg.id).eq('status', 'scheduled')
        .gte('kickoff_time', `${todayStr}T00:00:00`)
        .lte('kickoff_time', `${todayStr}T23:59:59`)
        .order('kickoff_time'),
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

    // Owner map: team_id → player[]
    const oMap = new Map<string, any[]>()
    // Player → teams map (for leaderboard crests)
    const playerTeamsMap = new Map<string, any[]>()
    for (const a of (assignments ?? []) as any[]) {
      if (a.players && a.team_id) {
        const arr = oMap.get(a.team_id) ?? []
        arr.push(a.players)
        oMap.set(a.team_id, arr)
      }
      if (a.teams && a.player_id) {
        const arr = playerTeamsMap.get(a.player_id) ?? []
        if (!arr.find((t: any) => t.id === a.teams.id)) arr.push(a.teams)
        playerTeamsMap.set(a.player_id, arr)
      }
    }
    setOwnerMap(oMap)

    // Weekly pts + form
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const wkPts = new Map<string, number>()
    const fMap = new Map<string, string[]>()

    for (const evt of (fullActivity ?? []) as any[]) {
      if (!evt.player_id) continue
      const evtTime = new Date(evt.created_at).getTime()
      if (evtTime > weekAgo && evt.points_delta) {
        wkPts.set(evt.player_id, (wkPts.get(evt.player_id) ?? 0) + evt.points_delta)
      }
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
        teams: playerTeamsMap.get(p.id) ?? [],
      }
    }).sort((a: any, b: any) => b.totalPoints - a.totalPoints)

    const prevRows = [...rows].map((r: any) => ({
      id: r.player.id,
      prevPts: r.totalPoints - (wkPts.get(r.player.id) ?? 0),
    })).sort((a, b) => b.prevPts - a.prevPts)

    const pcMap = new Map<string, number>()
    rows.forEach((r: any, i: number) => {
      const prevIdx = prevRows.findIndex((p) => p.id === r.player.id)
      pcMap.set(r.player.id, prevIdx - i)
    })
    setPosChangeMap(pcMap)
    setStandings(rows)

    if (uid) {
      const myPlayer = (players ?? []).find((p: any) => p.user_id === uid)
      if (myPlayer) {
        setMyPlayerId(myPlayer.id)
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

        const allUpcoming = [...(todayFix ?? []), ...(weekFix ?? [])]
          .filter((f: any) => myTeamIds.has(f.home_team_id) || myTeamIds.has(f.away_team_id))
          .sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
        setNextMyMatch(allUpcoming[0] ?? null)

        const todayFixIds = [...(live ?? []), ...(todayFix ?? [])].map((f: any) => f.id)
        if (todayFixIds.length > 0) {
          const { data: pups } = await supabase
            .from('power_up_activations')
            .select('*')
            .eq('league_id', lg.id)
            .eq('player_id', myPlayer.id)
            .eq('status', 'pending')
            .in('fixture_id', todayFixIds)
          setMyPowerUps(pups ?? [])
        } else {
          setMyPowerUps([])
        }
      }
    }

    setLiveFixtures((live ?? []) as any[])
    setTodayFixtures((todayFix ?? []) as any[])
    setWeekFixtures((weekFix ?? []) as any[])
    setActivityFeed(((fullActivity ?? []) as any[]).slice(0, 6))
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (liveFixtures.length === 0) return
    const id = setInterval(() => load(true), 60000)
    return () => clearInterval(id)
  }, [liveFixtures.length, load])

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
  const hasDraft = league.draft_locked || standings.some((s: any) => s.teamCount > 0)

  const myTeamIdsForStakes = myEntry
    ? new Set([...ownerMap.entries()].filter(([, arr]) => arr.some((p: any) => p.id === myEntry.player.id)).map(([id]) => id))
    : new Set<string>()

  const stakesFixtures = myTeamIdsForStakes.size > 0
    ? [...liveFixtures, ...todayFixtures].filter(
        (f: any) => myTeamIdsForStakes.has(f.home_team_id) || myTeamIdsForStakes.has(f.away_team_id)
      )
    : []

  const allTodayFixtures = [...liveFixtures, ...todayFixtures]

  return (
    <AppShell
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh */}
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
          <span className="text-[10px] text-[var(--accent)]">Refreshing…</span>
        </div>
      )}

      {/* League header */}
      <div className="flex items-start justify-between gap-2 mb-5">
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-xl text-[var(--text-primary)] leading-tight truncate">{league.name}</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">{league.season}</p>
        </div>
        <Badge variant={league.status === 'active' ? 'live' : 'warning'} className="shrink-0">
          {league.status === 'active' ? 'Live' : 'Setup'}
        </Badge>
      </div>

      {/* My hero card */}
      {myEntry && myPos && hasDraft && (
        <HeroCard
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

      {/* Draft not yet run */}
      {!hasDraft && (
        <div className="rounded-2xl border border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 text-center py-6 px-4 mb-5">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Teams not yet assigned</p>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Head to the draft room to assign teams.
          </p>
          <Link href="/draft" className="text-xs text-[var(--accent)] font-semibold hover:underline">
            Go to draft room →
          </Link>
        </div>
      )}

      {/* LIVE matches */}
      {liveFixtures.length > 0 && (
        <section className="mb-5">
          <SectionHeader
            title="Live now"
            action={
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)] animate-pulse" />
                <Link href="/fixtures" className="text-xs text-[var(--accent)]">All →</Link>
              </div>
            }
          />
          <div className="space-y-2">
            {liveFixtures.map(f => (
              <LiveFixtureCard key={f.id} fixture={f} ownerMap={ownerMap} />
            ))}
          </div>
        </section>
      )}

      {/* Today's fixtures — horizontal scroll */}
      {allTodayFixtures.length > 0 && (
        <section className="mb-5">
          <SectionHeader
            title={`Today · ${allTodayFixtures.length} game${allTodayFixtures.length !== 1 ? 's' : ''}`}
            action={<Link href="/fixtures">All →</Link>}
          />
          <div className="scroll-x -mx-4 px-4">
            {allTodayFixtures.map(f => (
              <TodayFixtureCard
                key={f.id}
                fixture={f}
                ownerMap={ownerMap}
                isMine={myTeamIdsForStakes.has(f.home_team_id) || myTeamIdsForStakes.has(f.away_team_id)}
                myPowerUps={myPowerUps}
              />
            ))}
          </div>
        </section>
      )}

      {/* Results chart */}
      {standings.length > 0 && hasDraft && standings.some((s: any) => s.played > 0) && (
        <ResultsChart standings={standings} />
      )}

      {/* Leaderboard */}
      {standings.length > 0 && hasDraft && (
        <section className="mb-5">
          <SectionHeader
            title="Leaderboard"
            action={<Link href="/standings">Full table →</Link>}
          />
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            {standings.map((entry: any, i: number) => (
              <LeaderboardRow
                key={entry.player.id}
                entry={entry}
                position={i + 1}
                isMe={entry.player.user_id === myUserId}
                posDelta={posChangeMap.get(entry.player.id) ?? 0}
                form={formMap.get(entry.player.id) ?? []}
                weeklyPts={weeklyPtsMap.get(entry.player.id) ?? 0}
                teams={entry.teams ?? []}
              />
            ))}
          </div>
        </section>
      )}

      {/* My clubs this week */}
      {(() => {
        const myWeek = myTeamIdsForStakes.size > 0
          ? weekFixtures.filter((f: any) => myTeamIdsForStakes.has(f.home_team_id) || myTeamIdsForStakes.has(f.away_team_id))
          : []
        if (myWeek.length === 0) return null
        const byDay = new Map<string, any[]>()
        for (const f of myWeek) {
          const day = (f.kickoff_time as string).substring(0, 10)
          if (!byDay.has(day)) byDay.set(day, [])
          byDay.get(day)!.push(f)
        }
        return (
          <section className="mb-5">
            <SectionHeader
              title="My clubs this week"
              action={<Link href="/fixtures">All →</Link>}
            />
            <div className="space-y-3">
              {[...byDay.entries()].map(([day, dayFixtures]) => (
                <div key={day}>
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                    {new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </p>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                    {dayFixtures.map((f: any, i: number) => (
                      <MiniFixtureRow
                        key={f.id}
                        fixture={f}
                        ownerMap={ownerMap}
                        divider={i < dayFixtures.length - 1}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      {/* Activity feed */}
      {activityFeed.length > 0 && (
        <section>
          <SectionHeader
            title="Activity"
            action={<Link href="/activity">See all →</Link>}
          />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {activityFeed.map((event: any, i: number) => (
              <div
                key={event.id}
                className={['px-3 py-2.5 flex items-start gap-2.5', i < activityFeed.length - 1 ? 'border-b border-[var(--border)]' : ''].join(' ')}
              >
                <span className="text-sm shrink-0 mt-0.5">{EVENT_ICONS[event.event_type] ?? '📢'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-primary)] font-medium leading-snug">{event.title}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{formatRelativeTime(event.created_at)}</p>
                </div>
                {event.points_delta != null && event.points_delta !== 0 && (
                  <span className={`text-xs font-bold shrink-0 ${event.points_delta > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
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

// ─── Hero card ────────────────────────────────────────────────────────────────

function HeroCard({ entry, pos, posDelta, form, weeklyPts, clubsToday, liveCount, nextMatch }: {
  entry: any; pos: number; posDelta: number; form: string[]
  weeklyPts: number; clubsToday: number; liveCount: number; nextMatch: any
}) {
  return (
    <div
      className="rounded-2xl p-4 mb-5 border overflow-hidden relative"
      style={{
        background: `linear-gradient(135deg, ${entry.player.color}20 0%, var(--bg-card) 55%)`,
        borderColor: `${entry.player.color}35`,
      }}
    >
      {/* Background position number (watermark) */}
      <div
        className="absolute right-3 top-1/2 -translate-y-1/2 font-black text-[80px] leading-none select-none pointer-events-none"
        style={{ color: entry.player.color, opacity: 0.06 }}
      >
        {pos}
      </div>

      <div className="flex items-center gap-3 relative">
        {/* Avatar + position badge */}
        <div className="relative shrink-0">
          <Avatar name={entry.player.name} color={entry.player.color} size="lg" />
          <div
            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-[var(--bg)]"
            style={{ backgroundColor: entry.player.color, color: '#fff' }}
          >
            {pos}
          </div>
        </div>

        {/* Name / form / status */}
        <div className="flex-1 min-w-0">
          <p className="label-caps mb-0.5">Your standing</p>
          <p className="font-bold text-base text-[var(--text-primary)] leading-tight truncate">{entry.player.name}</p>

          {/* Form guide — 5 squares */}
          {form.length > 0 && (
            <div className="flex items-center gap-0.5 mt-1.5">
              {form.map((r, i) => (
                <span
                  key={i}
                  className={`w-3.5 h-3.5 rounded-sm text-[7px] font-bold flex items-center justify-center ${
                    r === 'W' ? 'bg-[var(--green)] text-white' :
                    r === 'D' ? 'bg-[var(--amber)] text-white' :
                    'bg-[var(--red)]/70 text-white'
                  }`}
                >{r}</span>
              ))}
              {posDelta !== 0 && (
                <span className={`ml-1.5 text-[11px] font-bold ${posDelta > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {posDelta > 0 ? `↑${posDelta}` : `↓${Math.abs(posDelta)}`}
                </span>
              )}
            </div>
          )}

          {/* Status line */}
          {clubsToday > 0 && (
            <p className="text-[10px] font-medium mt-1.5" style={{ color: liveCount > 0 ? 'var(--red)' : 'var(--amber)' }}>
              {liveCount > 0 ? '● LIVE' : '⚽'} {clubsToday} club{clubsToday !== 1 ? 's' : ''} {liveCount > 0 ? 'live' : 'today'}
            </p>
          )}
          {clubsToday === 0 && nextMatch?.kickoff_time && (
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
              Next: {nextMatch.home_team?.short_name} vs {nextMatch.away_team?.short_name}{' '}
              <span className="text-[var(--accent)] font-medium">{formatCountdown(nextMatch.kickoff_time)}</span>
            </p>
          )}
        </div>

        {/* Points */}
        <div className="text-right shrink-0">
          <p className="font-black text-2xl text-[var(--text-primary)] leading-none">{entry.totalPoints}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">pts total</p>
          {weeklyPts !== 0 && (
            <p className={`text-[11px] font-bold mt-1 ${weeklyPts > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
              {weeklyPts > 0 ? '+' : ''}{weeklyPts} this wk
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Today fixture card (horizontal scroll) ───────────────────────────────────

function TodayFixtureCard({ fixture, ownerMap, isMine, myPowerUps }: {
  fixture: any; ownerMap: Map<string, any[]>; isMine: boolean; myPowerUps: any[]
}) {
  const isLive = fixture.status === 'live'
  const homeOwners: any[] = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners: any[] = ownerMap.get(fixture.away_team_id) ?? []
  const donActive = myPowerUps.some((p: any) => p.fixture_id === fixture.id && p.power_up_type === 'double_or_nothing')
  const comp = fixture.competition as any

  return (
    <Link href={`/fixtures/${fixture.id}`} className="pressable">
      <div
        className={[
          'w-[160px] rounded-xl border p-3 flex flex-col gap-2',
          isMine
            ? isLive
              ? 'border-[var(--red)]/40 bg-[var(--red)]/5'
              : 'border-[var(--accent)]/35 bg-[var(--accent)]/5'
            : 'border-[var(--border)] bg-[var(--bg-card)]',
        ].join(' ')}
      >
        {/* Competition + time */}
        <div className="flex items-center justify-between gap-1">
          <CompetitionBadge shortName={comp?.short_name} name={comp?.name} type={comp?.competition_type} />
          {isLive ? (
            <span className="text-[9px] font-bold text-[var(--red)] animate-pulse">LIVE</span>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
              {fixture.kickoff_time
                ? new Date(fixture.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </span>
          )}
        </div>

        {/* Home */}
        <div className="flex items-center gap-1.5">
          <TeamCrest team={fixture.home_team} size="xs" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate flex-1">
            {fixture.home_team?.short_name || fixture.home_team?.name}
          </span>
          {isLive && (
            <span className="text-sm font-black text-[var(--text-primary)] tabular-nums ml-auto">{fixture.home_score ?? 0}</span>
          )}
        </div>

        {/* Away */}
        <div className="flex items-center gap-1.5">
          <TeamCrest team={fixture.away_team} size="xs" />
          <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate flex-1">
            {fixture.away_team?.short_name || fixture.away_team?.name}
          </span>
          {isLive && (
            <span className="text-sm font-black text-[var(--text-primary)] tabular-nums ml-auto">{fixture.away_score ?? 0}</span>
          )}
        </div>

        {/* Owners row */}
        {(homeOwners.length > 0 || awayOwners.length > 0) && (
          <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
            <OwnerStack owners={homeOwners} size="xs" max={2} />
            <OwnerStack owners={awayOwners} size="xs" max={2} />
          </div>
        )}

        {donActive && (
          <div className="text-[9px] font-bold text-[var(--accent)] text-center">⚡ D-o-N active</div>
        )}
      </div>
    </Link>
  )
}

// ─── Leaderboard row ──────────────────────────────────────────────────────────

function LeaderboardRow({ entry, position, isMe, posDelta, form, weeklyPts, teams }: {
  entry: any; position: number; isMe: boolean
  posDelta: number; form: string[]; weeklyPts: number; teams: any[]
}) {
  const medals = ['🥇', '🥈', '🥉']
  const posColor = position === 1 ? 'text-amber-400' : position <= 3 ? 'text-slate-300' : 'text-[var(--text-muted)]'
  return (
    <Link href={`/players/${entry.player.id}`}>
      <div className={[
        'flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] last:border-0 min-h-[44px]',
        'hover:bg-[var(--bg-card-hover)] transition-colors',
        isMe ? 'bg-[var(--accent)]/5' : 'bg-[var(--bg-card)]',
      ].join(' ')}>

        {/* Position */}
        <div className="w-6 shrink-0 flex items-center justify-center gap-0.5">
          {position <= 3
            ? <span className="text-sm leading-none">{medals[position - 1]}</span>
            : <span className={`text-[12px] font-bold tabular-nums ${posColor}`}>{position}</span>
          }
          {posDelta > 0 && <span className="text-[7px] font-black text-emerald-400 leading-none">▲</span>}
          {posDelta < 0 && <span className="text-[7px] font-black text-red-400 leading-none">▼</span>}
        </div>

        {/* Avatar */}
        <Avatar name={entry.player.name} color={entry.player.color} size="xs" />

        {/* Name + form */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{entry.player.name}</span>
            {isMe && <span className="text-[8px] text-[var(--accent)] font-bold uppercase shrink-0">You</span>}
          </div>
          {form.length > 0 && (
            <div className="flex items-center gap-[2px] mt-0.5">
              {form.slice(0, 5).map((r, i) => (
                <span
                  key={i}
                  className={`w-[9px] h-[9px] rounded-[2px] ${
                    r === 'W' ? 'bg-emerald-500' : r === 'D' ? 'bg-amber-400' : 'bg-red-500/70'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Club crests */}
        {teams.length > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            {teams.slice(0, 5).map((t: any) => (
              <TeamCrest key={t.id} team={t} size="xs" />
            ))}
          </div>
        )}

        {/* Points */}
        <div className="text-right shrink-0 min-w-[40px]">
          {weeklyPts !== 0 && (
            <div className={`text-[9px] font-bold leading-none mb-0.5 ${weeklyPts > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {weeklyPts > 0 ? '+' : ''}{weeklyPts}
            </div>
          )}
          <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{entry.totalPoints}</span>
          <div className="text-[8px] text-[var(--text-muted)] leading-none">pts</div>
        </div>
      </div>
    </Link>
  )
}

// ─── Live fixture card ────────────────────────────────────────────────────────

function LiveFixtureCard({ fixture, ownerMap }: { fixture: any; ownerMap: Map<string, any[]> }) {
  const homeOwners: any[] = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners: any[] = ownerMap.get(fixture.away_team_id) ?? []
  return (
    <Link href={`/fixtures/${fixture.id}`} className="pressable block">
      <div className="rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <TeamCrest team={fixture.home_team} size="xs" />
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{fixture.home_team?.short_name || fixture.home_team?.name}</span>
            </div>
            <OwnerStack owners={homeOwners} size="xs" max={3} />
          </div>
          <div className="shrink-0 text-center">
            <span className="text-lg font-black text-[var(--text-primary)] tabular-nums">
              {fixture.home_score ?? 0}<span className="text-[var(--text-muted)] mx-0.5">–</span>{fixture.away_score ?? 0}
            </span>
            <div className="text-[9px] text-[var(--red)] font-bold text-center animate-pulse">● LIVE</div>
          </div>
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{fixture.away_team?.short_name || fixture.away_team?.name}</span>
              <TeamCrest team={fixture.away_team} size="xs" />
            </div>
            <div className="flex justify-end">
              <OwnerStack owners={awayOwners} size="xs" max={3} />
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Mini fixture row (for "my clubs this week") ──────────────────────────────

function MiniFixtureRow({ fixture, ownerMap, divider }: { fixture: any; ownerMap: Map<string, any[]>; divider: boolean }) {
  const homeOwners: any[] = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners: any[] = ownerMap.get(fixture.away_team_id) ?? []
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'
  const comp = fixture.competition as any

  return (
    <Link href={`/fixtures/${fixture.id}`} className="pressable block">
      <div className={['flex items-center gap-1.5 px-3 py-2.5 hover:bg-[var(--accent)]/5', divider ? 'border-b border-[var(--border)]' : ''].join(' ')}>
        <CompetitionBadge shortName={comp?.short_name} name={comp?.name} type={comp?.competition_type} className="shrink-0 w-[28px] text-center" />
        <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
          <OwnerStack owners={homeOwners} size="xs" max={1} />
          <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">{fixture.home_team?.short_name || fixture.home_team?.name}</span>
          <TeamCrest team={fixture.home_team} size="xs" />
        </div>
        <div className="shrink-0 w-[52px] text-center">
          {(isCompleted || isLive) ? (
            <span className="font-bold text-[13px] text-[var(--text-primary)] tabular-nums">{fixture.home_score}–{fixture.away_score}</span>
          ) : (
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              {fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'vs'}
            </span>
          )}
          {isLive && <div className="text-[8px] text-[var(--red)] font-bold animate-pulse">LIVE</div>}
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <TeamCrest team={fixture.away_team} size="xs" />
          <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">{fixture.away_team?.short_name || fixture.away_team?.name}</span>
          <OwnerStack owners={awayOwners} size="xs" max={1} />
        </div>
      </div>
    </Link>
  )
}

// ─── Results chart ────────────────────────────────────────────────────────────

function ResultsChart({ standings }: { standings: any[] }) {
  const maxPts = Math.max(...standings.map((s: any) => s.totalPoints), 1)

  return (
    <section className="mb-5">
      <SectionHeader title="Points race" action={<Link href="/standings">Full table →</Link>} />
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-3 space-y-1.5">
        {standings.map((entry: any, idx: number) => {
          const pct = entry.totalPoints > 0 ? (entry.totalPoints / maxPts) * 100 : 0
          const wdl = `${entry.wins}W ${entry.draws}D ${entry.losses}L`
          return (
            <div key={entry.player.id} className="flex items-center gap-2">
              <span className="text-[10px] font-bold tabular-nums text-[var(--text-muted)] w-4 shrink-0 text-center">{idx + 1}</span>
              <span className="text-[11px] font-semibold text-[var(--text-primary)] w-[56px] shrink-0 truncate">{entry.player.name.split(' ')[0]}</span>
              <div className="flex-1 h-[14px] bg-[var(--bg)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max(pct, 1.5)}%`,
                    backgroundColor: entry.player.color,
                    opacity: pct > 0 ? 0.9 : 0.25,
                  }}
                />
              </div>
              <span className="text-[9px] text-[var(--text-muted)] w-[52px] shrink-0 text-right tabular-nums">{wdl}</span>
              <span className="text-[12px] font-black tabular-nums text-[var(--text-primary)] w-[28px] text-right shrink-0">{entry.totalPoints}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  full_time: '⚽',
  giant_killer: '⚔️',
  double_or_nothing: '🎲',
  reverse: '🔄',
  position_change: '📈',
  points_earned: '⭐',
  qualification: '🏆',
  elimination: '❌',
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
  return `in ${Math.floor(hrs / 24)}d`
}

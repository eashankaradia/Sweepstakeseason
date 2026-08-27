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
import { EmptyState, ErrorState } from '@/components/ui/LoadingSpinner'
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
  const [myPowerUps, setMyPowerUps] = useState<any[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [bottomThreshold, setBottomThreshold] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [pullDist, setPullDist] = useState(0)
  const touchStartY = useRef(0)
  const supabase = createClient()

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(false)

    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); setRefreshing(false); return }

    try {

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
      { count: rankedTeamCount },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_scores').select('*').eq('league_id', lg.id),
      supabase.from('player_team_assignments').select('team_id, player_id, players(id,name,color), teams(id,short_name,name,logo_url,primary_color,secondary_color,league_position)').eq('league_id', lg.id),
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
      supabase.from('teams').select('id', { count: 'exact', head: true }).not('league_position', 'is', null),
    ])
    // Bottom-3 bonus rule (matches the sync-results edge function): the
    // bottom 3 league positions currently earn bonus points for a win.
    setBottomThreshold(rankedTeamCount ? rankedTeamCount - 2 : null)

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
    setActivityFeed(((fullActivity ?? []) as any[]).slice(0, 8))
    setLoading(false)
    setRefreshing(false)
    } catch {
      setError(true)
      setLoading(false)
      setRefreshing(false)
    }
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

  if (error) {
    return (
      <AppShell>
        <ErrorState onRetry={() => load()} />
      </AppShell>
    )
  }

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
  const myIdx = myEntry ? standings.indexOf(myEntry) : -1
  const myPos = myIdx >= 0 ? myIdx + 1 : null
  const hasDraft = league.draft_locked || standings.some((s: any) => s.teamCount > 0)
  const rivalAbove = myIdx > 0 ? standings[myIdx - 1] : null
  const rivalBelow = myIdx >= 0 && myIdx < standings.length - 1 ? standings[myIdx + 1] : null

  const myTeamIdsForStakes = myEntry
    ? new Set([...ownerMap.entries()].filter(([, arr]) => arr.some((p: any) => p.id === myEntry.player.id)).map(([id]) => id))
    : new Set<string>()

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

      {/* Matchday header */}
      <MatchdayHeader league={league} liveCount={liveFixtures.length} todayCount={allTodayFixtures.length} weekFixtures={weekFixtures} />

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

      {/* Your position and nearest rivals — one focused race module */}
      {myEntry && myPos && hasDraft && (
        <RivalRaceCard
          myEntry={myEntry}
          myPos={myPos}
          rivalAbove={rivalAbove}
          rivalBelow={rivalBelow}
          posDelta={posChangeMap.get(myEntry.player.id) ?? 0}
          weeklyPts={weeklyPtsMap.get(myEntry.player.id) ?? 0}
          form={formMap.get(myEntry.player.id) ?? []}
        />
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
              <LiveFixtureCard
                key={f.id}
                fixture={f}
                ownerMap={ownerMap}
                implication={computeImplication(f, myTeamIdsForStakes, myEntry, rivalAbove, myPowerUps, bottomThreshold)}
              />
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
                implication={computeImplication(f, myTeamIdsForStakes, myEntry, rivalAbove, myPowerUps, bottomThreshold)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Matchday impact feed */}
      {activityFeed.length > 0 && (
        <section className="mb-5">
          <SectionHeader
            title="Matchday feed"
            action={<Link href="/activity">See all →</Link>}
          />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {activityFeed.map((event: any, i: number) => (
              <ImpactFeedRow key={event.id} event={event} divider={i < activityFeed.length - 1} />
            ))}
          </div>
        </section>
      )}

      {/* Your clubs */}
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
              title="Your clubs"
              action={<Link href="/my-teams">All →</Link>}
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

      {/* Weekly recap — only when nothing is live right now */}
      {liveFixtures.length === 0 && hasDraft && standings.some((s: any) => s.played > 0) && (
        <WeeklyRecapCard standings={standings} weeklyPtsMap={weeklyPtsMap} posChangeMap={posChangeMap} activityFeed={activityFeed} weekFixtures={weekFixtures} todayFixtures={todayFixtures} />
      )}
    </AppShell>
  )
}

// ─── Matchday header ────────────────────────────────────────────────────────

function MatchdayHeader({ league, liveCount, todayCount, weekFixtures }: {
  league: any; liveCount: number; todayCount: number; weekFixtures: any[]
}) {
  let status: React.ReactNode = null
  if (liveCount > 0) {
    status = (
      <span className="flex items-center gap-1.5 text-[var(--red)] font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)] animate-pulse" /> {liveCount} live now
      </span>
    )
  } else if (todayCount > 0) {
    status = <span className="text-[var(--amber)] font-semibold">⚽ {todayCount} game{todayCount !== 1 ? 's' : ''} today</span>
  } else if (weekFixtures[0]?.kickoff_time) {
    status = <span className="text-[var(--text-secondary)]">Next kickoff {formatCountdown(weekFixtures[0].kickoff_time)}</span>
  }

  return (
    <div className="flex items-start justify-between gap-2 mb-5">
      <div className="flex-1 min-w-0">
        <h1 className="font-black text-lg text-[var(--text-primary)] leading-tight truncate">{league.name}</h1>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{league.season}</p>
        {status && <p className="text-xs mt-1">{status}</p>}
      </div>
      <Badge variant={league.status === 'active' ? 'live' : 'warning'} className="shrink-0">
        {league.status === 'active' ? 'Live' : 'Setup'}
      </Badge>
    </div>
  )
}

// ─── Rival race card ──────────────────────────────────────────────────────────

function RivalRaceCard({ myEntry, myPos, rivalAbove, rivalBelow, posDelta, weeklyPts, form }: {
  myEntry: any; myPos: number; rivalAbove: any; rivalBelow: any
  posDelta: number; weeklyPts: number; form: string[]
}) {
  const gapAbove = rivalAbove ? rivalAbove.totalPoints - myEntry.totalPoints : null
  const gapBelow = rivalBelow ? myEntry.totalPoints - rivalBelow.totalPoints : null
  const oneResultAway = gapAbove != null && gapAbove > 0 && gapAbove <= 3

  const contextLines: string[] = []
  if (rivalAbove && gapAbove! > 0) contextLines.push(`${gapAbove} pt${gapAbove === 1 ? '' : 's'} behind ${firstName(rivalAbove.player.name)}`)
  if (posDelta > 0) contextLines.push(`You climbed ${posDelta} place${posDelta === 1 ? '' : 's'} this matchday`)
  else if (posDelta < 0) contextLines.push(`You dropped ${Math.abs(posDelta)} place${Math.abs(posDelta) === 1 ? '' : 's'} this matchday`)

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] mb-5 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar name={myEntry.player.name} color={myEntry.player.color} size="lg" />
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-[var(--bg)]"
              style={{ backgroundColor: myEntry.player.color, color: '#fff' }}
            >
              {myPos}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="label-caps mb-0.5">Your standing</p>
            <p className="font-bold text-base text-[var(--text-primary)] leading-tight truncate">{myEntry.player.name}</p>
            {form.length > 0 && (
              <div className="flex items-center gap-0.5 mt-1">
                {form.map((r, i) => (
                  <span
                    key={i}
                    className={`w-3.5 h-3.5 rounded-sm text-[7px] font-bold flex items-center justify-center ${
                      r === 'W' ? 'bg-[var(--green)] text-white' : r === 'D' ? 'bg-[var(--amber)] text-white' : 'bg-[var(--red)]/70 text-white'
                    }`}
                  >{r}</span>
                ))}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-black text-2xl text-[var(--text-primary)] leading-none tabular-nums">{myEntry.totalPoints}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">pts total</p>
            {weeklyPts !== 0 && (
              <p className={`text-[11px] font-bold mt-1 ${weeklyPts > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                {weeklyPts > 0 ? '+' : ''}{weeklyPts} this wk
              </p>
            )}
          </div>
        </div>

        {contextLines.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-0.5">
            {contextLines.map((line, i) => (
              <p key={i} className="text-xs text-[var(--text-secondary)]">{line}</p>
            ))}
          </div>
        )}

        {oneResultAway && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
            🔥 One result from overtaking {firstName(rivalAbove.player.name)}
          </div>
        )}
      </div>

      {(rivalAbove || rivalBelow) && (
        <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
          {rivalAbove && <RivalRow entry={rivalAbove} gap={gapAbove!} direction="above" />}
          {rivalBelow && <RivalRow entry={rivalBelow} gap={gapBelow!} direction="below" />}
        </div>
      )}

      <Link href="/standings" className="block text-center text-xs font-medium text-[var(--accent)] py-2.5 border-t border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors">
        Full standings →
      </Link>
    </div>
  )
}

function RivalRow({ entry, gap, direction }: { entry: any; gap: number; direction: 'above' | 'below' }) {
  return (
    <Link href={`/players/${entry.player.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--bg-card-hover)] transition-colors">
      <span className="text-xs text-[var(--text-muted)] w-4 shrink-0 text-center">{direction === 'above' ? '↑' : '↓'}</span>
      <Avatar name={entry.player.name} color={entry.player.color} size="xs" />
      <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{entry.player.name}</span>
      <span className="text-xs text-[var(--text-muted)] shrink-0">{gap} pt{gap === 1 ? '' : 's'} {direction === 'above' ? 'ahead' : 'behind'}</span>
    </Link>
  )
}

// ─── Fixture implication helper ───────────────────────────────────────────────

type Implication = { line: string; isPositive: boolean; giantKiller: boolean; donActive: boolean } | null

function computeImplication(
  fixture: any,
  myTeamIds: Set<string>,
  myEntry: any,
  rivalAbove: any,
  myPowerUps: any[],
  bottomThreshold: number | null,
): Implication {
  const isHome = myTeamIds.has(fixture.home_team_id)
  const isAway = myTeamIds.has(fixture.away_team_id)
  if (!isHome && !isAway) return null

  const myTeam = isHome ? fixture.home_team : fixture.away_team
  const donActive = myPowerUps.some((p: any) => p.fixture_id === fixture.id && p.power_up_type === 'double_or_nothing' && p.team_id === myTeam?.id)
  const winPts = donActive ? 6 : 3
  const giantKiller = !!(myTeam?.league_position != null && bottomThreshold != null && bottomThreshold > 0 && myTeam.league_position >= bottomThreshold)

  let line = `Win: +${winPts} pt${winPts === 1 ? '' : 's'}`
  let isPositive = true

  if (myEntry && rivalAbove) {
    const afterWin = myEntry.totalPoints + winPts
    if (afterWin > rivalAbove.totalPoints) {
      line = `A win moves you above ${firstName(rivalAbove.player.name)}`
    }
  }

  if (fixture.status === 'live') {
    const myScore = isHome ? fixture.home_score : fixture.away_score
    const oppScore = isHome ? fixture.away_score : fixture.home_score
    if (myScore != null && oppScore != null) {
      if (myScore > oppScore) { line = `Winning — ${winPts} pts if it holds`; isPositive = true }
      else if (myScore < oppScore) { line = donActive ? 'Losing — -3 pts if it holds (D-o-N)' : 'Losing — 0 pts if it holds'; isPositive = false }
      else { line = `Drawing — ${donActive ? '-1' : '+1'} pt if it holds`; isPositive = !donActive }
    }
  }

  return { line, isPositive, giantKiller, donActive }
}

function firstName(name: string): string {
  return name.split(' ')[0]
}

// ─── Today fixture card (horizontal scroll) ───────────────────────────────────

function TodayFixtureCard({ fixture, ownerMap, isMine, implication }: {
  fixture: any; ownerMap: Map<string, any[]>; isMine: boolean; implication: Implication
}) {
  const isLive = fixture.status === 'live'
  const homeOwners: any[] = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners: any[] = ownerMap.get(fixture.away_team_id) ?? []
  const comp = fixture.competition as any

  return (
    <Link href={`/fixtures/${fixture.id}`} className="pressable">
      <div
        className={[
          'w-[168px] rounded-xl border p-3 flex flex-col gap-2',
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

        {implication && (
          <div className={`text-[9px] font-bold text-center leading-tight ${implication.isPositive ? 'text-[var(--accent)]' : 'text-[var(--red)]'}`}>
            {implication.giantKiller && '⚔️ '}{implication.line}
          </div>
        )}
      </div>
    </Link>
  )
}

// ─── Matchday impact feed row ─────────────────────────────────────────────────

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

const HIGHLIGHT_EVENTS = new Set(['giant_killer', 'double_or_nothing', 'reverse'])

function ImpactFeedRow({ event, divider }: { event: any; divider: boolean }) {
  const highlighted = HIGHLIGHT_EVENTS.has(event.event_type)
  return (
    <div
      className={[
        'px-3 py-2.5 flex items-start gap-2.5',
        divider ? 'border-b border-[var(--border)]' : '',
        highlighted ? 'bg-[var(--accent)]/5 border-l-2 border-l-[var(--accent)]' : '',
      ].join(' ')}
    >
      <span className={highlighted ? 'text-base shrink-0 mt-0.5' : 'text-sm shrink-0 mt-0.5'}>{EVENT_ICONS[event.event_type] ?? '📢'}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs text-[var(--text-primary)] leading-snug ${highlighted ? 'font-semibold' : 'font-medium'}`}>{event.title}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{formatRelativeTime(event.created_at)}</p>
      </div>
      {event.points_delta != null && event.points_delta !== 0 && (
        <span className={`text-xs font-bold shrink-0 ${event.points_delta > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          {event.points_delta > 0 ? '+' : ''}{event.points_delta}
        </span>
      )}
    </div>
  )
}

// ─── Live fixture card ────────────────────────────────────────────────────────

function LiveFixtureCard({ fixture, ownerMap, implication }: { fixture: any; ownerMap: Map<string, any[]>; implication: Implication }) {
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
        {implication && (
          <div className={`text-[10px] font-bold text-center mt-2 pt-2 border-t border-[var(--red)]/20 ${implication.isPositive ? 'text-[var(--accent)]' : 'text-[var(--red)]'}`}>
            {implication.giantKiller && '⚔️ Giant Killer — '}{implication.line}
          </div>
        )}
      </div>
    </Link>
  )
}

// ─── Mini fixture row (for "Your clubs") ──────────────────────────────────────

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

// ─── Weekly recap ─────────────────────────────────────────────────────────────

function WeeklyRecapCard({ standings, weeklyPtsMap, posChangeMap, activityFeed, weekFixtures, todayFixtures }: {
  standings: any[]; weeklyPtsMap: Map<string, number>; posChangeMap: Map<string, number>
  activityFeed: any[]; weekFixtures: any[]; todayFixtures: any[]
}) {
  let biggestGain: { name: string; pts: number } | null = null
  let roughest: { name: string; pts: number } | null = null
  for (const s of standings) {
    const pts = weeklyPtsMap.get(s.player.id) ?? 0
    if (pts > 0 && (!biggestGain || pts > biggestGain.pts)) biggestGain = { name: s.player.name, pts }
    if (pts < 0 && (!roughest || pts < roughest.pts)) roughest = { name: s.player.name, pts }
  }

  let biggestMove: { name: string; delta: number } | null = null
  for (const s of standings) {
    const delta = posChangeMap.get(s.player.id) ?? 0
    if (Math.abs(delta) > 0 && (!biggestMove || Math.abs(delta) > Math.abs(biggestMove.delta))) biggestMove = { name: s.player.name, delta }
  }

  const upset = activityFeed.find(e => e.event_type === 'giant_killer')
  const leader = standings[0]
  const nextFixture = [...todayFixtures, ...weekFixtures].sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())[0]

  const rows: { icon: string; label: string; value: string }[] = []
  if (biggestGain) rows.push({ icon: '📈', label: 'Biggest gain', value: `${biggestGain.name} +${biggestGain.pts} pts` })
  if (biggestMove && biggestMove.delta > 0) rows.push({ icon: '🚀', label: 'Biggest climb', value: `${biggestMove.name} up ${biggestMove.delta}` })
  if (upset) rows.push({ icon: '⚔️', label: 'Biggest upset', value: upset.title })
  if (roughest) rows.push({ icon: '💀', label: 'Roughest week', value: `${roughest.name} ${roughest.pts} pts` })
  if (leader) rows.push({ icon: '👑', label: 'Current leader', value: `${leader.player.name} · ${leader.totalPoints} pts` })
  if (nextFixture) {
    rows.push({
      icon: '⏭️',
      label: 'Next up',
      value: `${nextFixture.home_team?.short_name || nextFixture.home_team?.name} vs ${nextFixture.away_team?.short_name || nextFixture.away_team?.name} — ${formatCountdown(nextFixture.kickoff_time)}`,
    })
  }

  if (rows.length === 0) return null

  return (
    <section className="mb-5">
      <SectionHeader title="Weekly recap" />
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        {rows.map((r, i) => (
          <div key={i} className={`flex items-center gap-2.5 px-3 py-2.5 ${i < rows.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
            <span className="text-sm shrink-0">{r.icon}</span>
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide w-20 shrink-0">{r.label}</span>
            <span className="text-xs text-[var(--text-primary)] font-medium truncate">{r.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

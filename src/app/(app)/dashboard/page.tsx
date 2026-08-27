'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { OwnerStack } from '@/components/ui/OwnerStack'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/LoadingSpinner'
import { computeStandingsAsOf, giantKillerEligibility, type TeamRank } from '@/lib/giantKiller'
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
  const [myTeams, setMyTeams] = useState<any[]>([])
  const [myTeamPoints, setMyTeamPoints] = useState<Map<string, number>>(new Map())
  const [myTeamUpcoming, setMyTeamUpcoming] = useState<Map<string, any[]>>(new Map())
  const [powerUpFeed, setPowerUpFeed] = useState<any[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [gkTeamIds, setGkTeamIds] = useState<string[]>([])
  const [gkFixtures, setGkFixtures] = useState<any[]>([])
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
      { data: teamScores },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_scores').select('*').eq('league_id', lg.id),
      supabase.from('player_team_assignments').select('team_id, player_id, players(id,name,color), teams(id,short_name,name,logo_url,primary_color,secondary_color,league_position)').eq('league_id', lg.id),
      supabase.from('fixtures')
        .select('*, home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
        .eq('league_id', lg.id).eq('status', 'live'),
      supabase.from('fixtures')
        .select('*, home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
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
        .select('*, home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
        .eq('league_id', lg.id).eq('status', 'scheduled')
        .gte('kickoff_time', `${tomorrowStr}T00:00:00`)
        .lte('kickoff_time', `${weekEndStr}T23:59:59`)
        .order('kickoff_time')
        .limit(30),
      supabase.from('team_scores').select('team_id, total_points').eq('league_id', lg.id),
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

    // Points earned per team so far
    const ptsMap = new Map<string, number>()
    for (const ts of (teamScores ?? []) as any[]) {
      ptsMap.set(ts.team_id, (ptsMap.get(ts.team_id) ?? 0) + (ts.total_points ?? 0))
    }
    setMyTeamPoints(ptsMap)

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
      const myTeamsForPlayer = (assignments ?? []).filter((a: any) => a.player_id === p.id)
      return {
        player: p,
        totalPoints: score?.total_points ?? 0,
        wins: score?.wins ?? 0,
        draws: score?.draws ?? 0,
        losses: score?.losses ?? 0,
        played: score?.matches_played ?? 0,
        bonusPoints: score?.bonus_points ?? 0,
        teamCount: myTeamsForPlayer.length,
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

    let myPlayer: any = null
    if (uid) {
      myPlayer = (players ?? []).find((p: any) => p.user_id === uid)
      if (myPlayer) {
        const mine = playerTeamsMap.get(myPlayer.id) ?? []
        setMyTeams(mine)

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

        if (mine.length > 0) {
          const myTeamIds = mine.map((t: any) => t.id)
          const orClause = myTeamIds.map((id: string) => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(',')
          const { data: upcoming } = await supabase
            .from('fixtures')
            .select('*, home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
            .eq('league_id', lg.id)
            .eq('status', 'scheduled')
            .or(orClause)
            .order('kickoff_time', { ascending: true })
            .limit(150)
          const byTeam = new Map<string, any[]>()
          for (const f of (upcoming ?? []) as any[]) {
            for (const tid of myTeamIds) {
              if (f.home_team_id !== tid && f.away_team_id !== tid) continue
              const arr = byTeam.get(tid) ?? []
              if (arr.length < 5) arr.push(f)
              byTeam.set(tid, arr)
            }
          }
          setMyTeamUpcoming(byTeam)
        } else {
          setMyTeamUpcoming(new Map())
        }
      } else {
        setMyTeams([])
        setMyTeamUpcoming(new Map())
      }
    }

    // Power-up feed: Double or Nothing is visible to everyone at all times
    // (including future locked-in picks). Reverse only becomes visible once
    // the match it targeted has resolved (status flips pending -> applied),
    // so nobody finds out beforehand who's been targeted.
    const { data: pupFeed } = await supabase
      .from('power_up_activations')
      .select('*, players(name,color), target:target_player_id(name,color), teams(name,short_name,logo_url), fixtures(kickoff_time,status)')
      .eq('league_id', lg.id)
      .order('activated_at', { ascending: false })
      .limit(60)
    setPowerUpFeed(((pupFeed ?? []) as any[]).filter(p => p.power_up_type === 'double_or_nothing' || p.status === 'applied'))

    // Giant Killer eligibility data: real table position computed from our
    // own completed results (see src/lib/giantKiller.ts), not the stale
    // teams.league_position field.
    const anyFixture = (live ?? [])[0] ?? (todayFix ?? [])[0]
    if (anyFixture) {
      const [{ data: compTeams }, { data: compFixtures }] = await Promise.all([
        supabase.from('team_competitions').select('team_id').eq('competition_id', anyFixture.competition_id),
        supabase.from('fixtures')
          .select('home_team_id, away_team_id, home_score, away_score, kickoff_time, status')
          .eq('competition_id', anyFixture.competition_id)
          .eq('status', 'completed'),
      ])
      setGkTeamIds([...new Set((compTeams ?? []).map((r: any) => r.team_id))] as string[])
      setGkFixtures((compFixtures ?? []) as any[])
    } else {
      setGkTeamIds([])
      setGkFixtures([])
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

  const myTeamIdsForStakes = myEntry
    ? new Set([...ownerMap.entries()].filter(([, arr]) => arr.some((p: any) => p.id === myEntry.player.id)).map(([id]) => id))
    : new Set<string>()

  const allTodayFixtures = [...liveFixtures, ...todayFixtures]

  const gkRankCache = new Map<string, Map<string, TeamRank> | null>()
  function gkRanksBefore(kickoff: string | null) {
    if (!kickoff) return null
    if (!gkRankCache.has(kickoff)) gkRankCache.set(kickoff, computeStandingsAsOf(gkTeamIds, gkFixtures, kickoff))
    return gkRankCache.get(kickoff) ?? null
  }

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

      {/* Your clubs — crest strip */}
      {hasDraft && myTeams.length > 0 && <TeamCrestStrip teams={myTeams} />}

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

      {/* Your standing */}
      {myEntry && myPos && hasDraft && (
        <YourStandingCard
          myEntry={myEntry}
          myPos={myPos}
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
                implication={computeImplication(f, myTeamIdsForStakes, myPowerUps, gkRanksBefore(f.kickoff_time))}
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
                implication={computeImplication(f, myTeamIdsForStakes, myPowerUps, gkRanksBefore(f.kickoff_time))}
              />
            ))}
          </div>
        </section>
      )}

      {/* Your clubs' next fixtures */}
      {hasDraft && myTeams.length > 0 && (
        <section className="mb-5">
          <SectionHeader title="Your clubs' next fixtures" action={<Link href="/my-teams">All →</Link>} />
          <div className="space-y-3">
            {myTeams.map(team => (
              <MyTeamFixtureRow
                key={team.id}
                team={team}
                points={myTeamPoints.get(team.id) ?? 0}
                fixtures={myTeamUpcoming.get(team.id) ?? []}
                ownerMap={ownerMap}
              />
            ))}
          </div>
        </section>
      )}

      {/* Power-ups feed */}
      {powerUpFeed.length > 0 && (
        <section className="mb-5">
          <SectionHeader title="Power-ups" />
          <PowerUpsFeed activations={powerUpFeed} />
        </section>
      )}

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
    <div className="flex items-start justify-between gap-2 mb-4">
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

// ─── Team crest strip ──────────────────────────────────────────────────────────

function TeamCrestStrip({ teams }: { teams: any[] }) {
  const many = teams.length > 7
  return (
    <div className={`mb-5 ${many ? 'scroll-x -mx-4 px-4 flex gap-3' : 'flex items-center justify-between'}`}>
      {teams.map(team => (
        <Link
          key={team.id}
          href={`/teams/${team.id}`}
          className={`pressable flex flex-col items-center gap-1 ${many ? 'shrink-0 w-14' : 'flex-1'}`}
          title={team.name}
        >
          <div className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border)]">
            <TeamCrest team={team} size="md" />
          </div>
          <span className="text-[9px] text-[var(--text-secondary)] text-center truncate w-full">
            {team.short_name || team.name}
          </span>
        </Link>
      ))}
    </div>
  )
}

// ─── Your standing card ─────────────────────────────────────────────────────────

function YourStandingCard({ myEntry, myPos, posDelta, weeklyPts, form }: {
  myEntry: any; myPos: number
  posDelta: number; weeklyPts: number; form: string[]
}) {
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

        {posDelta !== 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text-secondary)]">
              {posDelta > 0
                ? `You climbed ${posDelta} place${posDelta === 1 ? '' : 's'} this matchday`
                : `You dropped ${Math.abs(posDelta)} place${Math.abs(posDelta) === 1 ? '' : 's'} this matchday`}
            </p>
          </div>
        )}
      </div>

      <Link href="/standings" className="block text-center text-xs font-medium text-[var(--accent)] py-2.5 border-t border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors">
        Full standings →
      </Link>
    </div>
  )
}

// ─── Fixture implication helper ───────────────────────────────────────────────

type Implication = { line: string; isPositive: boolean; giantKiller: boolean; donActive: boolean } | null

function computeImplication(
  fixture: any,
  myTeamIds: Set<string>,
  myPowerUps: any[],
  gkRanks: Map<string, TeamRank> | null,
): Implication {
  const isHome = myTeamIds.has(fixture.home_team_id)
  const isAway = myTeamIds.has(fixture.away_team_id)
  if (!isHome && !isAway) return null

  const myTeam = isHome ? fixture.home_team : fixture.away_team
  const donActive = myPowerUps.some((p: any) => p.fixture_id === fixture.id && p.power_up_type === 'double_or_nothing' && p.team_id === myTeam?.id)
  const winPts = donActive ? 6 : 3
  const { eligible, bottomTeamId } = giantKillerEligibility(fixture.home_team_id, fixture.away_team_id, gkRanks)
  const giantKiller = eligible && bottomTeamId === myTeam?.id

  let line = `Win: +${winPts} pt${winPts === 1 ? '' : 's'}`
  let isPositive = true

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

// ─── Today fixture card (horizontal scroll) ───────────────────────────────────

function TodayFixtureCard({ fixture, ownerMap, isMine, implication }: {
  fixture: any; ownerMap: Map<string, any[]>; isMine: boolean; implication: Implication
}) {
  const isLive = fixture.status === 'live'
  const homeOwners: any[] = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners: any[] = ownerMap.get(fixture.away_team_id) ?? []

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
        {/* Time */}
        <div className="flex items-center justify-end gap-1">
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

// ─── Your clubs' next fixtures ────────────────────────────────────────────────

function CrestWithOwnerBadge({ team, ownerMap }: { team: any; ownerMap: Map<string, any[]> }) {
  const owners: any[] = ownerMap.get(team?.id) ?? []
  const owner = owners[0]
  const initials = owner ? owner.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() : null
  return (
    <div className="relative shrink-0">
      <TeamCrest team={team} size="sm" />
      {initials && (
        <span
          className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[6px] font-black border border-[var(--bg-card)] leading-none"
          style={{ backgroundColor: owner.color, color: '#fff' }}
          title={owner.name}
        >
          {initials}
        </span>
      )}
    </div>
  )
}

function MyTeamFixtureRow({ team, points, fixtures, ownerMap }: {
  team: any; points: number; fixtures: any[]; ownerMap: Map<string, any[]>
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[var(--border)]">
        <TeamCrest team={team} size="sm" />
        <span className="text-sm font-semibold text-[var(--text-primary)] flex-1 truncate">{team.name}</span>
        <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums">{points}</span>
        <span className="text-[9px] text-[var(--text-muted)]">pts for you</span>
      </div>
      {fixtures.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)] px-3 py-2.5">No upcoming fixtures scheduled yet</p>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5 overflow-x-auto">
          {fixtures.map(f => {
            const opponent = f.home_team_id === team.id ? f.away_team : f.home_team
            return (
              <Link key={f.id} href={`/fixtures/${f.id}`} className="pressable flex flex-col items-center gap-1 shrink-0 w-12">
                <CrestWithOwnerBadge team={opponent} ownerMap={ownerMap} />
                <span className="text-[8px] text-[var(--text-muted)] text-center">
                  {f.kickoff_time ? new Date(f.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Power-ups feed ───────────────────────────────────────────────────────────

function PowerUpsFeed({ activations }: { activations: any[] }) {
  // Group Double or Nothing rows by (player, team, month) into one card each
  // since a single activation covers every fixture in that month.
  type Group = { key: string; type: 'don'; player: any; team: any; month: string; total: number; applied: number; result: 'ahead' | 'behind' | 'even' | 'pending' }
  const donGroups = new Map<string, Group>()
  const reverseRows: any[] = []

  for (const a of activations) {
    if (a.power_up_type === 'double_or_nothing') {
      const key = `${a.player_id}-${a.team_id}-${a.season_month}`
      const g = donGroups.get(key) ?? { key, type: 'don', player: a.players, team: a.teams, month: a.season_month, total: 0, applied: 0, result: 'pending' }
      g.total++
      if (a.status === 'applied') {
        g.applied++
        if (a.points_delta > 0) g.result = g.result === 'behind' ? 'even' : 'ahead'
        else if (a.points_delta < 0) g.result = g.result === 'ahead' ? 'even' : 'behind'
      }
      donGroups.set(key, g)
    } else if (a.power_up_type === 'reverse' && a.status === 'applied') {
      reverseRows.push(a)
    }
  }

  const items = [...donGroups.values(), ...reverseRows.map(r => ({ ...r, type: 'reverse' as const }))]
  if (items.length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {items.map((item: any, i) => (
        <div key={item.type === 'don' ? item.key : item.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${i < items.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
          <span className="text-base shrink-0">{item.type === 'don' ? '🎲' : '🔄'}</span>
          <div className="flex-1 min-w-0">
            {item.type === 'don' ? (
              <>
                <p className="text-xs text-[var(--text-primary)] font-medium leading-snug">
                  {item.player?.name} doubled {item.team?.short_name || item.team?.name} for {formatMonthLabel(item.month)}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {item.applied}/{item.total} games played
                  {item.applied > 0 && item.result !== 'pending' && item.result !== 'even' && (
                    <span className={item.result === 'ahead' ? 'text-[var(--green)]' : 'text-[var(--red)]'}> · {item.result === 'ahead' ? 'paying off' : 'backfiring'}</span>
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-[var(--text-primary)] font-medium leading-snug">
                  {item.players?.name} used Reverse on {item.target?.name}&apos;s {item.teams?.short_name || item.teams?.name}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Revealed after full time</p>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function formatMonthLabel(ym: string): string {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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

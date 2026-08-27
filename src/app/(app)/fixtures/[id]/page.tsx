'use client'
import { useState, useEffect, useCallback, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { PageLoader, EmptyState, ErrorState } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/lib/utils'
import { computeStandingsAsOf, giantKillerEligibility, type TeamRank } from '@/lib/giantKiller'

type Player = { id: string; name: string; color: string }
type MatchEvent = {
  minute: string
  type: 'goal' | 'own_goal' | 'yellow_card' | 'red_card' | 'substitution' | 'var' | 'other'
  text: string
  isHome: boolean | null
}

export default function MatchCentrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [fixture, setFixture] = useState<any>(null)
  const [homeOwner, setHomeOwner] = useState<Player[]>([])
  const [awayOwner, setAwayOwner] = useState<Player[]>([])
  const [homeScore, setHomeScore] = useState<any>(null)
  const [awayScore, setAwayScore] = useState<any>(null)
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([])
  const [h2h, setH2h] = useState<any[]>([])
  const [homeInsights, setHomeInsights] = useState<{ standing: any; elo: any } | null>(null)
  const [awayInsights, setAwayInsights] = useState<{ standing: any; elo: any } | null>(null)
  const [powerUps, setPowerUps] = useState<any[]>([])
  const [allOwners, setAllOwners] = useState<Map<string, Player>>(new Map())
  const [allPlayerScores, setAllPlayerScores] = useState<Map<string, number>>(new Map())
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [gkRanks, setGkRanks] = useState<Map<string, TeamRank> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const supabase = createClient()

  const loadFixture = useCallback(async () => {
    setLoading(true)
    setError(false)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    try {

    const { data: fix } = await supabase
      .from('fixtures')
      .select('*, home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
      .eq('id', id)
      .maybeSingle()

    if (!fix) { setLoading(false); return }
    setFixture(fix)

    const { data: authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id

    const [{ data: assignments }, { data: pups }, { data: players }, { data: playerScores }] = await Promise.all([
      supabase.from('player_team_assignments')
        .select('team_id, players(id,name,color)')
        .eq('league_id', fix.league_id),
      supabase.from('power_up_activations')
        .select('*, players(name,color)')
        .eq('fixture_id', id)
        .eq('status', 'pending'),
      supabase.from('players').select('id,name,color,user_id').eq('league_id', fix.league_id),
      supabase.from('player_scores').select('player_id, total_points').eq('league_id', fix.league_id),
    ])

    if (uid) {
      const myPlayer = (players ?? []).find((p: any) => p.user_id === uid)
      setMyPlayerId(myPlayer?.id ?? null)
    }

    const aMap = new Map<string, Player[]>()
    for (const a of (assignments ?? []) as any[]) {
      if (a.players && a.team_id) {
        const arr = aMap.get(a.team_id) ?? []
        arr.push(a.players)
        aMap.set(a.team_id, arr)
      }
    }
    setHomeOwner(aMap.get(fix.home_team_id) ?? [])
    setAwayOwner(aMap.get(fix.away_team_id) ?? [])
    setPowerUps(pups ?? [])

    // Map player_id → player for standings projection
    const pMap = new Map((players ?? []).map((p: any) => [p.id, p]))
    setAllOwners(pMap)

    const psMap = new Map((playerScores ?? []).map((ps: any) => [ps.player_id, ps.total_points as number]))
    setAllPlayerScores(psMap)

    const [{ data: hs }, { data: as_ }, { data: h2hFixtures }] = await Promise.all([
      supabase.from('team_scores').select('*').eq('league_id', fix.league_id).eq('team_id', fix.home_team_id).maybeSingle(),
      supabase.from('team_scores').select('*').eq('league_id', fix.league_id).eq('team_id', fix.away_team_id).maybeSingle(),
      supabase.from('fixtures')
        .select('id, home_team_id, away_team_id, home_score, away_score, kickoff_time')
        .eq('league_id', fix.league_id)
        .eq('status', 'completed')
        .neq('id', id)
        .or(`and(home_team_id.eq.${fix.home_team_id},away_team_id.eq.${fix.away_team_id}),and(home_team_id.eq.${fix.away_team_id},away_team_id.eq.${fix.home_team_id})`)
        .order('kickoff_time', { ascending: false })
        .limit(10),
    ])
    setHomeScore(hs)
    setAwayScore(as_)
    setH2h(h2hFixtures ?? [])

    if (fix.kickoff_time) {
      const [{ data: compTeams }, { data: compFixtures }] = await Promise.all([
        supabase.from('team_competitions').select('team_id').eq('competition_id', fix.competition_id),
        supabase.from('fixtures')
          .select('home_team_id, away_team_id, home_score, away_score, kickoff_time, status')
          .eq('competition_id', fix.competition_id)
          .eq('status', 'completed'),
      ])
      const teamIds = [...new Set((compTeams ?? []).map((r: any) => r.team_id))] as string[]
      setGkRanks(computeStandingsAsOf(teamIds, (compFixtures ?? []) as any[], fix.kickoff_time))
    }

    setLoading(false)

    if (fix.status === 'completed') {
      fetchEvents(id)
    } else {
      fetchMatchup(fix.home_team_id, fix.away_team_id)
    }
    } catch {
      setError(true)
      setLoading(false)
    }
  }, [id])

  const fetchEvents = async (fixtureId: string) => {
    try {
      const res = await fetch(`/api/fixtures/${fixtureId}/events`)
      if (!res.ok) return
      const { events } = await res.json()
      setMatchEvents(parseBbsEvents(events ?? []))
    } catch { /* ignore */ }
  }

  const fetchMatchup = async (homeTeamId: string, awayTeamId: string) => {
    try {
      const [h, a] = await Promise.all([
        fetch(`/api/teams/${homeTeamId}/insights`).then(r => r.ok ? r.json() : null),
        fetch(`/api/teams/${awayTeamId}/insights`).then(r => r.ok ? r.json() : null),
      ])
      setHomeInsights(h)
      setAwayInsights(a)
    } catch { /* ignore */ }
  }

  useEffect(() => { loadFixture() }, [loadFixture])

  if (loading) return <AppShell title="Match" backHref="/fixtures"><PageLoader /></AppShell>
  if (error) return <AppShell title="Match" backHref="/fixtures"><ErrorState onRetry={loadFixture} /></AppShell>
  if (!fixture) return <AppShell title="Match" backHref="/fixtures"><EmptyState icon="⚽" title="Match not found" /></AppShell>

  const isLive = fixture.status === 'live'
  const isCompleted = fixture.status === 'completed'
  const isUpcoming = !isLive && !isCompleted

  // Points this fixture awards
  const hScore = isCompleted || isLive ? (fixture.home_score ?? 0) : null
  const aScore = isCompleted || isLive ? (fixture.away_score ?? 0) : null
  const homePts = hScore != null && aScore != null ? (hScore > aScore ? 3 : hScore === aScore ? 1 : 0) : null
  const awayPts = hScore != null && aScore != null ? (aScore > hScore ? 3 : hScore === aScore ? 1 : 0) : null

  const hasOdds = fixture.home_odds != null || fixture.draw_odds != null || fixture.away_odds != null

  // Power-up projections
  const homeDon = powerUps.find(p => p.power_up_type === 'double_or_nothing' && p.team_id === fixture.home_team_id)
  const awayDon = powerUps.find(p => p.power_up_type === 'double_or_nothing' && p.team_id === fixture.away_team_id)
  const homeReverse = powerUps.find(p => p.power_up_type === 'reverse' && p.team_id === fixture.home_team_id)
  const awayReverse = powerUps.find(p => p.power_up_type === 'reverse' && p.team_id === fixture.away_team_id)

  return (
    <AppShell title="Match Centre" backHref="/fixtures">
      {/* Match meta */}
      <div className="flex items-center gap-2 mb-3">
        {fixture.round && <span className="text-[10px] text-[var(--text-muted)]">{fixture.round}</span>}
        {fixture.matchday && <span className="text-[10px] text-[var(--text-muted)]">MD{fixture.matchday}</span>}
        {isLive && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <Badge variant="danger" className="text-[9px]">LIVE</Badge>
          </div>
        )}
        {!isLive && (
          <span className="text-[10px] text-[var(--text-muted)] ml-auto">
            {fixture.kickoff_time ? formatDateTime(fixture.kickoff_time) : '—'}
          </span>
        )}
      </div>

      {/* Score card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
        <div className="flex items-center gap-3">
          {/* Home */}
          <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
            <TeamCrest team={fixture.home_team} size="lg" />
            <span className="text-sm font-semibold text-[var(--text-primary)] text-center leading-tight">
              {fixture.home_team?.name}
            </span>
            {homeOwner.length > 0 && (
              <div className="flex flex-col items-center gap-0.5">
                {homeOwner.map(o => (
                  <div key={o.id} className="flex items-center gap-1">
                    <Avatar name={o.name} color={o.color} size="sm" />
                    <span className="text-[10px] text-[var(--text-secondary)]">{o.name}</span>
                  </div>
                ))}
              </div>
            )}
            {homePts != null && (
              <ProjectedPoints pts={projectedPtsWithDon(homePts, homeDon)} raw={homePts} hasDon={!!homeDon} />
            )}
          </div>

          {/* Score */}
          <div className="shrink-0 text-center px-2">
            {(isCompleted || isLive) ? (
              <div className="font-display text-4xl font-black text-[var(--text-primary)] tabular-nums">
                {fixture.home_score ?? '–'}<span className="text-[var(--text-muted)] mx-1">:</span>{fixture.away_score ?? '–'}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-[var(--text-muted)]">vs</span>
                {fixture.kickoff_time && (
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {new Date(fixture.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}
            {isCompleted && <div className="text-[9px] text-[var(--text-muted)] mt-1">FT</div>}
          </div>

          {/* Away */}
          <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
            <TeamCrest team={fixture.away_team} size="lg" />
            <span className="text-sm font-semibold text-[var(--text-primary)] text-center leading-tight">
              {fixture.away_team?.name}
            </span>
            {awayOwner.length > 0 && (
              <div className="flex flex-col items-center gap-0.5">
                {awayOwner.map(o => (
                  <div key={o.id} className="flex items-center gap-1">
                    <Avatar name={o.name} color={o.color} size="sm" />
                    <span className="text-[10px] text-[var(--text-secondary)]">{o.name}</span>
                  </div>
                ))}
              </div>
            )}
            {awayPts != null && (
              <ProjectedPoints pts={projectedPtsWithDon(awayPts, awayDon)} raw={awayPts} hasDon={!!awayDon} />
            )}
          </div>
        </div>

        {/* Power-up indicators row — Double or Nothing only. Reverse stays
            hidden until the match completes and it resolves to "applied",
            so nobody finds out who's been targeted beforehand. */}
        {powerUps.filter((pu: any) => pu.power_up_type === 'double_or_nothing').length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-1.5">
            {powerUps.filter((pu: any) => pu.power_up_type === 'double_or_nothing').map((pu: any) => (
              <div key={pu.id} className="flex items-center gap-1 text-[10px] bg-[var(--accent)]/10 text-[var(--accent)] px-2 py-0.5 rounded-full">
                <span>🎲</span>
                <span className="font-medium">{pu.players?.name}</span>
                <span className="text-[var(--text-muted)]">· D-o-N</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Giant Killer Banner (upcoming/live only) */}
      {!isCompleted && (
        <GiantKillerBanner
          fixture={fixture}
          gkRanks={gkRanks}
        />
      )}

      {/* Sweepstake Impact card */}
      {myPlayerId && (() => {
        const iMineHome = homeOwner.some(o => o.id === myPlayerId)
        const iMineAway = awayOwner.some(o => o.id === myPlayerId)
        if (!iMineHome && !iMineAway) return null
        const myTeam = iMineHome ? fixture.home_team : fixture.away_team
        const don = iMineHome ? homeDon : awayDon
        const myCurrentPts = allPlayerScores.get(myPlayerId) ?? 0
        return (
          <SweepstakeImpactCard
            myTeam={myTeam}
            don={don}
            myCurrentPts={myCurrentPts}
            isLive={isLive}
            isCompleted={isCompleted}
          />
        )
      })()}

      {/* Odds (upcoming only) */}
      {isUpcoming && hasOdds && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-3">
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Odds</p>
          <div className="grid grid-cols-3 gap-2">
            <OddsBox label={fixture.home_team?.short_name ?? '1'} value={fixture.home_odds} />
            <OddsBox label="Draw" value={fixture.draw_odds} />
            <OddsBox label={fixture.away_team?.short_name ?? '2'} value={fixture.away_odds} />
          </div>
        </div>
      )}

      {/* Match Timeline (goals/cards from BigBallsData, completed matches only) */}
      {matchEvents.length > 0 && (
        <MatchTimeline
          events={matchEvents}
          homeName={fixture.home_team?.short_name || fixture.home_team?.name}
          awayName={fixture.away_team?.short_name || fixture.away_team?.name}
        />
      )}

      {/* Win probability preview (Elo-based, pre-match only) */}
      {!isCompleted && homeInsights?.elo && awayInsights?.elo && (
        <WinProbabilityCard
          homeName={fixture.home_team?.short_name || fixture.home_team?.name}
          awayName={fixture.away_team?.short_name || fixture.away_team?.name}
          homeElo={homeInsights.elo.rating}
          awayElo={awayInsights.elo.rating}
        />
      )}

      {/* Team season stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <TeamStatCard team={fixture.home_team} score={homeScore} owners={homeOwner} />
        <TeamStatCard team={fixture.away_team} score={awayScore} owners={awayOwner} />
      </div>

      {/* Head-to-head record */}
      {h2h.length > 0 && (
        <HeadToHeadCard
          fixtures={h2h}
          homeTeamId={fixture.home_team_id}
          homeName={fixture.home_team?.short_name || fixture.home_team?.name}
          awayName={fixture.away_team?.short_name || fixture.away_team?.name}
        />
      )}

      {/* Projected leaderboard (live only — points not yet synced) */}
      {isLive && homePts != null && awayPts != null && allOwners.size > 0 && (
        <ProjectedLeaderboard
          allOwners={allOwners}
          allPlayerScores={allPlayerScores}
          homeOwners={homeOwner}
          awayOwners={awayOwner}
          homePts={homePts}
          awayPts={awayPts}
          homeDon={homeDon}
          awayDon={awayDon}
        />
      )}

      {/* Giant Killer check (informational) */}
      {isCompleted && hScore != null && aScore != null && (
        <GiantKillerCheck
          fixture={fixture}
          gkRanks={gkRanks}
          homeScore={hScore}
          awayScore={aScore}
        />
      )}
    </AppShell>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProjectedLeaderboard({
  allOwners, allPlayerScores, homeOwners, awayOwners, homePts, awayPts, homeDon, awayDon,
}: {
  allOwners: Map<string, Player>
  allPlayerScores: Map<string, number>
  homeOwners: Player[]
  awayOwners: Player[]
  homePts: number
  awayPts: number
  homeDon: any
  awayDon: any
}) {
  const homeOwnerIds = new Set(homeOwners.map(o => o.id))
  const awayOwnerIds = new Set(awayOwners.map(o => o.id))
  const projected = [...allOwners.entries()].map(([pid, player]) => {
    let pts = allPlayerScores.get(pid) ?? 0
    let delta = 0
    if (homeOwnerIds.has(pid)) delta += projectedPtsWithDon(homePts, homeDon)
    if (awayOwnerIds.has(pid)) delta += projectedPtsWithDon(awayPts, awayDon)
    return { player, pts: pts + delta, delta }
  }).sort((a, b) => b.pts - a.pts)

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <p className="text-xs font-semibold text-[var(--text-primary)]">If this score stands…</p>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        {projected.map(({ player, pts, delta }, i) => {
          const isAffected = delta !== 0
          const deltaColor = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'
          return (
            <div
              key={player.id}
              className={`flex items-center gap-2.5 px-3 py-2 border-b border-[var(--border)] last:border-0 ${isAffected ? 'bg-[var(--accent)]/5' : ''}`}
            >
              <span className="text-[10px] text-[var(--text-muted)] w-4 shrink-0 text-center font-medium">{i + 1}</span>
              <div
                className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ backgroundColor: player.color }}
              >
                {player.name.charAt(0)}
              </div>
              <span className="text-xs font-medium text-[var(--text-primary)] flex-1 truncate">{player.name}</span>
              {delta !== 0 && (
                <span className={`text-[10px] font-semibold ${deltaColor} shrink-0`}>
                  {delta > 0 ? '+' : ''}{delta}
                </span>
              )}
              <span className="text-xs font-bold text-[var(--text-primary)] shrink-0 w-8 text-right">{pts}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectedPoints({ pts, raw, hasDon }: { pts: number; raw: number; hasDon: boolean }) {
  const color = raw === 3 ? 'text-emerald-400 bg-emerald-400/10' : raw === 1 ? 'text-amber-400 bg-amber-400/10' : 'text-[var(--text-muted)] bg-[var(--border)]'
  return (
    <div className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${color}`}>
      {hasDon && <span>🎲</span>}
      {pts > 0 ? '+' : ''}{pts} pts
    </div>
  )
}

function OddsBox({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return <div />
  return (
    <div className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
      <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="text-sm font-bold text-[var(--text-primary)]">{value.toFixed(2)}</span>
    </div>
  )
}

function MatchTimeline({
  events, homeName, awayName,
}: {
  events: MatchEvent[]
  homeName: string
  awayName: string
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden mb-3">
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <p className="text-xs font-semibold text-[var(--text-primary)]">Match Events</p>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {events.map((evt, i) => {
          const isHome = evt.isHome === true
          const icon = eventTypeIcon(evt.type)
          return (
            <div key={i} className={`flex items-center gap-2 px-3 py-2 text-xs ${isHome ? '' : 'flex-row-reverse'}`}>
              <span className="text-[var(--text-muted)] w-8 shrink-0 text-center tabular-nums font-medium">
                {evt.minute}{evt.minute && !evt.minute.includes('′') ? '′' : ''}
              </span>
              <span className="text-sm shrink-0">{icon}</span>
              <span className={`flex-1 truncate font-medium ${isHome ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] text-right'}`}>
                {evt.text || (evt.type === 'goal' ? 'Goal' : evt.type === 'yellow_card' ? 'Yellow card' : evt.type === 'red_card' ? 'Red card' : 'Event')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WinProbabilityCard({
  homeName, awayName, homeElo, awayElo,
}: {
  homeName: string
  awayName: string
  homeElo: number
  awayElo: number
}) {
  const HOME_ADVANTAGE = 60
  const diff = (homeElo + HOME_ADVANTAGE) - awayElo
  const homeStrength = 1 / (1 + Math.pow(10, -diff / 400))
  const drawProb = Math.max(0.12, Math.min(0.30, 0.28 - Math.abs(diff) / 4000))
  const remaining = 1 - drawProb
  const homeWinProb = remaining * homeStrength
  const awayWinProb = remaining * (1 - homeStrength)

  const pct = (n: number) => `${Math.round(n * 100)}%`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-3">
      <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
        Win probability <span className="normal-case text-[var(--text-muted)]/70">(Elo-based estimate)</span>
      </p>
      <div className="flex h-2 rounded-full overflow-hidden mb-2">
        <div className="h-full bg-emerald-500" style={{ width: pct(homeWinProb) }} />
        <div className="h-full bg-amber-500" style={{ width: pct(drawProb) }} />
        <div className="h-full bg-red-500" style={{ width: pct(awayWinProb) }} />
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        <div>
          <p className="text-sm font-black text-emerald-400">{pct(homeWinProb)}</p>
          <p className="text-[9px] text-[var(--text-muted)] truncate">{homeName}</p>
        </div>
        <div>
          <p className="text-sm font-black text-amber-400">{pct(drawProb)}</p>
          <p className="text-[9px] text-[var(--text-muted)]">Draw</p>
        </div>
        <div>
          <p className="text-sm font-black text-red-400">{pct(awayWinProb)}</p>
          <p className="text-[9px] text-[var(--text-muted)] truncate">{awayName}</p>
        </div>
      </div>
    </div>
  )
}

function HeadToHeadCard({
  fixtures, homeTeamId, homeName, awayName,
}: {
  fixtures: any[]
  homeTeamId: string
  homeName: string
  awayName: string
}) {
  let homeWins = 0, draws = 0, awayWins = 0
  for (const f of fixtures) {
    if (f.home_score == null || f.away_score == null) continue
    const homeSideScore = f.home_team_id === homeTeamId ? f.home_score : f.away_score
    const awaySideScore = f.home_team_id === homeTeamId ? f.away_score : f.home_score
    if (homeSideScore > awaySideScore) homeWins++
    else if (homeSideScore === awaySideScore) draws++
    else awayWins++
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden mb-3">
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Head-to-head</p>
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-center gap-4 mb-3">
          <div className="text-center">
            <p className="text-lg font-black text-[var(--text-primary)]">{homeWins}</p>
            <p className="text-[9px] text-[var(--text-muted)] truncate max-w-[64px]">{homeName} wins</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-black text-[var(--text-muted)]">{draws}</p>
            <p className="text-[9px] text-[var(--text-muted)]">Draws</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-black text-[var(--text-primary)]">{awayWins}</p>
            <p className="text-[9px] text-[var(--text-muted)] truncate max-w-[64px]">{awayName} wins</p>
          </div>
        </div>
        <div className="space-y-1.5">
          {fixtures.slice(0, 5).map((f) => {
            const isHomeHome = f.home_team_id === homeTeamId
            return (
              <div key={f.id} className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--text-secondary)] truncate flex-1">
                  {isHomeHome ? homeName : awayName} vs {isHomeHome ? awayName : homeName}
                </span>
                <span className="font-semibold text-[var(--text-primary)] shrink-0 ml-2">
                  {f.home_score}–{f.away_score}
                </span>
                <span className="text-[var(--text-muted)] shrink-0 ml-2 w-12 text-right">
                  {f.kickoff_time ? new Date(f.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TeamStatCard({ team, score, owners }: { team: any; score: any; owners: Player[] }) {
  if (!team) return null
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <TeamCrest team={team} size="sm" />
        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{team.short_name || team.name}</span>
      </div>
      {score && (
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <div>
            <span className="text-[var(--text-muted)]">Pts </span>
            <span className="font-bold text-[var(--text-primary)]">{score.total_points}</span>
          </div>
          <div>
            <span className="text-emerald-400">{score.wins}W </span>
            <span className="text-amber-400">{score.draws}D </span>
            <span className="text-red-400">{score.losses}L</span>
          </div>
        </div>
      )}
      {team.league_position && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1">#{team.league_position} in league</div>
      )}
      {owners.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--border)] flex flex-col gap-0.5">
          {owners.map(o => (
            <div key={o.id} className="flex items-center gap-1">
              <Avatar name={o.name} color={o.color} size="sm" />
              <span className="text-[10px] text-[var(--text-secondary)] truncate">{o.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GiantKillerBanner({
  fixture,
  gkRanks,
}: {
  fixture: any
  gkRanks: Map<string, TeamRank> | null
}) {
  const { eligible, bottomTeamId } = giantKillerEligibility(fixture.home_team_id, fixture.away_team_id, gkRanks)
  if (!eligible) return null
  const underdogTeam = bottomTeamId === fixture.home_team_id ? fixture.home_team : fixture.away_team

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">⚔️</span>
        <p className="text-xs font-semibold text-amber-400">
          Giant Killer chance — {underdogTeam?.short_name || underdogTeam?.name} (bottom 6) win earns a bonus for the owner
        </p>
      </div>
    </div>
  )
}

function GiantKillerCheck({
  fixture, gkRanks, homeScore, awayScore,
}: {
  fixture: any; gkRanks: Map<string, TeamRank> | null; homeScore: number; awayScore: number
}) {
  if (homeScore === awayScore) return null
  const { eligible, bottomTeamId, topTeamId } = giantKillerEligibility(fixture.home_team_id, fixture.away_team_id, gkRanks)
  const winnerId = homeScore > awayScore ? fixture.home_team_id : fixture.away_team_id
  if (!eligible || winnerId !== bottomTeamId) return null

  const winner = bottomTeamId === fixture.home_team_id ? fixture.home_team : fixture.away_team
  const loser = topTeamId === fixture.home_team_id ? fixture.home_team : fixture.away_team
  const winnerRank = gkRanks?.get(bottomTeamId!)?.rank
  const loserRank = gkRanks?.get(topTeamId!)?.rank

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">⚔️</span>
        <div>
          <p className="text-xs font-bold text-amber-400">Giant Killer!</p>
          <p className="text-[10px] text-[var(--text-secondary)]">
            {winner.short_name || winner.name} (#{winnerRank}) beat {loser.short_name || loser.name} (#{loserRank}) — bottom 6 beating a top 6 side
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SweepstakeImpactCard({
  myTeam, don, myCurrentPts, isLive, isCompleted,
}: {
  myTeam: any
  don: any
  myCurrentPts: number
  isLive: boolean
  isCompleted: boolean
}) {
  const scenarios = [
    { label: 'Win', raw: 3, color: 'emerald' },
    { label: 'Draw', raw: 1, color: 'amber' },
    { label: 'Loss', raw: 0, color: 'red' },
  ]
  const donActive = !!don

  return (
    <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3 mb-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-sm">🎯</span>
        <p className="text-xs font-bold text-[var(--text-primary)]">Your Stake — {myTeam?.short_name || myTeam?.name}</p>
        {donActive && (
          <span className="ml-auto text-[9px] font-bold text-[var(--accent)] bg-[var(--accent)]/15 px-1.5 py-0.5 rounded-full">⚡ D-o-N active</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {scenarios.map(({ label, raw, color }) => {
          const pts = projectedPtsWithDon(raw, don)
          const bg = color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20' : color === 'amber' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'
          const textColor = color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-red-400'
          return (
            <div key={label} className={`rounded-lg border p-2 text-center ${bg}`}>
              <p className={`text-[10px] font-medium ${textColor}`}>{label}</p>
              <p className={`text-sm font-black mt-0.5 ${textColor}`}>
                {pts > 0 ? '+' : ''}{pts} pts
              </p>
              {donActive && raw !== pts && (
                <p className="text-[9px] text-[var(--text-muted)] mt-0.5">(base: {raw > 0 ? '+' : ''}{raw})</p>
              )}
            </div>
          )
        })}
      </div>
      {!isCompleted && !isLive && (
        <p className="text-[9px] text-[var(--text-muted)] mt-2 text-center">
          Currently {myCurrentPts} pts in the sweepstake
        </p>
      )}
    </div>
  )
}

function projectedPtsWithDon(rawPts: number, don: any | undefined): number {
  if (!don) return rawPts
  if (rawPts === 3) return rawPts * 2
  if (rawPts === 1) return -1
  return -3
}

function parseBbsEvents(raw: any[]): MatchEvent[] {
  const events: MatchEvent[] = []
  for (const evt of raw ?? []) {
    const typeText = ((evt.type ?? evt.event_type ?? evt.eventType ?? '') as string).toLowerCase()
    const minute = String(evt.minute ?? evt.min ?? evt.clock ?? evt.time ?? '')
    const text = evt.text ?? evt.description ?? evt.player_name ?? evt.player ?? evt.detail ?? ''

    const side = (evt.side ?? evt.team_side ?? evt.teamSide ?? '').toString().toLowerCase()
    let isHome: boolean | null = null
    if (typeof evt.isHome === 'boolean') isHome = evt.isHome
    else if (typeof evt.is_home === 'boolean') isHome = evt.is_home
    else if (side === 'home') isHome = true
    else if (side === 'away') isHome = false
    else if (evt.team === 'home') isHome = true
    else if (evt.team === 'away') isHome = false

    let type: MatchEvent['type'] = 'other'
    if (typeText.includes('goal') && typeText.includes('own')) type = 'own_goal'
    else if (typeText.includes('goal')) type = 'goal'
    else if (typeText.includes('red')) type = 'red_card'
    else if (typeText.includes('yellow')) type = 'yellow_card'
    else if (typeText.includes('sub')) type = 'substitution'
    else if (typeText.includes('var')) type = 'var'
    else continue

    events.push({ minute, type, text, isHome })
  }
  return events
}

function eventTypeIcon(type: MatchEvent['type']): string {
  switch (type) {
    case 'goal': return '⚽'
    case 'own_goal': return '🙈'
    case 'yellow_card': return '🟨'
    case 'red_card': return '🟥'
    case 'substitution': return '🔄'
    case 'var': return '📺'
    default: return '•'
  }
}

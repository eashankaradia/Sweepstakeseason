'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/lib/utils'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

type Player = { id: string; name: string; color: string }

export default function MatchCentrePage({ params }: { params: { id: string } }) {
  const [fixture, setFixture] = useState<any>(null)
  const [homeOwner, setHomeOwner] = useState<Player | null>(null)
  const [awayOwner, setAwayOwner] = useState<Player | null>(null)
  const [homeScore, setHomeScore] = useState<any>(null)
  const [awayScore, setAwayScore] = useState<any>(null)
  const [espnData, setEspnData] = useState<any>(null)
  const [powerUps, setPowerUps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [liveLoading, setLiveLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [params.id])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: fix } = await supabase
      .from('fixtures')
      .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
      .eq('id', params.id)
      .maybeSingle()

    if (!fix) { setLoading(false); return }
    setFixture(fix)

    const [{ data: assignments }, { data: pups }] = await Promise.all([
      supabase.from('player_team_assignments')
        .select('team_id, players(id,name,color)')
        .eq('league_id', fix.league_id),
      supabase.from('power_up_activations')
        .select('*, players(name,color)')
        .eq('fixture_id', params.id)
        .eq('status', 'pending'),
    ])

    const aMap = new Map((assignments ?? []).map((a: any) => [a.team_id, a.players]))
    setHomeOwner(aMap.get(fix.home_team_id) ?? null)
    setAwayOwner(aMap.get(fix.away_team_id) ?? null)
    setPowerUps(pups ?? [])

    // Team scores for sweepstake points context
    const [{ data: hs }, { data: as_ }] = await Promise.all([
      supabase.from('team_scores').select('*').eq('league_id', fix.league_id).eq('team_id', fix.home_team_id).maybeSingle(),
      supabase.from('team_scores').select('*').eq('league_id', fix.league_id).eq('team_id', fix.away_team_id).maybeSingle(),
    ])
    setHomeScore(hs)
    setAwayScore(as_)

    // Fetch ESPN live data if fixture has external_id
    if (fix.external_id && fix.competition?.espn_slug) {
      fetchESPN(fix.competition.espn_slug, fix.external_id)
    }

    setLoading(false)
  }

  async function fetchESPN(slug: string, eventId: string) {
    setLiveLoading(true)
    try {
      const res = await fetch(`${ESPN_BASE}/${slug}/summary?event=${eventId}`)
      if (res.ok) setEspnData(await res.json())
    } catch { /* ignore */ }
    setLiveLoading(false)
  }

  if (loading) return <AppShell title="Match" backHref="/fixtures"><PageLoader /></AppShell>
  if (!fixture) return <AppShell title="Match" backHref="/fixtures"><EmptyState icon="⚽" title="Match not found" /></AppShell>

  const isLive = fixture.status === 'live'
  const isCompleted = fixture.status === 'completed'
  const isUpcoming = !isLive && !isCompleted

  const espnComp = espnData?.header?.competitions?.[0]
  const espnHome = espnComp?.competitors?.find((c: any) => c.homeAway === 'home')
  const espnAway = espnComp?.competitors?.find((c: any) => c.homeAway === 'away')
  const espnStatus = espnComp?.status?.type?.description ?? ''
  const espnClock = espnComp?.status?.displayClock

  const scoringPlays = espnData?.scoringPlays ?? []
  const stats = espnData?.boxscore?.teams ?? []

  // Points this fixture would award
  const hScore = isCompleted || isLive ? (fixture.home_score ?? 0) : null
  const aScore = isCompleted || isLive ? (fixture.away_score ?? 0) : null
  const homePts = hScore != null && aScore != null ? (hScore > aScore ? 3 : hScore === aScore ? 1 : 0) : null
  const awayPts = hScore != null && aScore != null ? (aScore > hScore ? 3 : hScore === aScore ? 1 : 0) : null

  const compType = (fixture.competition as any)?.competition_type
  const hasOdds = fixture.home_odds != null || fixture.draw_odds != null || fixture.away_odds != null

  return (
    <AppShell title="Match Centre" backHref="/fixtures">
      {/* Competition / meta */}
      <div className="flex items-center gap-2 mb-3">
        <Badge
          variant={compType === 'european' ? 'purple' : 'default'}
          className="text-[10px]"
        >
          {(fixture.competition as any)?.short_name}
        </Badge>
        {fixture.round && <span className="text-[10px] text-[var(--text-muted)]">{fixture.round}</span>}
        {fixture.matchday && <span className="text-[10px] text-[var(--text-muted)]">MD{fixture.matchday}</span>}
        {isLive && (
          <Badge variant="danger" className="text-[9px] ml-auto animate-pulse">
            ● LIVE {espnClock ? `${espnClock}` : ''}
          </Badge>
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
          <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
            <TeamCrest team={fixture.home_team} size="lg" />
            <span className="text-sm font-semibold text-[var(--text-primary)] text-center leading-tight">
              {fixture.home_team?.name}
            </span>
            {homeOwner && (
              <div className="flex items-center gap-1">
                <Avatar name={homeOwner.name} color={homeOwner.color} size="xs" />
                <span className="text-[10px] text-[var(--text-secondary)]">{homeOwner.name}</span>
              </div>
            )}
            {homePts != null && (
              <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${homePts === 3 ? 'text-emerald-400 bg-emerald-400/10' : homePts === 1 ? 'text-amber-400 bg-amber-400/10' : 'text-[var(--text-muted)] bg-[var(--border)]'}`}>
                +{homePts} pts
              </div>
            )}
          </div>

          {/* Score */}
          <div className="shrink-0 text-center px-2">
            {(isCompleted || isLive) ? (
              <div className="text-4xl font-black text-[var(--text-primary)] tabular-nums">
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
            {isLive && espnStatus && <div className="text-[9px] text-emerald-400 mt-1">{espnStatus}</div>}
          </div>

          {/* Away */}
          <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
            <TeamCrest team={fixture.away_team} size="lg" />
            <span className="text-sm font-semibold text-[var(--text-primary)] text-center leading-tight">
              {fixture.away_team?.name}
            </span>
            {awayOwner && (
              <div className="flex items-center gap-1">
                <Avatar name={awayOwner.name} color={awayOwner.color} size="xs" />
                <span className="text-[10px] text-[var(--text-secondary)]">{awayOwner.name}</span>
              </div>
            )}
            {awayPts != null && (
              <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${awayPts === 3 ? 'text-emerald-400 bg-emerald-400/10' : awayPts === 1 ? 'text-amber-400 bg-amber-400/10' : 'text-[var(--text-muted)] bg-[var(--border)]'}`}>
                +{awayPts} pts
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active power-ups */}
      {powerUps.length > 0 && (
        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-2.5 mb-3">
          <p className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wide mb-1.5">⚡ Active Power-Ups</p>
          {powerUps.map((pu: any) => (
            <div key={pu.id} className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pu.players?.color ?? '#888' }} />
              <span className="font-medium">{pu.players?.name}</span>
              <span className="text-[var(--text-muted)]">
                {pu.power_up_type === 'double_or_nothing' ? '🎲 Double or Nothing' : '🔄 Reverse'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Odds (upcoming) */}
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

      {/* Scoring plays (from ESPN) */}
      {scoringPlays.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden mb-3">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <p className="text-xs font-semibold text-[var(--text-primary)]">Goals</p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {scoringPlays.map((play: any, i: number) => {
              const isHome = play.team?.id === espnHome?.id
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="text-[var(--text-muted)] w-8 shrink-0 text-center">
                    {play.clock?.displayValue ?? ''}′
                  </span>
                  <span className="text-[11px]">⚽</span>
                  <span className={`font-medium ${isHome ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                    {play.text ?? play.participants?.[0]?.athlete?.displayName ?? 'Goal'}
                  </span>
                  <span className={`ml-auto text-[10px] font-bold ${isHome ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isHome ? (fixture.home_team?.short_name ?? 'H') : (fixture.away_team?.short_name ?? 'A')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Match stats (from ESPN) */}
      {stats.length > 0 && <MatchStats stats={stats} homeName={fixture.home_team?.name} awayName={fixture.away_team?.name} />}

      {/* Team season stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <TeamStatCard
          team={fixture.home_team}
          score={homeScore}
          owner={homeOwner}
          position="home"
        />
        <TeamStatCard
          team={fixture.away_team}
          score={awayScore}
          owner={awayOwner}
          position="away"
        />
      </div>
    </AppShell>
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

function TeamStatCard({ team, score, owner, position }: { team: any; score: any; owner: Player | null; position: 'home' | 'away' }) {
  if (!team) return null
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <TeamCrest team={team} size="sm" />
        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{team.short_name || team.name}</span>
      </div>
      {score && (
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <div><span className="text-[var(--text-muted)]">Pts</span> <span className="font-bold text-[var(--text-primary)]">{score.total_points}</span></div>
          <div><span className="text-emerald-400">{score.wins}W</span> <span className="text-amber-400">{score.draws}D</span> <span className="text-red-400">{score.losses}L</span></div>
        </div>
      )}
      {team.league_position && (
        <div className="text-[10px] text-[var(--text-muted)] mt-1">#{team.league_position} in league</div>
      )}
      {owner && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-[var(--border)]">
          <Avatar name={owner.name} color={owner.color} size="xs" />
          <span className="text-[10px] text-[var(--text-secondary)] truncate">{owner.name}</span>
        </div>
      )}
    </div>
  )
}

function MatchStats({ stats, homeName, awayName }: { stats: any[]; homeName: string; awayName: string }) {
  const statKeys = [
    { key: 'possessionPct', label: 'Possession', isPercent: true },
    { key: 'totalShots', label: 'Shots' },
    { key: 'shotsOnTarget', label: 'On Target' },
    { key: 'saves', label: 'Saves' },
    { key: 'fouls', label: 'Fouls' },
    { key: 'yellowCards', label: 'Yellow Cards' },
  ]

  const homeStats: Record<string, any> = {}
  const awayStats: Record<string, any> = {}

  for (const team of stats) {
    const isHome = team.homeAway === 'home'
    for (const stat of (team.statistics ?? [])) {
      if (isHome) homeStats[stat.name] = stat.displayValue
      else awayStats[stat.name] = stat.displayValue
    }
  }

  const displayStats = statKeys.filter(s => homeStats[s.key] != null || awayStats[s.key] != null)
  if (displayStats.length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden mb-3">
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <p className="text-xs font-semibold text-[var(--text-primary)]">Match Statistics</p>
      </div>
      <div className="px-3 py-2 space-y-3">
        {displayStats.map(({ key, label }) => {
          const hv = homeStats[key] ?? '0'
          const av = awayStats[key] ?? '0'
          const hn = parseFloat(hv) || 0
          const an = parseFloat(av) || 0
          const total = hn + an
          const homePct = total > 0 ? (hn / total) * 100 : 50
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="font-semibold text-[var(--text-primary)] w-8">{hv}</span>
                <span className="text-[var(--text-muted)]">{label}</span>
                <span className="font-semibold text-[var(--text-primary)] w-8 text-right">{av}</span>
              </div>
              <div className="h-1 rounded-full bg-[var(--border)] flex overflow-hidden">
                <div className="h-full bg-[var(--accent)] rounded-l-full transition-all" style={{ width: `${homePct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

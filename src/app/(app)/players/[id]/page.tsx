'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { CompetitionBadge } from '@/components/ui/CompetitionBadge'
import { StatTile } from '@/components/ui/StatTile'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

function posOrdinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}

type FormResult = 'W' | 'D' | 'L'

export default function PlayerDetailPage({ params }: { params: { id: string } }) {
  const [player, setPlayer] = useState<any>(null)
  const [score, setScore] = useState<any>(null)
  const [teams, setTeams] = useState<any[]>([])
  const [upcomingFixtures, setUpcomingFixtures] = useState<any[]>([])
  const [recentFixtures, setRecentFixtures] = useState<any[]>([])
  const [powerUps, setPowerUps] = useState<any[]>([])
  const [position, setPosition] = useState<number | null>(null)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { load() }, [params.id])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: p } = await supabase.from('players').select('*').eq('id', params.id).maybeSingle()
    if (!p) { setLoading(false); return }
    setPlayer(p)

    const [
      { data: playerScore },
      { data: allScores },
      { data: assignments },
      { data: pups },
    ] = await Promise.all([
      supabase.from('player_scores').select('*').eq('league_id', leagueId).eq('player_id', params.id).maybeSingle(),
      supabase.from('player_scores').select('player_id, total_points').eq('league_id', leagueId).order('total_points', { ascending: false }),
      supabase.from('player_team_assignments')
        .select('*, teams(*, team_competitions(competition_id, competitions(*)))')
        .eq('league_id', leagueId)
        .eq('player_id', params.id),
      supabase.from('power_up_activations').select('*').eq('league_id', leagueId).eq('player_id', params.id),
    ])

    setScore(playerScore)
    setPowerUps(pups ?? [])

    const sorted = (allScores ?? []).sort((a: any, b: any) => b.total_points - a.total_points)
    const pos = sorted.findIndex((s: any) => s.player_id === params.id)
    setPosition(pos >= 0 ? pos + 1 : null)
    setTotalPlayers(sorted.length)

    const teamList = (assignments ?? []).map((a: any) => a.teams).filter(Boolean)
    setTeams(teamList)

    if (teamList.length > 0) {
      const teamIds = teamList.map((t: any) => t.id)
      const orClause = teamIds.map((id: string) => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(',')
      const [{ data: upcoming }, { data: recent }] = await Promise.all([
        supabase.from('fixtures')
          .select('*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
          .eq('league_id', leagueId)
          .eq('status', 'scheduled')
          .or(orClause)
          .order('kickoff_time')
          .limit(5),
        supabase.from('fixtures')
          .select('*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
          .eq('league_id', leagueId)
          .eq('status', 'completed')
          .or(orClause)
          .order('kickoff_time', { ascending: false })
          .limit(5),
      ])
      setUpcomingFixtures((upcoming ?? []) as any[])
      setRecentFixtures((recent ?? []) as any[])
    }

    setLoading(false)
  }

  if (loading) return <AppShell title="Player" backHref="/standings"><PageLoader /></AppShell>
  if (!player) return <AppShell title="Player" backHref="/standings"><EmptyState icon="👤" title="Player not found" /></AppShell>

  const teamIds = new Set(teams.map((t: any) => t.id))

  // Aggregate stats across all teams
  const totalW = score?.wins ?? 0
  const totalD = score?.draws ?? 0
  const totalL = score?.losses ?? 0
  const totalPts = score?.total_points ?? 0
  const totalPlayed = score?.matches_played ?? 0

  const donUsed = powerUps.filter(p => p.power_up_type === 'double_or_nothing' && p.status !== 'cancelled')
  const reverseUsed = powerUps.filter(p => p.power_up_type === 'reverse' && p.status !== 'cancelled')

  const recentForm: FormResult[] = recentFixtures.slice(0, 5).map(f => {
    const isHome = teamIds.has(f.home_team_id)
    const my = isHome ? f.home_score : f.away_score
    const opp = isHome ? f.away_score : f.home_score
    if (my > opp) return 'W'
    if (my === opp) return 'D'
    return 'L'
  }).reverse()

  const medals = ['🥇', '🥈', '🥉']

  return (
    <AppShell title={player.name} backHref="/standings">
      {/* Hero */}
      <div
        className="rounded-2xl border p-4 mb-3 flex items-center gap-4"
        style={{ borderColor: `${player.color}35`, background: `${player.color}0a` }}
      >
        <div className="relative shrink-0">
          <Avatar name={player.name} color={player.color} size="lg" />
          {position != null && position <= 3 && (
            <span className="absolute -top-1 -right-1 text-base leading-none">{medals[position - 1]}</span>
          )}
          {position != null && position > 3 && (
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-[var(--bg)]"
              style={{ backgroundColor: player.color, color: '#fff' }}
            >
              {position}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-[var(--text-primary)] truncate">{player.name}</h2>
          {position != null && (
            <p className="text-xs text-[var(--text-secondary)]">
              {position}{posOrdinal(position)} of {totalPlayers}
            </p>
          )}
          {recentForm.length > 0 && (
            <div className="flex items-center gap-0.5 mt-1.5">
              {recentForm.map((r, i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-[3px] flex items-center justify-center text-[7px] font-black leading-none ${
                    r === 'W' ? 'bg-emerald-500 text-white' : r === 'D' ? 'bg-amber-400 text-white' : 'bg-red-500 text-white'
                  }`}
                >
                  {r}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl font-black" style={{ color: player.color }}>{totalPts}</p>
          <p className="text-[10px] text-[var(--text-secondary)] -mt-0.5">points</p>
        </div>
      </div>

      {/* Stats row */}
      {totalPlayed > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          <StatTile label="W" value={totalW} color="text-emerald-400" />
          <StatTile label="D" value={totalD} color="text-amber-400" />
          <StatTile label="L" value={totalL} color="text-red-400" />
          <StatTile label="Played" value={totalPlayed} />
        </div>
      )}

      {/* Power-ups */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className={`rounded-xl border p-3 ${donUsed.length > 0 ? 'border-amber-400/30 bg-amber-400/8' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
          <p className="text-[10px] text-[var(--text-muted)] mb-0.5">⚡ Double or Nothing</p>
          <p className={`text-sm font-bold ${donUsed.length > 0 ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}>
            {donUsed.length > 0 ? `${donUsed.length}× used` : 'Not used'}
          </p>
        </div>
        <div className={`rounded-xl border p-3 ${reverseUsed.length > 0 ? 'border-purple-400/30 bg-purple-400/8' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
          <p className="text-[10px] text-[var(--text-muted)] mb-0.5">🔄 Reverse</p>
          <p className={`text-sm font-bold ${reverseUsed.length > 0 ? 'text-purple-400' : 'text-[var(--text-muted)]'}`}>
            {reverseUsed.length > 0 ? `${reverseUsed.length}× used` : 'Not used'}
          </p>
        </div>
      </div>

      {/* Teams */}
      {teams.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">Clubs</p>
          <div className="space-y-2">
            {teams.map((team: any) => {
              const comps: any[] = (team.team_competitions ?? []).map((tc: any) => tc.competitions).filter(Boolean)
              return (
                <Link key={team.id} href={`/teams/${team.id}`}>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <TeamCrest team={team} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[var(--text-primary)] truncate">{team.name}</p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {comps.map((c: any) => (
                          <CompetitionBadge key={c.id} shortName={c.short_name} name={c.name} type={c.competition_type} />
                        ))}
                      </div>
                    </div>
                    {team.league_position && (
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">#{team.league_position}</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Upcoming fixtures */}
      {upcomingFixtures.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">Upcoming</p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {upcomingFixtures.map((f: any, i: number) => (
              <FixturePill key={f.id} fixture={f} myTeamIds={teamIds} index={i} total={upcomingFixtures.length} />
            ))}
          </div>
        </div>
      )}

      {/* Recent results */}
      {recentFixtures.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">Recent results</p>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {recentFixtures.map((f: any, i: number) => (
              <FixturePill key={f.id} fixture={f} myTeamIds={teamIds} index={i} total={recentFixtures.length} />
            ))}
          </div>
        </div>
      )}

      {teams.length === 0 && totalPlayed === 0 && (
        <EmptyState icon="🎯" title="Draft pending" description="Teams and stats will appear after the draft." />
      )}
    </AppShell>
  )
}

function FixturePill({ fixture, myTeamIds, index, total }: { fixture: any; myTeamIds: Set<string>; index: number; total: number }) {
  const isHome = myTeamIds.has(fixture.home_team_id)
  const isAway = myTeamIds.has(fixture.away_team_id)
  const myTeam = isHome ? fixture.home_team : fixture.away_team
  const opp = isHome ? fixture.away_team : fixture.home_team
  const isCompleted = fixture.status === 'completed'
  const myScore = isHome ? fixture.home_score : fixture.away_score
  const oppScore = isHome ? fixture.away_score : fixture.home_score

  let resultColor = ''
  if (isCompleted && myScore != null && oppScore != null) {
    resultColor = myScore > oppScore ? 'text-emerald-400' : myScore === oppScore ? 'text-amber-400' : 'text-red-400'
  }

  return (
    <Link href={`/fixtures/${fixture.id}`}>
      <div className={[
        'flex items-center gap-2.5 px-3 py-2.5 min-h-[48px] hover:bg-[var(--bg-card-hover)] transition-colors',
        index < total - 1 ? 'border-b border-[var(--border)]' : '',
        isHome || isAway ? 'border-l-2 border-l-[var(--accent)]' : '',
      ].join(' ')}>
        {fixture.competition && (
          <CompetitionBadge
            shortName={fixture.competition.short_name}
            type={fixture.competition.competition_type}
          />
        )}
        <TeamCrest team={myTeam} size="xs" />
        <span className="text-[10px] text-[var(--text-muted)] shrink-0">{isHome ? 'vs' : '@'}</span>
        <TeamCrest team={opp} size="xs" />
        <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{opp?.short_name || opp?.name}</span>
        {isCompleted && myScore != null ? (
          <span className={`text-xs font-bold shrink-0 ${resultColor}`}>{myScore}–{oppScore}</span>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] shrink-0">
            {fixture.kickoff_time
              ? new Date(fixture.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : '—'}
          </span>
        )}
      </div>
    </Link>
  )
}

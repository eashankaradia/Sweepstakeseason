'use client'
import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicShell, PublicNotAvailable } from '@/components/layout/PublicShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Avatar } from '@/components/ui/Avatar'
import { PageLoader, ErrorState } from '@/components/ui/LoadingSpinner'
import { fetchPublicLeagueData, type PublicLeagueData } from '@/lib/publicLeague'

export default function PublicTeamDetailPage({ params }: { params: Promise<{ leagueId: string; teamId: string }> }) {
  const { leagueId, teamId } = use(params)
  const searchParams = useSearchParams()
  const asPlayerId = searchParams.get('as')

  const [data, setData] = useState<PublicLeagueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const result = await fetchPublicLeagueData(leagueId)
      if (result.notAvailable) { setNotAvailable(true); setLoading(false); return }
      setData(result.data)
      setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  if (loading) return <PageLoader />
  if (notAvailable) return <PublicNotAvailable />
  if (error || !data) return <ErrorState onRetry={load} />

  const { players, assignments, teamScores, fixtures } = data
  const teamFixtures = fixtures.filter((f: any) => f.home_team_id === teamId || f.away_team_id === teamId)
  const teamFromFixture = teamFixtures.find((f: any) => f.home_team_id === teamId)?.home_team
    ?? teamFixtures.find((f: any) => f.away_team_id === teamId)?.away_team
  const team = teamFromFixture ?? assignments.find((a: any) => a.teams?.id === teamId)?.teams
  if (!team) return <ErrorState title="Team not found" onRetry={load} />

  const owners = assignments.filter((a: any) => a.teams?.id === teamId && a.players).map((a: any) => a.players)
  const scores = teamScores.filter((ts: any) => ts.team_id === teamId)
  const teamScore = scores.length > 0 ? {
    wins: scores.reduce((s: number, ts: any) => s + (ts.wins ?? 0), 0),
    draws: scores.reduce((s: number, ts: any) => s + (ts.draws ?? 0), 0),
    losses: scores.reduce((s: number, ts: any) => s + (ts.losses ?? 0), 0),
    matches_played: scores.reduce((s: number, ts: any) => s + (ts.matches_played ?? 0), 0),
    total_points: scores.reduce((s: number, ts: any) => s + (ts.total_points ?? 0), 0),
  } : null

  const recentResults = teamFixtures.filter((f: any) => f.status === 'completed').slice(0, 5)
  const form = recentResults.map((f: any) => {
    const isHome = f.home_team_id === teamId
    const myScore = isHome ? f.home_score : f.away_score
    const oppScore = isHome ? f.away_score : f.home_score
    if (myScore > oppScore) return 'W'
    if (myScore === oppScore) return 'D'
    return 'L'
  }).reverse()

  const monthGroups = new Map<string, any[]>()
  for (const f of teamFixtures) {
    if (!f.kickoff_time) continue
    const ym = f.kickoff_time.substring(0, 7)
    const arr = monthGroups.get(ym) ?? []
    arr.push(f)
    monthGroups.set(ym, arr)
  }
  const sortedMonths = [...monthGroups.keys()].sort((a, b) => b.localeCompare(a))

  return (
    <PublicShell leagueId={leagueId} players={players} selectedPlayerId={asPlayerId} title={team.short_name || team.name} backHref={`/watch/${leagueId}/fixtures`}>
      <div className="rounded-2xl p-4 mb-3 border flex items-center gap-4" style={{ borderColor: `${team.primary_color}30`, background: `${team.primary_color}10` }}>
        <TeamCrest team={team} size="xl" />
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-[var(--text-primary)] truncate">{team.name}</h2>
          <p className="text-xs text-[var(--text-secondary)]">{team.country}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-2xl font-black text-[var(--text-primary)]">{teamScore?.total_points ?? 0}</p>
          <p className="text-[10px] text-[var(--text-secondary)]">pts</p>
        </div>
      </div>

      {owners.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-3">
          <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide font-medium mb-2">Sweepstake Owner{owners.length > 1 ? 's' : ''}</p>
          <div className="flex flex-col gap-2">
            {owners.map((o: any) => (
              <Link key={o.id} href={`/watch/${leagueId}/players/${o.id}${asPlayerId ? `?as=${asPlayerId}` : ''}`} className="flex items-center gap-2.5">
                <Avatar name={o.name} color={o.color} size="sm" />
                <span className="font-semibold text-sm text-[var(--text-primary)]">{o.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {form.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-3">
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Form</p>
          <div className="flex items-center gap-1.5">
            {form.map((r: string, i: number) => (
              <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${r === 'W' ? 'bg-emerald-500/20 text-emerald-400' : r === 'D' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{r}</div>
            ))}
          </div>
        </div>
      )}

      {teamScore && (
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { label: 'Pts', value: teamScore.total_points, color: 'text-[var(--text-primary)]' },
            { label: 'W', value: teamScore.wins, color: 'text-emerald-400' },
            { label: 'D', value: teamScore.draws, color: 'text-amber-400' },
            { label: 'L', value: teamScore.losses, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-center py-3">
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {sortedMonths.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">All fixtures</p>
          <div className="space-y-2">
            {sortedMonths.map(ym => {
              const label = new Date(ym + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
              const monthFixtures = [...(monthGroups.get(ym) ?? [])].sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime())
              return (
                <div key={ym} className="rounded-xl border border-[var(--border)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--bg-card)] font-semibold text-sm text-[var(--text-primary)]">{label}</div>
                  <div className="px-2 pb-2 pt-1 space-y-2 bg-[var(--bg)]">
                    {monthFixtures.map((f: any) => <PublicTeamFixtureRow key={f.id} fixture={f} teamId={teamId} leagueId={leagueId} asId={asPlayerId} />)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </PublicShell>
  )
}

function PublicTeamFixtureRow({ fixture, teamId, leagueId, asId }: { fixture: any; teamId: string; leagueId: string; asId: string | null }) {
  const isHome = fixture.home_team_id === teamId
  const oppTeam = isHome ? fixture.away_team : fixture.home_team
  const myScore = isHome ? fixture.home_score : fixture.away_score
  const oppScore = isHome ? fixture.away_score : fixture.home_score
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'
  let resultColor = ''
  if (isCompleted && myScore != null && oppScore != null) {
    resultColor = myScore > oppScore ? 'text-emerald-400' : myScore === oppScore ? 'text-amber-400' : 'text-red-400'
  }
  return (
    <Link href={`/watch/${leagueId}/fixtures/${fixture.id}${asId ? `?as=${asId}` : ''}`}>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 flex items-center gap-2 hover:border-[var(--accent)]/40 transition-colors">
        <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{isHome ? 'vs' : '@'} {oppTeam?.name}</span>
        {isLive && <span className="text-[9px] font-bold text-[var(--red)]">LIVE</span>}
        {isCompleted && myScore != null ? (
          <span className={`text-xs font-bold shrink-0 ${resultColor}`}>{myScore}–{oppScore}</span>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] shrink-0">{fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</span>
        )}
      </div>
    </Link>
  )
}

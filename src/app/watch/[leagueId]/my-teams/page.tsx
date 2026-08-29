'use client'
import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicShell, PublicNotAvailable } from '@/components/layout/PublicShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/LoadingSpinner'
import { fetchPublicLeagueData, type PublicLeagueData } from '@/lib/publicLeague'

export default function PublicMyTeamsPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = use(params)
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

  const { players, playerScores, assignments, teamScores, powerUps } = data
  const selectedId = asPlayerId ?? players[0]?.id ?? null
  const selectedPlayer = players.find((p: any) => p.id === selectedId)

  const teamPtsMap = new Map<string, number>()
  for (const ts of teamScores) teamPtsMap.set(ts.team_id, (teamPtsMap.get(ts.team_id) ?? 0) + (ts.total_points ?? 0))

  function teamsFor(playerId: string) {
    return assignments
      .filter((a: any) => a.player_id === playerId && a.teams)
      .map((a: any) => {
        const team = a.teams
        const scores = teamScores.filter((ts: any) => ts.team_id === team.id)
        const score = scores.length > 0 ? {
          wins: scores.reduce((s: number, ts: any) => s + (ts.wins ?? 0), 0),
          draws: scores.reduce((s: number, ts: any) => s + (ts.draws ?? 0), 0),
          losses: scores.reduce((s: number, ts: any) => s + (ts.losses ?? 0), 0),
          goals_for: scores.reduce((s: number, ts: any) => s + (ts.goals_for ?? 0), 0),
          goals_against: scores.reduce((s: number, ts: any) => s + (ts.goals_against ?? 0), 0),
          total_points: scores.reduce((s: number, ts: any) => s + (ts.total_points ?? 0), 0),
        } : null
        return { team, score }
      })
      .sort((a: any, b: any) => (teamPtsMap.get(b.team.id) ?? 0) - (teamPtsMap.get(a.team.id) ?? 0))
  }

  const myTeams = selectedId ? teamsFor(selectedId) : []
  const myTotal = myTeams.reduce((s: number, t: any) => s + (t.score?.total_points ?? 0), 0)

  const myDon = powerUps.filter((p: any) => p.power_up_type === 'double_or_nothing' && p.player_id === selectedId)
  const donByTeamMonth = new Map<string, { team: any; month: string; total: number; applied: number }>()
  for (const p of myDon) {
    const key = `${p.team_id}-${p.season_month}`
    const g = donByTeamMonth.get(key) ?? { team: p.teams, month: p.season_month, total: 0, applied: 0 }
    g.total++
    if (p.status === 'applied') g.applied++
    donByTeamMonth.set(key, g)
  }

  return (
    <PublicShell leagueId={leagueId} players={players} selectedPlayerId={selectedId}>
      <h1 className="font-bold text-base text-[var(--text-primary)] mb-3">My Teams</h1>

      {selectedPlayer && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-4 flex items-center gap-2.5">
          <Avatar name={selectedPlayer.name} color={selectedPlayer.color} size="md" />
          <span className="flex-1 min-w-0 font-semibold text-sm text-[var(--text-primary)] truncate">{selectedPlayer.name}</span>
          <span className="font-display font-black text-xl text-[var(--text-primary)]">{myTotal}</span>
          <span className="text-[10px] text-[var(--text-secondary)]">pts</span>
        </div>
      )}

      {myTeams.length === 0 ? (
        <EmptyState icon="🎯" title="No clubs assigned yet" />
      ) : (
        <div className="space-y-2 mb-5">
          {myTeams.map(({ team, score }: any) => {
            const gd = (score?.goals_for ?? 0) - (score?.goals_against ?? 0)
            const donEntries = [...donByTeamMonth.values()].filter(g => g.team?.id === team.id)
            return (
              <div key={team.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                <Link href={`/watch/${leagueId}/teams/${team.id}${selectedId ? `?as=${selectedId}` : ''}`} className="flex items-center gap-2 px-2.5 py-2 min-h-[40px]">
                  <TeamCrest team={team} size="xs" />
                  <span className="flex-1 min-w-0 font-medium text-xs text-[var(--text-primary)] truncate">{team.short_name || team.name}</span>
                  <span className="text-[10px] shrink-0 tabular-nums">
                    <span className="text-emerald-400">{score?.wins ?? 0}W</span>{' '}
                    <span className="text-amber-400">{score?.draws ?? 0}D</span>{' '}
                    <span className="text-red-400">{score?.losses ?? 0}L</span>
                  </span>
                  <span className={`text-[10px] w-8 text-right shrink-0 tabular-nums ${gd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{gd >= 0 ? `+${gd}` : gd}</span>
                  <span className="font-bold text-xs text-[var(--text-primary)] w-10 text-right shrink-0 tabular-nums">
                    {score?.total_points ?? 0}<span className="text-[9px] text-[var(--text-secondary)] font-normal"> pts</span>
                  </span>
                </Link>
                {donEntries.length > 0 && (
                  <div className="px-2.5 pb-2 flex flex-wrap gap-1.5">
                    {donEntries.map((g, i) => (
                      <span key={i} className="text-[9px] font-bold text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded-full">
                        ⚡ {formatMonth(g.month)} · {g.applied}/{g.total}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">All players</p>
      <div className="space-y-2">
        {players.map((p: any) => {
          const score = playerScores.find((s: any) => s.player_id === p.id)
          const teams = teamsFor(p.id)
          const isSelected = p.id === selectedId
          return (
            <Link
              key={p.id}
              href={`/watch/${leagueId}/my-teams?as=${p.id}`}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border overflow-hidden"
              style={{ borderColor: `${p.color}${isSelected ? '50' : '20'}`, background: `${p.color}08` }}
            >
              <Avatar name={p.name} color={p.color} size="sm" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm text-[var(--text-primary)] block truncate">{p.name}</span>
                <span className="text-[10px] text-[var(--text-secondary)]">{teams.length} teams</span>
              </div>
              <span className="font-bold text-sm text-[var(--text-primary)]">{score?.total_points ?? 0}</span>
              <span className="text-[10px] text-[var(--text-secondary)]">pts</span>
            </Link>
          )
        })}
      </div>
    </PublicShell>
  )
}

function formatMonth(ym: string): string {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short' })
}

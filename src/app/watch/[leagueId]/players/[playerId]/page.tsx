'use client'
import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicShell, PublicNotAvailable } from '@/components/layout/PublicShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { PageLoader, ErrorState } from '@/components/ui/LoadingSpinner'
import { fetchPublicLeagueData, type PublicLeagueData } from '@/lib/publicLeague'

export default function PublicPlayerDetailPage({ params }: { params: Promise<{ leagueId: string; playerId: string }> }) {
  const { leagueId, playerId } = use(params)
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

  const { players, playerScores, assignments, teamScores } = data
  const player = players.find((p: any) => p.id === playerId)
  if (!player) return <ErrorState title="Player not found" onRetry={load} />

  const score = playerScores.find((s: any) => s.player_id === playerId)
  const sorted = [...playerScores].sort((a: any, b: any) => b.total_points - a.total_points)
  const position = sorted.findIndex((s: any) => s.player_id === playerId) + 1

  const teamPtsMap = new Map<string, number>()
  for (const ts of teamScores) teamPtsMap.set(ts.team_id, (teamPtsMap.get(ts.team_id) ?? 0) + (ts.total_points ?? 0))

  const teams = assignments
    .filter((a: any) => a.player_id === playerId && a.teams)
    .map((a: any) => a.teams)
    .sort((a: any, b: any) => (teamPtsMap.get(b.id) ?? 0) - (teamPtsMap.get(a.id) ?? 0))

  return (
    <PublicShell leagueId={leagueId} players={players} selectedPlayerId={asPlayerId} title={player.name} backHref={`/watch/${leagueId}/standings`}>
      <div className="rounded-2xl border p-4 mb-3 flex items-center gap-4" style={{ borderColor: `${player.color}35`, background: `${player.color}0a` }}>
        <Avatar name={player.name} color={player.color} size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-[var(--text-primary)] truncate">{player.name}</h2>
          {position > 0 && <p className="text-xs text-[var(--text-secondary)]">#{position} of {players.length}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-3xl font-black" style={{ color: player.color }}>{score?.total_points ?? 0}</p>
          <p className="text-[10px] text-[var(--text-secondary)]">pts</p>
        </div>
      </div>

      {score && (
        <div className="grid grid-cols-3 gap-2 mb-5">
          <StatTile label="W" value={score.wins} color="text-emerald-400" />
          <StatTile label="D" value={score.draws} color="text-amber-400" />
          <StatTile label="L" value={score.losses} color="text-red-400" />
        </div>
      )}

      {teams.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">Clubs</p>
          <div className="space-y-2">
            {teams.map((team: any) => (
              <Link key={team.id} href={`/watch/${leagueId}/teams/${team.id}${asPlayerId ? `?as=${asPlayerId}` : ''}`}>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 flex items-center gap-3">
                  <TeamCrest team={team} size="sm" />
                  <span className="flex-1 min-w-0 font-medium text-sm text-[var(--text-primary)] truncate">{team.name}</span>
                  <span className="text-xs font-bold text-[var(--text-primary)] shrink-0">{teamPtsMap.get(team.id) ?? 0}<span className="text-[9px] text-[var(--text-secondary)] font-normal"> pts</span></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </PublicShell>
  )
}

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-center py-3">
      <p className={`text-xl font-black ${color}`}>{value}</p>
      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{label}</p>
    </div>
  )
}

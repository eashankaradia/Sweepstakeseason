import { cookies } from 'next/headers'
import { getLeagueById, getPlayers, getPlayerScores, getAssignments } from '@/lib/data'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/LoadingSpinner'

export default async function StandingsPage() {
  const cookieStore = await cookies()
  const leagueId = cookieStore.get('ss_league')?.value
  const league = leagueId ? await getLeagueById(leagueId) : null

  if (!league) {
    return (
      <AppShell title="Standings">
        <EmptyState icon="🏆" title="No league yet" description="Set up a league to see standings." />
      </AppShell>
    )
  }

  const [players, playerScores, assignments] = await Promise.all([
    getPlayers(league.id),
    getPlayerScores(league.id),
    getAssignments(league.id),
  ])

  const standings = players.map(player => {
    const score = playerScores.find(s => s.player_id === player.id)
    const teams = assignments.filter(a => a.player_id === player.id).map(a => a.team).filter(Boolean)
    return {
      player,
      score,
      teams,
      totalPoints: score?.total_points ?? 0,
      wins: score?.wins ?? 0,
      draws: score?.draws ?? 0,
      losses: score?.losses ?? 0,
      played: score?.matches_played ?? 0,
    }
  }).sort((a, b) => b.totalPoints - a.totalPoints || a.player.position - b.player.position)

  const hasDraft = assignments.length > 0

  return (
    <AppShell title="Standings">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
        <Badge variant={league.status === 'active' ? 'success' : 'warning'}>
          {league.status}
        </Badge>
      </div>

      {standings.length === 0 ? (
        <EmptyState icon="👥" title="No players yet" description="Add players in settings to see standings." />
      ) : (
        <Card className="overflow-hidden !p-0">
          <div className="grid grid-cols-[34px_minmax(0,1fr)_30px_30px_30px_42px] gap-1 border-b border-[var(--border)] px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <span>#</span>
            <span>Player</span>
            <span className="text-center">P</span>
            <span className="text-center">W</span>
            <span className="text-center">D</span>
            <span className="text-right">Pts</span>
          </div>

          {standings.map((entry, idx) => (
            <div
              key={entry.player.id}
              className="grid grid-cols-[34px_minmax(0,1fr)_30px_30px_30px_42px] gap-1 border-b border-[var(--border)] px-3 py-2.5 last:border-b-0"
            >
              <div className="flex items-center">
                <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
                  idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                  idx === 1 ? 'bg-slate-400/20 text-slate-300' :
                  idx === 2 ? 'bg-orange-600/20 text-orange-400' :
                  'bg-[var(--border)] text-[var(--text-muted)]'
                }`}>
                  {idx + 1}
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Avatar name={entry.player.name} color={entry.player.color} size="sm" className="!h-6 !w-6 !text-[10px]" />
                  <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{entry.player.name}</span>
                </div>
                {entry.teams.length > 0 ? (
                  <div className="mt-1 flex gap-1 overflow-hidden">
                    {entry.teams.slice(0, 5).map(team => (
                      <TeamCrest key={team.id} team={team} size="xs" />
                    ))}
                  </div>
                ) : (
                  <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{hasDraft ? 'No teams' : 'Draft pending'}</p>
                )}
              </div>

              <Cell value={entry.played} />
              <Cell value={entry.wins} className="text-emerald-400" />
              <Cell value={entry.draws} className="text-amber-400" />
              <div className="flex items-center justify-end text-base font-bold text-[var(--text-primary)]">{entry.totalPoints}</div>
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  )
}

function Cell({ value, className = 'text-[var(--text-primary)]' }: { value: number; className?: string }) {
  return (
    <div className={`flex items-center justify-center text-xs font-semibold ${className}`}>
      {value}
    </div>
  )
}

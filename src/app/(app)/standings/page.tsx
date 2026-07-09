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
    const teams = assignments.filter(a => a.player_id === player.id).map(a => (a as any).team)
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
  }).sort((a, b) => b.totalPoints - a.totalPoints)

  const hasDraft = assignments.length > 0

  return (
    <AppShell title="Standings">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
        <Badge variant={league.status === 'active' ? 'success' : 'warning'}>
          {league.status}
        </Badge>
      </div>

      {standings.length === 0 ? (
        <EmptyState icon="👥" title="No players yet" description="Add players in the settings to see standings." />
      ) : (
        <div className="space-y-2">
          {standings.map((entry, idx) => (
            <Card key={entry.player.id}>
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                  idx === 1 ? 'bg-slate-400/20 text-slate-400' :
                  idx === 2 ? 'bg-orange-600/20 text-orange-500' :
                  'bg-[var(--border)] text-[var(--text-muted)]'
                }`}>
                  {idx + 1}
                </div>

                <Avatar name={entry.player.name} color={entry.player.color} size="md" />

                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm text-[var(--text-primary)] truncate block">
                    {entry.player.name}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {hasDraft ? (
                      <>
                        <span className="text-[10px] text-[var(--text-muted)]">{entry.played}P</span>
                        <span className="text-[10px] text-emerald-400">{entry.wins}W</span>
                        <span className="text-[10px] text-amber-400">{entry.draws}D</span>
                        <span className="text-[10px] text-red-400">{entry.losses}L</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)]">Draft pending</span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-bold text-[var(--text-primary)]">{entry.totalPoints}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">pts</div>
                </div>
              </div>

              {entry.teams.length > 0 && (
                <div className="mt-2.5 flex gap-1.5 flex-wrap">
                  {entry.teams.filter(Boolean).map((team: any) => (
                    <TeamCrest key={team.id} team={team} size="xs" />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  )
}

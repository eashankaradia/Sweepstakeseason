import { cookies } from 'next/headers'
import { getLeagueById, getPlayers, getAssignments, getTeamScores } from '@/lib/data'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { EmptyState } from '@/components/ui/LoadingSpinner'

export default async function MyTeamsPage() {
  const cookieStore = await cookies()
  const leagueId = cookieStore.get('ss_league')?.value
  const league = leagueId ? await getLeagueById(leagueId) : null

  if (!league) {
    return (
      <AppShell title="Teams">
        <EmptyState icon="⚽" title="No league yet" />
      </AppShell>
    )
  }

  const [players, assignments, teamScores] = await Promise.all([
    getPlayers(league.id),
    getAssignments(league.id),
    getTeamScores(league.id),
  ])

  if (assignments.length === 0) {
    return (
      <AppShell title="Teams">
        <EmptyState
          icon="🎯"
          title="Draft pending"
          description="Teams will appear here after the draft is run."
        />
      </AppShell>
    )
  }

  const playerEntries = players.map(player => {
    const playerAssignments = assignments.filter(a => a.player_id === player.id)
    const teams = playerAssignments.map(a => {
      const team = (a as any).team
      const score = teamScores.find(ts => ts.team_id === team?.id)
      return { team, score }
    }).filter(x => !!x.team)
    const total = teams.reduce((sum, t) => sum + (t.score?.total_points ?? 0), 0)
    return { player, teams, total }
  }).sort((a, b) => b.total - a.total)

  return (
    <AppShell title="Teams">
      <div className="space-y-4">
        {playerEntries.map(({ player, teams, total }) => (
          <div key={player.id}>
            <div className="flex items-center gap-2 mb-2">
              <Avatar name={player.name} color={player.color} size="sm" />
              <span className="font-semibold text-sm text-[var(--text-primary)] flex-1">{player.name}</span>
              <span className="font-bold text-[var(--text-primary)]">{total} pts</span>
            </div>
            <div className="space-y-1.5">
              {teams.map(({ team, score }) => (
                <Card key={team.id} className="!p-3">
                  <div className="flex items-center gap-2.5">
                    <TeamCrest team={team} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[var(--text-primary)]">{team.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{team.country}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-[var(--text-primary)]">{score?.total_points ?? 0}</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">pts</div>
                    </div>
                  </div>
                  {score && score.matches_played > 0 && (
                    <div className="mt-1.5 flex gap-2 text-[10px]">
                      <span className="text-emerald-400">{score.wins}W</span>
                      <span className="text-amber-400">{score.draws}D</span>
                      <span className="text-red-400">{score.losses}L</span>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}

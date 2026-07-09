import { createClient } from '@/lib/supabase/server'
import { getProfile, getActiveLeague, getPlayers, getAssignments, getFixtures, getTeamScores, getCompetitions } from '@/lib/data'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { EmptyState } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

export default async function MyTeamsPage() {
  const [profile, league] = await Promise.all([getProfile(), getActiveLeague()])

  if (!league) {
    return (
      <AppShell profile={profile} title="My Teams">
        <EmptyState icon="⚽" title="No league yet" />
      </AppShell>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [players, assignments, teamScores] = await Promise.all([
    getPlayers(league.id),
    getAssignments(league.id),
    getTeamScores(league.id),
  ])

  const myPlayer = players.find(p => p.user_id === user?.id)
  const myAssignments = myPlayer ? assignments.filter(a => a.player_id === myPlayer.id) : []
  const myTeams = myAssignments.map(a => {
    const team = (a as any).team
    const score = teamScores.find(ts => ts.team_id === team?.id)
    return { assignment: a, team, score }
  }).filter(x => !!x.team)

  const totalPoints = myTeams.reduce((sum, t) => sum + (t.score?.total_points ?? 0), 0)

  const myTeamIds = myTeams.map(t => t.team?.id).filter(Boolean)
  const upcomingFixtures: any[] = []
  for (const teamId of myTeamIds) {
    const fixtures = await getFixtures(league.id, { teamId, status: 'scheduled', limit: 3 })
    upcomingFixtures.push(...fixtures)
  }
  const uniqueFixtures = upcomingFixtures
    .filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i)
    .sort((a, b) => new Date(a.kickoff_time ?? 0).getTime() - new Date(b.kickoff_time ?? 0).getTime())
    .slice(0, 5)

  return (
    <AppShell profile={profile} title="My Teams">
      {!myPlayer ? (
        <EmptyState
          icon="👤"
          title="Not linked to a player"
          description="Ask an admin to link your account to a player in the league."
        />
      ) : myTeams.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="No teams assigned yet"
          description="The draft hasn't been run yet. Check back soon."
        />
      ) : (
        <>
          <div className="mb-4">
            <p className="text-xs text-[var(--text-secondary)] mb-1">{myPlayer.name}</p>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-xl text-[var(--text-primary)]">
                {totalPoints} <span className="text-sm font-normal text-[var(--text-secondary)]">total pts</span>
              </h2>
              <div className="flex gap-1.5">
                {myTeams.map(t => (
                  <TeamCrest key={t.team.id} team={t.team} size="sm" />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {myTeams.map(({ team, score }) => (
              <Card key={team.id}>
                <div className="flex items-center gap-3">
                  <TeamCrest team={team} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[var(--text-primary)]">{team.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{team.country} · Tier {team.tier}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-[var(--text-primary)]">{score?.total_points ?? 0}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">pts</div>
                  </div>
                </div>
                {score && score.matches_played > 0 && (
                  <div className="mt-2 flex gap-3 text-xs text-[var(--text-secondary)]">
                    <span className="text-emerald-400">{score.wins}W</span>
                    <span className="text-amber-400">{score.draws}D</span>
                    <span className="text-red-400">{score.losses}L</span>
                    <span className="ml-auto">{score.goals_for}:{score.goals_against} GD</span>
                  </div>
                )}
              </Card>
            ))}
          </div>

          {uniqueFixtures.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">Upcoming</h3>
                <Link href="/fixtures" className="text-xs text-[var(--accent)]">All fixtures</Link>
              </div>
              <div className="space-y-2">
                {uniqueFixtures.map((f: any) => {
                  const isMyHome = myTeamIds.includes(f.home_team_id)
                  const isMyAway = myTeamIds.includes(f.away_team_id)
                  return (
                    <Card key={f.id} className="!p-3">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] mb-1.5">
                        <span>{f.competition?.short_name}</span>
                        {f.kickoff_time && <span className="ml-auto">{formatDateTime(f.kickoff_time)}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <TeamCrest team={f.home_team} size="xs" />
                          <span className={`text-xs truncate ${isMyHome ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                            {f.home_team?.name}
                          </span>
                        </div>
                        <span className="text-[var(--text-muted)] text-xs shrink-0">vs</span>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                          <span className={`text-xs truncate text-right ${isMyAway ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                            {f.away_team?.name}
                          </span>
                          <TeamCrest team={f.away_team} size="xs" />
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}

import { getProfile, getActiveLeague, getPlayers, getAssignments, getCompetitions, getTeamScores } from '@/lib/data'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/LoadingSpinner'
import { createClient } from '@/lib/supabase/server'
import type { Competition, Team } from '@/lib/supabase/types'

export default async function TeamsPage() {
  const [profile, league] = await Promise.all([getProfile(), getActiveLeague()])

  if (!league) {
    return (
      <AppShell profile={profile} title="Teams">
        <EmptyState icon="⚽" title="No league yet" />
      </AppShell>
    )
  }

  const supabase = await createClient()

  const [players, assignments, teamScores] = await Promise.all([
    getPlayers(league.id),
    getAssignments(league.id),
    getTeamScores(league.id),
  ])

  const { data: teamCompData } = await supabase
    .from('team_competitions')
    .select(`
      team_id,
      competition_id,
      teams (*),
      competitions (*)
    `)
    .eq('league_id', league.id)

  const competitionMap = new Map<string, { competition: Competition; teams: Array<Team & { assignedPlayer: typeof players[0] | null; score: any }> }>()

  for (const row of (teamCompData ?? []) as any[]) {
    const comp: Competition = row.competitions
    if (!comp.enabled) continue

    if (!competitionMap.has(comp.id)) {
      competitionMap.set(comp.id, { competition: comp, teams: [] })
    }

    const team: Team = row.teams
    const assignment = assignments.find(a => a.team_id === team.id)
    const assignedPlayer = assignment ? players.find(p => p.id === assignment.player_id) ?? null : null
    const score = teamScores.find(ts => ts.team_id === team.id)

    const existing = competitionMap.get(comp.id)!
    if (!existing.teams.find(t => t.id === team.id)) {
      existing.teams.push({ ...team, assignedPlayer, score })
    }
  }

  const sortedCompetitions = Array.from(competitionMap.values()).sort(
    (a, b) => a.competition.display_order - b.competition.display_order
  )

  for (const entry of sortedCompetitions) {
    entry.teams.sort((a, b) => (b.score?.total_points ?? 0) - (a.score?.total_points ?? 0))
  }

  return (
    <AppShell profile={profile} title="Teams">
      {sortedCompetitions.length === 0 ? (
        <EmptyState
          icon="⚽"
          title="No teams assigned"
          description="Enable competitions and run the draft to see teams here."
        />
      ) : (
        <div className="space-y-5">
          {sortedCompetitions.map(({ competition, teams }) => (
            <div key={competition.id}>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={competition.competition_type === 'european' ? 'purple' : 'default'}>
                  {competition.short_name}
                </Badge>
                <span className="text-xs text-[var(--text-secondary)]">{teams.length} teams</span>
              </div>
              <div className="space-y-1.5">
                {teams.map(team => (
                  <Card key={team.id} className="!p-3">
                    <div className="flex items-center gap-2.5">
                      <TeamCrest team={team} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[var(--text-primary)] truncate">{team.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-[var(--text-secondary)]">{team.country}</span>
                          <TierBadge tier={team.tier} />
                        </div>
                      </div>
                      {team.assignedPlayer ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Avatar name={team.assignedPlayer.name} color={team.assignedPlayer.color} size="sm" />
                          <div className="text-right">
                            <div className="text-xs font-semibold text-[var(--text-primary)]">
                              {team.score?.total_points ?? 0}
                            </div>
                            <div className="text-[9px] text-[var(--text-secondary)]">pts</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">Unassigned</span>
                      )}
                    </div>
                    {team.score && team.score.matches_played > 0 && (
                      <div className="mt-1.5 flex gap-2 text-[10px]">
                        <span className="text-emerald-400">{team.score.wins}W</span>
                        <span className="text-amber-400">{team.score.draws}D</span>
                        <span className="text-red-400">{team.score.losses}L</span>
                        <span className="text-[var(--text-muted)]">· {team.score.matches_played} played</span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}

function TierBadge({ tier }: { tier: number }) {
  const labels = ['', 'Elite', 'Top', 'Mid', 'Lower']
  const variants = ['', 'warning', 'info', 'success', 'muted'] as const
  return (
    <Badge variant={variants[tier] || 'muted'} className="text-[9px] px-1 py-0">
      {labels[tier] || 'T' + tier}
    </Badge>
  )
}

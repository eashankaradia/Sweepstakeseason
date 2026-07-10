import { cookies } from 'next/headers'
import { getLeagueById, getPlayers, getAssignments, getTeamScores } from '@/lib/data'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/LoadingSpinner'
import { createClient } from '@/lib/supabase/server'
import type { Competition, Team } from '@/lib/supabase/types'
import Link from 'next/link'

export default async function TeamsPage() {
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

  const supabase = await createClient()

  const [players, assignments, teamScores] = await Promise.all([
    getPlayers(league.id),
    getAssignments(league.id),
    getTeamScores(league.id),
  ])

  const { data: teamCompData } = await supabase
    .from('team_competitions')
    .select(`team_id, competition_id, teams (*), competitions (*)`)
    .eq('league_id', league.id)

  const competitionMap = new Map<string, { competition: Competition; teams: Array<Team & { assignedPlayer: typeof players[0] | null; score: any }> }>()

  for (const row of (teamCompData ?? []) as any[]) {
    const comp: Competition = row.competitions
    if (!comp.enabled) continue
    if (!competitionMap.has(comp.id)) competitionMap.set(comp.id, { competition: comp, teams: [] })
    const team: Team = row.teams
    const assignment = assignments.find(a => a.team_id === team.id)
    const assignedPlayer = assignment ? players.find(p => p.id === assignment.player_id) ?? null : null
    const score = teamScores.find(ts => ts.team_id === team.id)
    const existing = competitionMap.get(comp.id)!
    if (!existing.teams.find(t => t.id === team.id)) existing.teams.push({ ...team, assignedPlayer, score })
  }

  const sortedCompetitions = Array.from(competitionMap.values()).sort(
    (a, b) => a.competition.display_order - b.competition.display_order
  )
  for (const entry of sortedCompetitions) {
    entry.teams.sort((a, b) => (b.score?.total_points ?? 0) - (a.score?.total_points ?? 0))
  }

  return (
    <AppShell title="Teams">
      {sortedCompetitions.length === 0 ? (
        <EmptyState icon="⚽" title="No teams assigned" description="Enable competitions and run the draft to see teams here." />
      ) : (
        <div className="space-y-5">
          {sortedCompetitions.map(({ competition, teams }) => {
            const isEuropean = competition.competition_type === 'european'
            return (
              <div key={competition.id}>
                {/* Competition header */}
                <div
                  className="rounded-t-xl border border-b-0 px-3 py-2.5 flex items-center gap-2"
                  style={{
                    background: isEuropean ? 'rgba(168,85,247,0.08)' : 'rgba(99,102,241,0.08)',
                    borderColor: isEuropean ? 'rgba(168,85,247,0.25)' : 'rgba(99,102,241,0.25)',
                  }}
                >
                  <Badge variant={isEuropean ? 'purple' : 'default'} className="font-bold">
                    {competition.short_name}
                  </Badge>
                  <span className="text-xs font-medium text-[var(--text-secondary)] flex-1 truncate">{competition.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{teams.length} teams</span>
                </div>

                {/* Team rows */}
                <div
                  className="rounded-b-xl border overflow-hidden divide-y divide-[var(--border)]"
                  style={{
                    borderColor: isEuropean ? 'rgba(168,85,247,0.25)' : 'rgba(99,102,241,0.25)',
                  }}
                >
                  {teams.map(team => (
                    <Link key={team.id} href={`/teams/${team.id}`}>
                    <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--bg-card)] hover:bg-[var(--border)]/30 transition-colors cursor-pointer">
                      <TeamCrest team={team} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[var(--text-primary)] truncate">{team.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-[var(--text-secondary)]">{team.country}</span>
                          <TierBadge tier={team.tier} />
                          {team.score && team.score.matches_played > 0 && (
                            <span className="text-[10px] text-[var(--text-muted)]">
                              · <span className="text-emerald-400">{team.score.wins}W</span>{' '}
                              <span className="text-amber-400">{team.score.draws}D</span>{' '}
                              <span className="text-red-400">{team.score.losses}L</span>
                            </span>
                          )}
                        </div>
                      </div>
                      {team.assignedPlayer ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Avatar name={team.assignedPlayer.name} color={team.assignedPlayer.color} size="sm" />
                          <div className="text-right">
                            <div className="text-xs font-semibold text-[var(--text-primary)]">{team.score?.total_points ?? 0}</div>
                            <div className="text-[9px] text-[var(--text-secondary)]">pts</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)] shrink-0">Unassigned</span>
                      )}
                    </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
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

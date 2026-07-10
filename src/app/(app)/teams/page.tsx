'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

type SortMode = 'sweepstake' | 'last-season'

export default function TeamsPage() {
  const [sortedCompetitions, setSortedCompetitions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('sweepstake')

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const [
      { data: teamCompData },
      { data: assignments },
      { data: players },
      { data: teamScores },
    ] = await Promise.all([
      supabase.from('team_competitions')
        .select('team_id, competition_id, teams(*), competitions(*)')
        .eq('league_id', leagueId),
      supabase.from('player_team_assignments')
        .select('team_id, player_id, players(id, name, color)')
        .eq('league_id', leagueId),
      supabase.from('players').select('*').eq('league_id', leagueId),
      supabase.from('team_scores').select('team_id, total_points, wins, draws, losses, matches_played').eq('league_id', leagueId),
    ])

    const assignMap = new Map<string, any>()
    for (const a of (assignments ?? []) as any[]) {
      if (a.team_id) assignMap.set(a.team_id, a.players)
    }

    const scoreMap = new Map<string, any>()
    for (const ts of (teamScores ?? []) as any[]) {
      if (!scoreMap.has(ts.team_id)) scoreMap.set(ts.team_id, { total_points: 0, wins: 0, draws: 0, losses: 0, matches_played: 0 })
      const s = scoreMap.get(ts.team_id)!
      s.total_points += ts.total_points ?? 0
      s.wins += ts.wins ?? 0
      s.draws += ts.draws ?? 0
      s.losses += ts.losses ?? 0
      s.matches_played += ts.matches_played ?? 0
    }

    const competitionMap = new Map<string, { competition: any; teams: any[] }>()
    for (const row of (teamCompData ?? []) as any[]) {
      const comp = row.competitions
      if (!comp || !comp.enabled) continue
      if (!competitionMap.has(comp.id)) competitionMap.set(comp.id, { competition: comp, teams: [] })
      const team = row.teams
      if (!team) continue
      const existing = competitionMap.get(comp.id)!
      if (!existing.teams.find((t: any) => t.id === team.id)) {
        existing.teams.push({
          ...team,
          assignedPlayer: assignMap.get(team.id) ?? null,
          score: scoreMap.get(team.id) ?? null,
        })
      }
    }

    const comps = Array.from(competitionMap.values()).sort(
      (a, b) => a.competition.display_order - b.competition.display_order
    )

    setSortedCompetitions(comps)
    setLoading(false)
  }

  function sortTeams(teams: any[], mode: SortMode) {
    return [...teams].sort((a, b) => {
      if (mode === 'last-season') {
        return (a.league_position ?? 999) - (b.league_position ?? 999)
      }
      return (b.score?.total_points ?? 0) - (a.score?.total_points ?? 0)
    })
  }

  if (loading) return <AppShell title="Teams"><PageLoader /></AppShell>

  const hasTeams = sortedCompetitions.some(c => c.teams.length > 0)

  return (
    <AppShell title="Teams">
      {/* Sort mode toggle */}
      {hasTeams && (
        <div className="flex items-center gap-1.5 mb-4">
          <span className="text-[10px] text-[var(--text-muted)] mr-1">Sort by</span>
          {(['sweepstake', 'last-season'] as SortMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`px-3 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                sortMode === mode
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              {mode === 'sweepstake' ? '⚽ Sweepstake pts' : '📅 Last season'}
            </button>
          ))}
        </div>
      )}

      {!hasTeams ? (
        <EmptyState icon="⚽" title="No teams assigned" description="Enable competitions and run the draft to see teams here." />
      ) : (
        <div className="space-y-5">
          {sortedCompetitions.map(({ competition, teams }) => {
            const isEuropean = competition.competition_type === 'european'
            const isCup = competition.competition_type === 'domestic_cup'
            const sorted = sortTeams(teams, sortMode)
            return (
              <div key={competition.id}>
                <div
                  className="rounded-t-xl border border-b-0 px-3 py-2.5 flex items-center gap-2"
                  style={{
                    background: isEuropean ? 'rgba(168,85,247,0.08)' : isCup ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.08)',
                    borderColor: isEuropean ? 'rgba(168,85,247,0.25)' : isCup ? 'rgba(245,158,11,0.25)' : 'rgba(99,102,241,0.25)',
                  }}
                >
                  <Badge variant={isEuropean ? 'purple' : isCup ? 'warning' : 'default'} className="font-bold">
                    {competition.short_name}
                  </Badge>
                  <span className="text-xs font-medium text-[var(--text-secondary)] flex-1 truncate">{competition.name}</span>
                  {isCup && <span className="text-[9px] text-amber-400/70 italic">no sweepstake pts</span>}
                  <span className="text-[10px] text-[var(--text-muted)]">{teams.length} teams</span>
                </div>

                <div
                  className="rounded-b-xl border overflow-hidden divide-y divide-[var(--border)]"
                  style={{
                    borderColor: isEuropean ? 'rgba(168,85,247,0.25)' : isCup ? 'rgba(245,158,11,0.25)' : 'rgba(99,102,241,0.25)',
                  }}
                >
                  {sorted.map((team: any, idx: number) => (
                    <Link key={team.id} href={`/teams/${team.id}`}>
                      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--bg-card)] hover:bg-[var(--border)]/30 transition-colors cursor-pointer">
                        {sortMode === 'last-season' && (
                          <span className="text-[10px] text-[var(--text-muted)] w-5 text-center shrink-0">
                            {team.league_position ?? idx + 1}
                          </span>
                        )}
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

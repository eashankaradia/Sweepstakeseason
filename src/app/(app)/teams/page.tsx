'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { OwnerStack } from '@/components/ui/OwnerStack'
import { FilterChip } from '@/components/ui/FilterChip'
import { CompetitionBadge } from '@/components/ui/CompetitionBadge'
import { PageLoader, EmptyState, ErrorState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

type SortMode = 'sweepstake' | 'last-season'

export default function TeamsPage() {
  const [sortedCompetitions, setSortedCompetitions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('sweepstake')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(false)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    try {

    const [
      { data: teamCompData },
      { data: assignments },
      { data: teamScores },
    ] = await Promise.all([
      supabase.from('team_competitions')
        .select('team_id, competition_id, teams(*), competitions(*)')
        .eq('league_id', leagueId),
      supabase.from('player_team_assignments')
        .select('team_id, player_id, players(id, name, color)')
        .eq('league_id', leagueId),
      supabase.from('team_scores')
        .select('team_id, total_points, wins, draws, losses, matches_played')
        .eq('league_id', leagueId),
    ])

    // Multi-owner map: team_id → players[]
    const assignMap = new Map<string, any[]>()
    for (const a of (assignments ?? []) as any[]) {
      if (a.team_id && a.players) {
        const arr = assignMap.get(a.team_id) ?? []
        arr.push(a.players)
        assignMap.set(a.team_id, arr)
      }
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
      if (!comp || !comp.enabled || comp.competition_type === 'domestic_cup') continue
      if (!competitionMap.has(comp.id)) competitionMap.set(comp.id, { competition: comp, teams: [] })
      const team = row.teams
      if (!team) continue
      const existing = competitionMap.get(comp.id)!
      if (!existing.teams.find((t: any) => t.id === team.id)) {
        existing.teams.push({
          ...team,
          owners: assignMap.get(team.id) ?? [],
          score: scoreMap.get(team.id) ?? null,
        })
      }
    }

    const comps = Array.from(competitionMap.values())
      .filter(c => c.teams.length > 0)
      .sort((a, b) => a.competition.display_order - b.competition.display_order)

    setSortedCompetitions(comps)
    setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  function sortTeams(teams: any[], mode: SortMode) {
    return [...teams].sort((a, b) => {
      if (mode === 'last-season') return (a.league_position ?? 999) - (b.league_position ?? 999)
      return (b.score?.total_points ?? 0) - (a.score?.total_points ?? 0)
    })
  }

  if (loading) return <AppShell title="Teams"><PageLoader /></AppShell>

  if (error) return <AppShell title="Teams"><ErrorState onRetry={load} /></AppShell>

  const hasTeams = sortedCompetitions.some(c => c.teams.length > 0)

  return (
    <AppShell title="Teams">
      {hasTeams && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 px-0.5">Sort by</p>
          <div className="flex items-center gap-1.5">
            <FilterChip active={sortMode === 'sweepstake'} onClick={() => setSortMode('sweepstake')}>
              Sweepstake pts
            </FilterChip>
            <FilterChip active={sortMode === 'last-season'} onClick={() => setSortMode('last-season')}>
              Last season
            </FilterChip>
          </div>
        </div>
      )}

      {!hasTeams ? (
        <EmptyState icon="⚽" title="No teams assigned" description="Enable competitions and run the draft to see teams here." />
      ) : (
        <div className="space-y-5">
          {sortedCompetitions.map(({ competition, teams }) => {
            const isEu = competition.competition_type === 'european'
            const sorted = sortTeams(teams, sortMode)
            // Domestic leagues are almost always single-country - showing "England" on
            // every single row is redundant once it's true for the whole section.
            const uniqueCountries = new Set(teams.map((t: any) => t.country).filter(Boolean))
            const sharedCountry = uniqueCountries.size === 1 ? [...uniqueCountries][0] : null
            return (
              <div key={competition.id}>
                <div className={`rounded-t-xl border border-b-0 px-3 py-2.5 flex items-center gap-2 ${isEu ? 'bg-purple-500/8 border-purple-500/25' : 'bg-[var(--accent)]/8 border-[var(--accent)]/25'}`}>
                  <CompetitionBadge
                    name={competition.name}
                    shortName={competition.short_name}
                    type={competition.competition_type}
                  />
                  <span className="text-xs font-medium text-[var(--text-secondary)] flex-1 truncate">
                    {competition.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">{teams.length} clubs</span>
                </div>

                <div className={`rounded-b-xl border overflow-hidden divide-y divide-[var(--border)] ${isEu ? 'border-purple-500/25' : 'border-[var(--accent)]/25'}`}>
                  {sorted.map((team: any, idx: number) => (
                    <Link key={team.id} href={`/teams/${team.id}`}>
                      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors min-h-[52px]">
                        {sortMode === 'last-season' && (
                          <span className="text-[10px] text-[var(--text-muted)] w-5 text-center shrink-0">
                            {team.league_position ?? idx + 1}
                          </span>
                        )}
                        <TeamCrest team={team} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-[var(--text-primary)] truncate">{team.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {!sharedCountry && (
                              <span className="text-[10px] text-[var(--text-secondary)]">{team.country}</span>
                            )}
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
                        <div className="flex items-center gap-2 shrink-0">
                          {team.owners.length > 0 ? (
                            <OwnerStack owners={team.owners} size="xs" max={3} />
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)]">—</span>
                          )}
                          <div className="text-right min-w-[28px]">
                            <div className="text-xs font-semibold text-[var(--text-primary)]">{team.score?.total_points ?? 0}</div>
                            <div className="text-[9px] text-[var(--text-secondary)]">pts</div>
                          </div>
                        </div>
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
  const labels: Record<number, string> = { 1: 'Elite', 2: 'Top', 3: 'Mid', 4: 'Lower' }
  const variants: Record<number, 'warning' | 'info' | 'success' | 'muted'> = { 1: 'warning', 2: 'info', 3: 'success', 4: 'muted' }
  if (!tier || !labels[tier]) return null
  return (
    <Badge variant={variants[tier] ?? 'muted'} className="text-[9px] px-1 py-0">
      {labels[tier]}
    </Badge>
  )
}

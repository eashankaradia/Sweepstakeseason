// Giant Killer bonus rule: a team sitting in the bottom 6 of the real
// competition table (as of strictly before a given kickoff) beats a team
// sitting in the top 6, also as of before kickoff. Only active once every
// team in the competition has played 5+ matches. This mirrors the logic in
// the sync-results Supabase edge function exactly, so the eligibility shown
// in the UI always matches what actually gets awarded.

export type GKFixture = {
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  kickoff_time: string | null
  status: string
}

export type TeamRank = { teamId: string; rank: number; played: number }

const MIN_TEAMS = 12
const MIN_PLAYED = 5
const TOP_N = 6
const BOTTOM_N = 6

/**
 * Computes each team's league rank based on completed fixtures with a
 * kickoff strictly before `beforeKickoff`. Returns null if the "every team
 * has played 5+ matches" gate isn't satisfied yet.
 */
export function computeStandingsAsOf(
  teamIds: string[],
  fixtures: GKFixture[],
  beforeKickoff: string
): Map<string, TeamRank> | null {
  const table = new Map<string, { played: number; points: number; gd: number; gf: number }>()
  for (const id of teamIds) table.set(id, { played: 0, points: 0, gd: 0, gf: 0 })

  for (const f of fixtures) {
    if (f.status !== 'completed' || f.home_score == null || f.away_score == null) continue
    if (!f.kickoff_time || f.kickoff_time >= beforeKickoff) continue
    const h = table.get(f.home_team_id)
    const a = table.get(f.away_team_id)
    if (h) {
      h.played++; h.gf += f.home_score; h.gd += f.home_score - f.away_score
      h.points += f.home_score > f.away_score ? 3 : f.home_score === f.away_score ? 1 : 0
    }
    if (a) {
      a.played++; a.gf += f.away_score; a.gd += f.away_score - f.home_score
      a.points += f.away_score > f.home_score ? 3 : f.away_score === f.home_score ? 1 : 0
    }
  }

  if ([...table.values()].some(r => r.played < MIN_PLAYED)) return null

  const sorted = [...table.entries()].sort((x, y) => y[1].points - x[1].points || y[1].gd - x[1].gd || y[1].gf - x[1].gf)
  const result = new Map<string, TeamRank>()
  sorted.forEach(([teamId, row], i) => result.set(teamId, { teamId, rank: i + 1, played: row.played }))
  return result
}

export function giantKillerEligibility(
  homeTeamId: string,
  awayTeamId: string,
  ranks: Map<string, TeamRank> | null
): { eligible: boolean; bottomTeamId?: string; topTeamId?: string } {
  if (!ranks || ranks.size < MIN_TEAMS) return { eligible: false }
  const n = ranks.size
  const bottomThreshold = n - (BOTTOM_N - 1)
  const homeRank = ranks.get(homeTeamId)?.rank
  const awayRank = ranks.get(awayTeamId)?.rank
  if (!homeRank || !awayRank) return { eligible: false }

  const homeIsBottom = homeRank >= bottomThreshold
  const homeIsTop = homeRank <= TOP_N
  const awayIsBottom = awayRank >= bottomThreshold
  const awayIsTop = awayRank <= TOP_N

  if (homeIsBottom && awayIsTop) return { eligible: true, bottomTeamId: homeTeamId, topTeamId: awayTeamId }
  if (awayIsBottom && homeIsTop) return { eligible: true, bottomTeamId: awayTeamId, topTeamId: homeTeamId }
  return { eligible: false }
}

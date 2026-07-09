import { createClient } from './supabase/server'
import type { League, Player, Competition, Team, PlayerTeamAssignment, Fixture, ScoringRule, PlayerScore, TeamScore, DraftRun } from './supabase/types'

export async function getLeagueById(id: string): Promise<League | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('sweepstake_leagues').select('*').eq('id', id).maybeSingle()
  return data
}

export async function getActiveLeague(): Promise<League | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sweepstake_leagues')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function getAllLeagues(): Promise<League[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('sweepstake_leagues').select('*').order('created_at', { ascending: false })
  return data ?? []
}

export async function getPlayers(leagueId: string): Promise<Player[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('players')
    .select('*')
    .eq('league_id', leagueId)
    .order('position', { ascending: true, nullsFirst: false })
  return data ?? []
}

export async function getCompetitions(leagueId: string): Promise<Competition[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('competitions')
    .select('*')
    .eq('league_id', leagueId)
    .order('display_order', { ascending: true })
  return data ?? []
}

export async function getTeams(): Promise<Team[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('teams').select('*').order('name', { ascending: true })
  return data ?? []
}

export async function getTeamsForLeague(leagueId: string): Promise<(Team & { competition_id: string; competition_name: string })[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('team_competitions')
    .select(`competition_id, teams (*), competitions (name, short_name)`)
    .eq('league_id', leagueId)
  if (!data) return []
  const seen = new Set<string>()
  const result: (Team & { competition_id: string; competition_name: string })[] = []
  for (const row of data as any[]) {
    if (!seen.has(row.teams.id)) {
      seen.add(row.teams.id)
      result.push({ ...row.teams, competition_id: row.competition_id, competition_name: row.competitions?.name ?? '' })
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getAssignments(leagueId: string): Promise<(PlayerTeamAssignment & { player: Player; team: Team })[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('player_team_assignments')
    .select(`*, players(*), teams(*)`)
    .eq('league_id', leagueId)
  return (data ?? []) as any[]
}

export async function getFixtures(leagueId: string, opts?: { competitionId?: string; teamId?: string; status?: string; limit?: number }): Promise<(Fixture & { competition: Competition; home_team: Team; away_team: Team })[]> {
  const supabase = await createClient()
  let q = supabase
    .from('fixtures')
    .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
    .eq('league_id', leagueId)
  if (opts?.competitionId) q = q.eq('competition_id', opts.competitionId)
  if (opts?.teamId) q = q.or(`home_team_id.eq.${opts.teamId},away_team_id.eq.${opts.teamId}`)
  if (opts?.status) q = q.eq('status', opts.status)
  if (opts?.limit) q = q.limit(opts.limit)
  q = q.order('kickoff_time', { ascending: true })
  const { data } = await q
  return (data ?? []) as any[]
}

export async function getScoringRules(leagueId: string): Promise<ScoringRule[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('scoring_rules').select('*').eq('league_id', leagueId)
  return data ?? []
}

export async function getPlayerScores(leagueId: string): Promise<(PlayerScore & { player: Player })[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('player_scores')
    .select(`*, player:players(*)`)
    .eq('league_id', leagueId)
    .order('total_points', { ascending: false })
  return (data ?? []) as any[]
}

export async function getTeamScores(leagueId: string): Promise<(TeamScore & { team: Team })[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('team_scores')
    .select(`*, team:teams(*)`)
    .eq('league_id', leagueId)
    .order('total_points', { ascending: false })
  return (data ?? []) as any[]
}

export async function getDraftRuns(leagueId: string): Promise<DraftRun[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('draft_runs')
    .select('*')
    .eq('league_id', leagueId)
    .order('run_number', { ascending: false })
  return data ?? []
}

export async function getEuropeanCompetitionTeamIds(leagueId: string): Promise<Set<string>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('team_competitions')
    .select('team_id, competitions!inner(competition_type)')
    .eq('league_id', leagueId)
    .eq('competitions.competition_type', 'european')
  if (!data) return new Set()
  return new Set((data as any[]).map(r => r.team_id))
}

import { createClient } from '@/lib/supabase/client'

export type PublicLeagueData = {
  league: any
  players: any[]
  playerScores: any[]
  assignments: any[]
  teamScores: any[]
  fixtures: any[]
  powerUps: any[]
}

/**
 * Shared read-only data loader for every /watch/[leagueId]/* page. Plain
 * function (not a hook) — each page owns its own useState/useEffect wiring,
 * matching the rest of the app's per-page load() convention, rather than a
 * shared custom hook.
 *
 * Anonymous read access relies on the DB's existing anon-readable policies
 * for players/fixtures/scores/teams/leagues (already USING(true) — not
 * something this feature changed). The one table that IS newly scoped for
 * anon here is power_up_activations, gated to
 * sweepstake_leagues.public_readonly = true AND the same
 * "Double-or-Nothing always visible, pending Reverse never" rule the
 * authenticated app enforces. `notAvailable` covers both "no such league"
 * and "league exists but hasn't opted into a public link" with the same
 * message, so a bad/guessed ID can't be used to fingerprint real leagues.
 */
export async function fetchPublicLeagueData(leagueId: string): Promise<
  { notAvailable: true; data: null } | { notAvailable: false; data: PublicLeagueData }
> {
  const supabase = createClient()

  const { data: league } = await supabase
    .from('sweepstake_leagues')
    .select('*')
    .eq('id', leagueId)
    .maybeSingle()

  if (!league || !(league as any).public_readonly) {
    return { notAvailable: true, data: null }
  }

  const [
    { data: players },
    { data: playerScores },
    { data: assignments },
    { data: teamScores },
    { data: fixtures },
    { data: powerUps },
  ] = await Promise.all([
    supabase.from('players').select('*').eq('league_id', leagueId).order('position', { ascending: true, nullsFirst: false }),
    supabase.from('player_scores').select('*').eq('league_id', leagueId),
    supabase.from('player_team_assignments').select('*, teams(*), players(id,name,color)').eq('league_id', leagueId),
    supabase.from('team_scores').select('*, teams(*)').eq('league_id', leagueId),
    supabase.from('fixtures')
      .select('*, home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
      .eq('league_id', leagueId)
      .order('kickoff_time', { ascending: false })
      .limit(200),
    supabase.from('power_up_activations')
      .select('*, players(name,color), teams(id,name,short_name,logo_url), fixtures(kickoff_time,status,home_team_id,away_team_id)')
      .eq('league_id', leagueId)
      .limit(60),
  ])

  return {
    notAvailable: false,
    data: {
      league,
      players: players ?? [],
      playerScores: playerScores ?? [],
      assignments: assignments ?? [],
      teamScores: teamScores ?? [],
      fixtures: (fixtures ?? []) as any[],
      powerUps: powerUps ?? [],
    },
  }
}

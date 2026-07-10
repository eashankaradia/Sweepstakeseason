import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchEspnFixturesForCompetition } from '@/lib/espn'
import { isAdminUser } from '@/lib/admin'
import type { Competition, Team } from '@/lib/supabase/types'

function seasonWindow(): string {
  const now = new Date()
  const year = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return `${year}0701-${year + 1}0630`
}

export async function POST() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user

  const { data: profile } = user
    ? await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
    : { data: null }

  if (!isAdminUser(user, profile)) {
    return NextResponse.json({ error: 'Only the admin can sync fixtures.' }, { status: 403 })
  }

  const { data: league } = await supabase
    .from('sweepstake_leagues')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!league) return NextResponse.json({ error: 'No league found.' }, { status: 404 })

  const [{ data: competitions }, { data: teamRows }, { data: existingFixtures }] = await Promise.all([
    supabase.from('competitions').select('*').eq('league_id', league.id).eq('enabled', true),
    supabase
      .from('team_competitions')
      .select('team_id, teams(*), competitions!inner(competition_type,enabled)')
      .eq('league_id', league.id)
      .eq('competitions.competition_type', 'domestic_league')
      .eq('competitions.enabled', true),
    supabase.from('fixtures').select('external_id').eq('league_id', league.id).not('external_id', 'is', null),
  ])

  const teams: Team[] = []
  const seenTeamIds = new Set<string>()
  for (const row of (teamRows ?? []) as any[]) {
    if (row.teams && !seenTeamIds.has(row.teams.id)) {
      seenTeamIds.add(row.teams.id)
      teams.push(row.teams)
    }
  }

  const existingIds = new Set((existingFixtures ?? []).map(row => row.external_id).filter(Boolean))
  const dates = seasonWindow()
  const skipped: string[] = []
  const toInsert = []

  for (const competition of (competitions ?? []) as Competition[]) {
    const result = await fetchEspnFixturesForCompetition(competition, teams, dates)
    skipped.push(...result.skipped)
    for (const fixture of result.fixtures) {
      if (!existingIds.has(fixture.external_id)) {
        existingIds.add(fixture.external_id)
        toInsert.push({ ...fixture, league_id: league.id })
      }
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('fixtures').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    imported: toInsert.length,
    skipped: skipped.slice(0, 25),
    skippedCount: skipped.length,
    dates,
  })
}

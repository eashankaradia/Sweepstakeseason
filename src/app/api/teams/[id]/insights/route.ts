import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BBS_BASE, ESPN_TO_BBS, bbsHeaders, teamNameMatches } from '@/lib/bigballs'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'

function currentSeason(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startYear = month >= 8 ? year : year - 1
  return `${startYear}`
}

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const bbsToken = process.env.BIGBALLS_API_KEY
  if (!bbsToken) {
    return NextResponse.json({ error: 'BIGBALLS_API_KEY not set' }, { status: 500 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

    const { data: team } = await supabase.from('teams').select('id, name').eq('id', params.id).maybeSingle()
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    const { data: tcRows } = await supabase
      .from('team_competitions')
      .select('competitions(espn_slug, competition_type)')
      .eq('team_id', params.id)

    const domesticSlug = (tcRows ?? [])
      .map((r: any) => r.competitions)
      .find((c: any) => c?.competition_type === 'domestic_league' && c?.espn_slug)?.espn_slug

    const league = domesticSlug ? ESPN_TO_BBS[domesticSlug] : null
    if (!league) return NextResponse.json({ standing: null, elo: null })

    const standRes = await fetch(
      `${BBS_BASE}/standings?sport=football&league=${league}&season=${currentSeason()}`,
      { headers: bbsHeaders(bbsToken) }
    )
    if (!standRes.ok) return NextResponse.json({ standing: null, elo: null })
    const standData = await standRes.json()
    const rows = standData?.standings?.[0]?.rows ?? []
    const row = rows.find((r: any) => teamNameMatches(team.name, r.team_name))

    let elo: any = null
    if (row?.team_id) {
      const eloRes = await fetch(`${BBS_BASE}/teams/${row.team_id}/elo`, { headers: bbsHeaders(bbsToken) })
      if (eloRes.ok) elo = await eloRes.json()
    }

    return NextResponse.json({
      standing: row
        ? {
            rank: row.rank,
            played: row.games_played,
            wins: row.wins,
            draws: row.ties,
            losses: row.losses,
            points_for: row.points_for,
            points_against: row.points_against,
            total_teams: rows.length,
          }
        : null,
      elo: elo ? { rating: elo.elo_rating, games_counted: elo.games_counted, last_match_date: elo.last_match_date } : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

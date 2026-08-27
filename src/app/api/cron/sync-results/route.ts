import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'
const EDGE_FN_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co/functions/v1/sync-results'
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3'

// ESPN slug → TheSportsDB league ID
const ESPN_TO_SPORTSDB: Record<string, string> = {
  'eng.1': '4328',
  'eng.2': '4329',
  'esp.1': '4335',
  'ger.1': '4331',
  'fra.1': '4334',
  'ita.1': '4332',
  'uefa.champions': '4480',
  'uefa.europa': '4481',
}

function normName(s: string): string {
  return s.toLowerCase()
    .replace(/\s+f\.?c\.?$/i, '')
    .replace(/\s+a\.?f\.?c\.?$/i, '')
    .replace(/&/g, 'and')
    .trim()
}

function nameMatches(dbName: string, sdbName: string): boolean {
  const a = normName(dbName), b = normName(sdbName)
  return a === b || a.includes(b) || b.includes(a)
}

function currentSeason(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-based
  // Season start is August; before August we're still in the previous season
  const startYear = month >= 8 ? year : year - 1
  return `${startYear}-${startYear + 1}`
}

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const cutoff = new Date(Date.now() - 95 * 60 * 1000).toISOString()

    const { data: pending } = await supabase
      .from('fixtures')
      .select('id, home_team_id, away_team_id, kickoff_time, competitions!inner(espn_slug, competition_type)')
      .in('status', ['scheduled', 'live'])
      .not('external_id', 'is', null)
      .lt('kickoff_time', cutoff)

    if (!pending?.length) {
      return NextResponse.json({ message: 'Nothing to sync', synced: 0 })
    }

    // Get team names
    const teamIds = [...new Set((pending as any[]).flatMap((f: any) => [f.home_team_id, f.away_team_id]))]
    const { data: teams } = await supabase.from('teams').select('id, name').in('id', teamIds)
    const teamMap = new Map((teams ?? []).map((t: any) => [t.id, t.name as string]))

    // Group fixtures by ESPN slug
    const slugGroups = new Map<string, { sdbId: string; fixtures: any[] }>()
    for (const f of pending as any[]) {
      const comp = f.competitions
      const slug: string = comp?.espn_slug
      if (!slug || comp?.competition_type === 'domestic_cup') continue
      const sdbId = ESPN_TO_SPORTSDB[slug]
      if (!sdbId) continue
      if (!slugGroups.has(slug)) slugGroups.set(slug, { sdbId, fixtures: [] })
      slugGroups.get(slug)!.fixtures.push(f)
    }

    const preloadedResults: { fixture_id: string; home_score: number; away_score: number }[] = []
    const warnings: string[] = []

    for (const { sdbId, fixtures } of slugGroups.values()) {
      let sdbEvents: any[] = []
      try {
        const r = await fetch(`${SPORTSDB_BASE}/eventsseason.php?id=${sdbId}&s=${currentSeason()}`)
        if (r.ok) {
          const d = await r.json()
          sdbEvents = d.events ?? []
          warnings.push(`SportsDB ${sdbId} returned ${sdbEvents.length} events for ${currentSeason()}`)
        } else {
          warnings.push(`SportsDB ${sdbId} HTTP ${r.status}`)
        }
      } catch (e: any) {
        warnings.push(`SportsDB ${sdbId} fetch error: ${e?.message}`)
      }

      for (const match of sdbEvents) {
        if (match.strStatus !== 'Match Finished') continue
        const matchDate = match.dateEvent as string
        if (!matchDate) continue
        const homeScore = parseInt(match.intHomeScore ?? '')
        const awayScore = parseInt(match.intAwayScore ?? '')
        if (isNaN(homeScore) || isNaN(awayScore)) continue

        const fixture = fixtures.find((f: any) => {
          const fDate = (f.kickoff_time as string).substring(0, 10)
          if (fDate !== matchDate) return false
          const dbHome = teamMap.get(f.home_team_id) ?? ''
          const dbAway = teamMap.get(f.away_team_id) ?? ''
          return nameMatches(dbHome, match.strHomeTeam ?? '') && nameMatches(dbAway, match.strAwayTeam ?? '')
        })

        if (fixture) {
          preloadedResults.push({ fixture_id: fixture.id, home_score: homeScore, away_score: awayScore })
        }
      }
    }

    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preloaded_results: preloadedResults }),
    })
    const data = await res.json()
    return NextResponse.json({ ...data, matched: preloadedResults.length, warnings })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

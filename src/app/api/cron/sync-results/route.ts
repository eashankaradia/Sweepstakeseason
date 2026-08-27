import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'
const EDGE_FN_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co/functions/v1/sync-results'
const BBS_BASE = 'https://api.bigballsdata.com/v1'

// ESPN slug → BigBallsData league key
const ESPN_TO_BBS: Record<string, string> = {
  'eng.1': 'epl',
  'esp.1': 'laliga',
  'ger.1': 'bundesliga',
  'fra.1': 'ligue1',
  'ita.1': 'seriea',
  'uefa.champions': 'ucl',
}

function normName(s: string): string {
  return s.toLowerCase()
    .replace(/\s+f\.?c\.?$/i, '')
    .replace(/\s+a\.?f\.?c\.?$/i, '')
    .replace(/&/g, 'and')
    .trim()
}

function nameMatches(dbName: string, bbsName: string): boolean {
  const a = normName(dbName), b = normName(bbsName)
  return a === b || a.includes(b) || b.includes(a)
}

function currentSeason(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startYear = month >= 8 ? year : year - 1
  return `${startYear}`
}

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const bbsToken = process.env.BIGBALLS_API_KEY
  if (!bbsToken) {
    return NextResponse.json({ error: 'BIGBALLS_API_KEY not set' }, { status: 500 })
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

    const teamIds = [...new Set((pending as any[]).flatMap((f: any) => [f.home_team_id, f.away_team_id]))]
    const { data: teams } = await supabase.from('teams').select('id, name').in('id', teamIds)
    const teamMap = new Map((teams ?? []).map((t: any) => [t.id, t.name as string]))

    const slugGroups = new Map<string, { league: string; fixtures: any[] }>()
    for (const f of pending as any[]) {
      const comp = f.competitions
      const slug: string = comp?.espn_slug
      if (!slug || comp?.competition_type === 'domestic_cup') continue
      const league = ESPN_TO_BBS[slug]
      if (!league) continue
      if (!slugGroups.has(slug)) slugGroups.set(slug, { league, fixtures: [] })
      slugGroups.get(slug)!.fixtures.push(f)
    }

    const preloadedResults: { fixture_id: string; home_score: number; away_score: number }[] = []
    const warnings: string[] = []

    for (const { league, fixtures } of slugGroups.values()) {
      let matches: any[] = []
      try {
        const url = `${BBS_BASE}/matches?sport=football&league=${league}&status=finished&season=${currentSeason()}&limit=200`
        const r = await fetch(url, { headers: { Authorization: `Bearer ${bbsToken}` } })
        if (r.ok) {
          matches = await r.json()
          warnings.push(`BigBalls ${league} returned ${Array.isArray(matches) ? matches.length : 0} finished matches`)
        } else {
          warnings.push(`BigBalls ${league} HTTP ${r.status}`)
        }
      } catch (e: any) {
        warnings.push(`BigBalls ${league} fetch error: ${e?.message}`)
      }

      for (const m of Array.isArray(matches) ? matches : []) {
        if (m.status !== 'finished') continue
        const matchDate = (m.kickoff_utc as string)?.substring(0, 10)
        const homeScore = m.score?.home
        const awayScore = m.score?.away
        if (!matchDate || homeScore == null || awayScore == null) continue

        const fixture = fixtures.find((f: any) => {
          const fDate = (f.kickoff_time as string).substring(0, 10)
          if (fDate !== matchDate) return false
          const dbHome = teamMap.get(f.home_team_id) ?? ''
          const dbAway = teamMap.get(f.away_team_id) ?? ''
          return nameMatches(dbHome, m.home?.name ?? '') && nameMatches(dbAway, m.away?.name ?? '')
        })

        if (fixture && !preloadedResults.some((p) => p.fixture_id === fixture.id)) {
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

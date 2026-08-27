import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BBS_BASE, ESPN_TO_BBS, bbsHeaders, teamNameMatches } from '@/lib/bigballs'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'
const EDGE_FN_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co/functions/v1/sync-fixtures'

function currentSeason(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const startYear = month >= 8 ? year : year - 1
  return `${startYear}`
}

function mapStatus(bbsStatus: string): 'scheduled' | 'live' | 'completed' | 'postponed' {
  const s = (bbsStatus ?? '').toLowerCase()
  if (['finished', 'ft', 'aet', 'pen', 'penalties'].includes(s)) return 'completed'
  if (['postponed', 'cancelled', 'canceled', 'suspended', 'abandoned'].includes(s)) return 'postponed'
  if (['ns', 'not_started', 'scheduled'].includes(s)) return 'scheduled'
  if (s) return 'live'
  return 'scheduled'
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

    const { data: competitions } = await supabase
      .from('competitions')
      .select('id, league_id, espn_slug, short_name')
      .not('espn_slug', 'is', null)
      .eq('enabled', true)

    if (!competitions?.length) {
      return NextResponse.json({ message: 'No competitions' })
    }

    const resolved: {
      league_id: string
      competition_id: string
      home_team_id: string
      away_team_id: string
      kickoff_time: string | null
      status: string
      home_score: number | null
      away_score: number | null
      external_id: string
    }[] = []
    const warnings: string[] = []

    for (const comp of competitions as any[]) {
      const bbsLeague = ESPN_TO_BBS[comp.espn_slug]
      if (!bbsLeague) continue

      const { data: tcRows } = await supabase
        .from('team_competitions')
        .select('teams(id, name)')
        .eq('competition_id', comp.id)
      const compTeams = (tcRows ?? []).map((r: any) => r.teams).filter(Boolean)

      let matches: any[] = []
      try {
        const url = `${BBS_BASE}/matches?sport=football&league=${bbsLeague}&season=${currentSeason()}&limit=200`
        const r = await fetch(url, { headers: bbsHeaders(bbsToken) })
        if (r.ok) {
          const raw = await r.json()
          matches = Array.isArray(raw) ? raw : (raw.matches ?? raw.data ?? [])
          warnings.push(`BigBalls ${bbsLeague} returned ${matches.length} matches`)
        } else {
          warnings.push(`BigBalls ${bbsLeague} HTTP ${r.status}`)
        }
      } catch (e: any) {
        warnings.push(`BigBalls ${bbsLeague} fetch error: ${e?.message}`)
      }

      for (const m of matches) {
        const homeTeam = compTeams.find((t: any) => teamNameMatches(t.name, m.home?.name ?? ''))
        const awayTeam = compTeams.find((t: any) => teamNameMatches(t.name, m.away?.name ?? ''))
        if (!homeTeam || !awayTeam) continue

        const status = mapStatus(m.status)
        resolved.push({
          league_id: comp.league_id,
          competition_id: comp.id,
          home_team_id: homeTeam.id,
          away_team_id: awayTeam.id,
          kickoff_time: m.kickoff_utc ?? null,
          status,
          home_score: status === 'completed' ? (m.score?.home ?? null) : null,
          away_score: status === 'completed' ? (m.score?.away ?? null) : null,
          external_id: `bbs:${m.id}`,
        })
      }
    }

    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    })
    const data = await res.json()
    return NextResponse.json({ ...data, warnings })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'
const EDGE_FN_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co/functions/v1/sync-results'
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

// ESPN blocks requests from Supabase IPs but allows Vercel IPs.
const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.espn.com/',
  'Origin': 'https://www.espn.com',
}

function toYyyyMmDd(d: Date): string {
  return d.toISOString().substring(0, 10).replace(/-/g, '')
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
      .select('id, external_id, kickoff_time, competitions!inner(espn_slug, competition_type)')
      .in('status', ['scheduled', 'live'])
      .not('external_id', 'is', null)
      .lt('kickoff_time', cutoff)

    if (!pending?.length) {
      return NextResponse.json({ message: 'Nothing to sync', synced: 0 })
    }

    // Group pending fixtures by ESPN slug, extracting the ESPN event ID from external_id ("espn:slug:eventId")
    const slugGroups = new Map<string, { fixtureId: string; eventId: string; kickoff: string }[]>()
    for (const f of pending as any[]) {
      const comp = f.competitions
      const slug: string = comp?.espn_slug
      if (!slug || comp?.competition_type === 'domestic_cup') continue
      const parts = (f.external_id as string).split(':')
      if (parts[0] !== 'espn' || parts.length < 3) continue
      const eventId = parts.slice(2).join(':')
      if (!slugGroups.has(slug)) slugGroups.set(slug, [])
      slugGroups.get(slug)!.push({ fixtureId: f.id, eventId, kickoff: f.kickoff_time })
    }

    const preloadedResults: { fixture_id: string; home_score: number; away_score: number }[] = []
    const warnings: string[] = []

    for (const [slug, items] of slugGroups.entries()) {
      const dates = items.map((i) => new Date(i.kickoff))
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())))
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())))
      minDate.setDate(minDate.getDate() - 1)
      maxDate.setDate(maxDate.getDate() + 1)

      const eventsById = new Map<string, any>()
      try {
        const r = await fetch(
          `${ESPN_BASE}/${slug}/scoreboard?dates=${toYyyyMmDd(minDate)}-${toYyyyMmDd(maxDate)}&limit=200`,
          { headers: ESPN_HEADERS }
        )
        if (r.ok) {
          const d = await r.json()
          for (const ev of d.events ?? []) eventsById.set(String(ev.id), ev)
          warnings.push(`ESPN ${slug} scoreboard returned ${(d.events ?? []).length} events`)
        } else {
          warnings.push(`ESPN ${slug} scoreboard HTTP ${r.status}`)
        }
      } catch (e: any) {
        warnings.push(`ESPN ${slug} scoreboard fetch error: ${e?.message}`)
      }

      for (const item of items) {
        const event = eventsById.get(item.eventId)
        if (!event) {
          warnings.push(`  ${slug}:${item.eventId} not found in scoreboard window`)
          continue
        }
        const competition = event.competitions?.[0]
        const completed = competition?.status?.type?.completed
        if (!completed) {
          warnings.push(`  ${slug}:${item.eventId} status=${competition?.status?.type?.name ?? 'unknown'} (not completed)`)
          continue
        }
        const home = competition.competitors?.find((c: any) => c.homeAway === 'home')
        const away = competition.competitors?.find((c: any) => c.homeAway === 'away')
        const homeScore = parseInt(home?.score ?? '')
        const awayScore = parseInt(away?.score ?? '')
        if (isNaN(homeScore) || isNaN(awayScore)) {
          warnings.push(`  ${slug}:${item.eventId} completed but score missing/invalid`)
          continue
        }
        preloadedResults.push({ fixture_id: item.fixtureId, home_score: homeScore, away_score: awayScore })
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

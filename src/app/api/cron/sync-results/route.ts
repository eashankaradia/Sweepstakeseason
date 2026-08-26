import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'
const EDGE_FN_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co/functions/v1/sync-results'
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

// ESPN blocks requests from Supabase IPs but allows Vercel IPs.
// This route fetches ESPN data and passes it to the edge function for DB writes.
const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.espn.com/',
  'Origin': 'https://www.espn.com',
}

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Read pending fixtures using anon key (fixtures table allows anon ALL)
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const cutoff = new Date(Date.now() - 95 * 60 * 1000).toISOString()

    const { data: pending } = await supabase
      .from('fixtures')
      .select('external_id, kickoff_time, competitions!inner(espn_slug, competition_type)')
      .in('status', ['scheduled', 'live'])
      .not('external_id', 'is', null)
      .lt('kickoff_time', cutoff)

    if (!pending?.length) {
      return NextResponse.json({ message: 'Nothing to sync', synced: 0 })
    }

    // Group by slug, compute date ranges
    const slugGroups = new Map<string, { minDate: string; maxDate: string }>()
    for (const f of pending as any[]) {
      const comp = f.competitions
      const slug: string = comp?.espn_slug
      if (!slug || comp?.competition_type === 'domestic_cup') continue
      const date = (f.kickoff_time as string).substring(0, 10).replace(/-/g, '')
      if (!slugGroups.has(slug)) slugGroups.set(slug, { minDate: date, maxDate: date })
      const g = slugGroups.get(slug)!
      if (date < g.minDate) g.minDate = date
      if (date > g.maxDate) g.maxDate = date
    }

    // Fetch ESPN events from Vercel (no 403 here)
    const preloadedEvents: { slug: string; events: any[] }[] = []
    const today = new Date().toISOString().substring(0, 10).replace(/-/g, '')

    for (const [slug, { minDate }] of slugGroups.entries()) {
      let events: any[] = []

      // Try results endpoint first (recent completed matches)
      try {
        const r = await fetch(`${ESPN_BASE}/${slug}/results?limit=200`, { headers: ESPN_HEADERS })
        if (r.ok) {
          const d = await r.json()
          events = d.events ?? []
        }
      } catch {}

      // Scoreboard fallback with date range covering all pending fixtures through today
      if (events.length === 0) {
        try {
          const r = await fetch(`${ESPN_BASE}/${slug}/scoreboard?dates=${minDate}-${today}&limit=200`, { headers: ESPN_HEADERS })
          if (r.ok) {
            const d = await r.json()
            events = d.events ?? []
          }
        } catch {}
      }

      preloadedEvents.push({ slug, events })
    }

    // Pass pre-fetched events to the edge function for DB writes
    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preloaded_events: preloadedEvents }),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'
const EDGE_FN_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co/functions/v1/sync-fixtures'
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
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

    const { data: competitions } = await supabase
      .from('competitions')
      .select('id, espn_slug')
      .not('espn_slug', 'is', null)
      .eq('enabled', true)

    if (!competitions?.length) {
      return NextResponse.json({ message: 'No competitions' })
    }

    const today = new Date()
    const future = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000)
    const startDate = today.toISOString().substring(0, 10).replace(/-/g, '')
    const endDate = future.toISOString().substring(0, 10).replace(/-/g, '')

    const preloaded: { comp_id: string; events: any[] }[] = []

    for (const comp of competitions as any[]) {
      let events: any[] = []
      try {
        const r = await fetch(
          `${ESPN_BASE}/${comp.espn_slug}/scoreboard?dates=${startDate}-${endDate}&limit=200`,
          { headers: ESPN_HEADERS }
        )
        if (r.ok) {
          const d = await r.json()
          events = d.events ?? []
        }
      } catch {}
      preloaded.push({ comp_id: comp.id, events })
    }

    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preloaded }),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

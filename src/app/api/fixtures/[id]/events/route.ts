import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BBS_BASE, bbsHeaders } from '@/lib/bigballs'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bbsToken = process.env.BIGBALLS_API_KEY
  if (!bbsToken) return NextResponse.json({ events: [] })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: fixture } = await supabase.from('fixtures').select('external_id').eq('id', id).maybeSingle()
    if (!fixture?.external_id?.startsWith('bbs:')) return NextResponse.json({ events: [] })

    const matchId = fixture.external_id.slice('bbs:'.length)
    const r = await fetch(`${BBS_BASE}/matches/${matchId}/events`, { headers: bbsHeaders(bbsToken) })
    if (!r.ok) return NextResponse.json({ events: [] })

    const raw = await r.json()
    const events = Array.isArray(raw) ? raw : (raw.events ?? raw.data ?? [])
    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ events: [] })
  }
}

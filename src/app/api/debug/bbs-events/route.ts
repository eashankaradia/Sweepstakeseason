import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BBS_BASE, bbsHeaders } from '@/lib/bigballs'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fixtureId = searchParams.get('fixture_id')
  if (!fixtureId) return NextResponse.json({ error: 'fixture_id required' }, { status: 400 })

  const bbsToken = process.env.BIGBALLS_API_KEY
  if (!bbsToken) return NextResponse.json({ error: 'no token' }, { status: 500 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: fixture } = await supabase.from('fixtures').select('external_id').eq('id', fixtureId).maybeSingle()
  if (!fixture?.external_id?.startsWith('bbs:')) return NextResponse.json({ error: 'no bbs external_id', fixture })

  const matchId = fixture.external_id.slice('bbs:'.length)
  const r = await fetch(`${BBS_BASE}/matches/${matchId}/events`, { headers: bbsHeaders(bbsToken) })
  const body = await r.text()
  return NextResponse.json({ status: r.status, matchId, body: body.substring(0, 4000) })
}

import { NextResponse } from 'next/server'
import { BBS_BASE, bbsHeaders } from '@/lib/bigballs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const token = process.env.BIGBALLS_API_KEY
  if (!token) return NextResponse.json({ error: 'BIGBALLS_API_KEY not set' }, { status: 500 })

  const matchId = '12a39487-379d-4c84-ac40-a197c51d8308'
  const [detailRes, oddsRes, xgRes] = await Promise.all([
    fetch(`${BBS_BASE}/matches/${matchId}`, { headers: bbsHeaders(token) }),
    fetch(`${BBS_BASE}/matches/${matchId}/odds`, { headers: bbsHeaders(token) }),
    fetch(`${BBS_BASE}/matches/${matchId}/xg`, { headers: bbsHeaders(token) }),
  ])
  const [detail, odds, xg] = await Promise.all([
    detailRes.json().catch(() => null),
    oddsRes.json().catch(() => null),
    xgRes.json().catch(() => null),
  ])
  return NextResponse.json({
    detail: { status: detailRes.status, data: detail },
    odds: { status: oddsRes.status, data: odds },
    xg: { status: xgRes.status, data: xg },
  })
}

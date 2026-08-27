import { NextResponse } from 'next/server'
import { BBS_BASE, bbsHeaders } from '@/lib/bigballs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const token = process.env.BIGBALLS_API_KEY
  if (!token) return NextResponse.json({ error: 'BIGBALLS_API_KEY not set' }, { status: 500 })

  const r = await fetch(
    `${BBS_BASE}/matches?sport=football&league=epl&status=finished&limit=3&include=xg,odds`,
    { headers: bbsHeaders(token) }
  )
  const data = await r.json()
  return NextResponse.json({ status: r.status, data })
}

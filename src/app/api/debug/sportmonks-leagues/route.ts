import { NextResponse } from 'next/server'

const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.SPORTMONKS_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'SPORTMONKS_API_TOKEN not set' }, { status: 500 })
  }

  try {
    const r = await fetch(
      `${SPORTMONKS_BASE}/leagues?api_token=${token}&include=country`
    )
    const data = await r.json()
    return NextResponse.json({ status: r.status, data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

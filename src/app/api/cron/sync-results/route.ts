import { NextResponse } from 'next/server'

const EDGE_FN_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co/functions/v1/sync-results'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // When deployed on Vercel Pro, cron requests include this header.
  // On Hobby or when called manually, skip the check.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(EDGE_FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

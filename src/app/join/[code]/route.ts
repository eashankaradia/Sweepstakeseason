import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const supabase = await createClient()

  const { data: league } = await supabase
    .from('sweepstake_leagues')
    .select('id')
    .ilike('access_code', code.trim())
    .maybeSingle()

  if (!league) {
    return NextResponse.redirect(new URL('/how-to-join?error=invalid', request.url))
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url))
  response.cookies.set('ss_league', league.id, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}

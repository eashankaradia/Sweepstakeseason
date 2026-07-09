import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = 'https://anbiwffpmgxlbrycckxq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuYml3ZmZwbWd4bGJyeWNja3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTY4MzQsImV4cCI6MjA5OTEzMjgzNH0.2ECjI3JmO-SwMH1VHeJ95ILm3L6b0e3XV3O3EHsEgeM'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/how-to-join') ||
    pathname.startsWith('/join/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

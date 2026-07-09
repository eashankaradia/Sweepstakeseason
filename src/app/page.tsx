import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const cookieStore = await cookies()
  const leagueId = cookieStore.get('ss_league')?.value
  redirect(leagueId ? '/dashboard' : '/onboarding')
}

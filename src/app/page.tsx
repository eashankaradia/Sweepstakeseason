import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const cookieStore = await cookies()
  const leagueId = cookieStore.get('ss_league')?.value
  redirect(leagueId ? '/dashboard' : '/how-to-join')
}

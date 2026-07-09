import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const leagueId = cookieStore.get('ss_league')?.value
  if (!leagueId) redirect('/how-to-join')
  return <>{children}</>
}

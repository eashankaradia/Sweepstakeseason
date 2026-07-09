'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import type { League } from '@/lib/supabase/types'

interface LeagueContextValue {
  league: League | null
  loading: boolean
  refresh: () => void
}

const LeagueContext = createContext<LeagueContextValue>({
  league: null,
  loading: true,
  refresh: () => {},
})

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [league, setLeague] = useState<League | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('sweepstake_leagues')
      .select('*')
      .eq('id', leagueId)
      .maybeSingle()
    setLeague(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <LeagueContext.Provider value={{ league, loading, refresh: load }}>
      {children}
    </LeagueContext.Provider>
  )
}

export function useLeague() {
  return useContext(LeagueContext)
}

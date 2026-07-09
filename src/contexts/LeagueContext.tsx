'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { League, Profile } from '@/lib/supabase/types'

interface LeagueContextValue {
  league: League | null
  profile: Profile | null
  isAdmin: boolean
  loading: boolean
  refresh: () => void
}

const LeagueContext = createContext<LeagueContextValue>({
  league: null,
  profile: null,
  isAdmin: false,
  loading: true,
  refresh: () => {},
})

export function LeagueProvider({ children, initialProfile }: { children: React.ReactNode; initialProfile: Profile | null }) {
  const [league, setLeague] = useState<League | null>(null)
  const [profile, setProfile] = useState<Profile | null>(initialProfile)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('sweepstake_leagues')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setLeague(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <LeagueContext.Provider value={{ league, profile, isAdmin: profile?.is_admin ?? false, loading, refresh: load }}>
      {children}
    </LeagueContext.Provider>
  )
}

export function useLeague() {
  return useContext(LeagueContext)
}

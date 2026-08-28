import type { User } from '@supabase/supabase-js'
import type { Profile } from './supabase/types'

export function isAdminUser(user: User | null | undefined, profile?: Pick<Profile, 'is_admin'> | null): boolean {
  if (!user) return false
  return !!profile?.is_admin
}

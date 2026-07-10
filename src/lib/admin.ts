import type { User } from '@supabase/supabase-js'
import type { Profile } from './supabase/types'

const ADMIN_EMAILS = new Set([
  'eashan@sweepstakeseason.app',
  'eashan.karadia@gmail.com',
])

export function isAdminUser(user: User | null | undefined, profile?: Pick<Profile, 'is_admin'> | null): boolean {
  if (!user) return false
  if (profile?.is_admin) return true
  return ADMIN_EMAILS.has((user.email ?? '').toLowerCase())
}

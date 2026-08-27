import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/LoadingSpinner'
import type { Profile } from '@/lib/supabase/types'
import Link from 'next/link'

// Server-side gate for every league-management page (League, Players,
// Competitions, Team pool, Scoring). Settings only *links* to these for
// admins, but a direct URL visit bypassed that entirely before this layout
// existed - RLS is the real backstop, but the UI should refuse cleanly too
// rather than silently rendering admin-only controls to anyone signed in.
export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle<Pick<Profile, 'is_admin'>>()
    : { data: null }

  if (!isAdminUser(user, profile)) {
    return (
      <AppShell title="Settings" backHref="/settings">
        <EmptyState
          icon="🔒"
          title="Admin access required"
          description="This section is only available to league admins. If you think this is wrong, ask whoever set up the league to make you an admin."
          action={
            <Link
              href="/settings"
              className="inline-flex items-center justify-center rounded-xl bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2.5 min-h-11"
            >
              Back to Settings
            </Link>
          }
        />
      </AppShell>
    )
  }

  return <>{children}</>
}

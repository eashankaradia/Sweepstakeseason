'use client'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import type { Profile } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

interface AppShellProps {
  profile: Profile | null
  title?: string
  backHref?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function AppShell({ profile, title, backHref, action, children, className }: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar profile={profile} title={title} backHref={backHref} action={action} />
      <main className={cn('flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-24', className)}>
        {children}
      </main>
      <BottomNav />
    </div>
  )
}

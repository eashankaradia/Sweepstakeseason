'use client'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { cn } from '@/lib/utils'

interface AppShellProps {
  title?: string
  backHref?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  onTouchStart?: (e: React.TouchEvent) => void
  onTouchMove?: (e: React.TouchEvent) => void
  onTouchEnd?: (e: React.TouchEvent) => void
}

export function AppShell({ title, backHref, action, children, className, onTouchStart, onTouchMove, onTouchEnd }: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title={title} backHref={backHref} action={action} />
      <main
        className={cn('flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-24', className)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  )
}

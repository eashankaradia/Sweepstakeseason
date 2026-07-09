'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: string
  backHref?: string
  action?: React.ReactNode
}

export function TopBar({ title, backHref, action }: TopBarProps) {
  const router = useRouter()

  function leave() {
    document.cookie = 'ss_league=; path=/; max-age=0'
    router.push('/how-to-join')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md">
      <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-14">
        {backHref ? (
          <Link href={backHref} className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
        ) : (
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="text-lg">⚽</span>
          </Link>
        )}
        {title && <h1 className="font-semibold text-[var(--text-primary)] text-sm flex-1 truncate">{title}</h1>}
        {!title && <div className="flex-1" />}
        {action && <div className="shrink-0">{action}</div>}
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/settings" className={cn('w-8 h-8 rounded-lg flex items-center justify-center', 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  )
}

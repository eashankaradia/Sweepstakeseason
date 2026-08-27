'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: string
  backHref?: string
  action?: React.ReactNode
}

export function TopBar({ title, backHref, action }: TopBarProps) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md"
      style={{ height: 'var(--header-h)' }}
    >
      <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-full">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back"
            title="Back"
            className={cn(
              'w-11 h-11 -ml-1.5 rounded-lg flex items-center justify-center shrink-0',
              'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]',
              'transition-colors'
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
        ) : (
          <Link href="/dashboard" aria-label="Sweepstake Season home" title="Home" className="flex items-center gap-2 shrink-0 min-h-11 -ml-1 pl-1 pressable">
            {/* SVG shield mark */}
            <svg viewBox="0 0 24 28" fill="none" className="w-6 h-7" aria-hidden="true">
              <path
                d="M12 1L2 5v8c0 6.075 4.477 11.742 10 13 5.523-1.258 10-6.925 10-13V5L12 1Z"
                fill="var(--accent)"
              />
              <path
                d="M12 1L2 5v8c0 6.075 4.477 11.742 10 13 5.523-1.258 10-6.925 10-13V5L12 1Z"
                fill="url(#shield-grad)"
                fillOpacity="0.35"
              />
              <path
                d="M8 13.5l2.5 2.5L16 10.5"
                stroke="white"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="shield-grad" x1="12" y1="1" x2="12" y2="27" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="white" />
                  <stop offset="1" stopColor="transparent" />
                </linearGradient>
              </defs>
            </svg>
          </Link>
        )}

        {title ? (
          <h1 className="font-semibold text-[var(--text-primary)] text-sm flex-1 truncate">{title}</h1>
        ) : (
          <div className="flex-1" />
        )}

        {action && <div className="shrink-0">{action}</div>}

        <Link
          href="/settings"
          className={cn(
            'w-11 h-11 -mr-1.5 rounded-lg flex items-center justify-center shrink-0',
            'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]',
            'transition-colors'
          )}
          aria-label="Settings"
          title="Settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Link>
      </div>
    </header>
  )
}

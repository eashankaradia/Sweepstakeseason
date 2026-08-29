'use client'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

type PublicPlayer = { id: string; name: string; color: string }

function withAs(pathname: string, playerId: string | null) {
  return playerId ? `${pathname}?as=${playerId}` : pathname
}

export function PlayerSwitcher({
  players,
  selectedPlayerId,
}: {
  players: PublicPlayer[]
  selectedPlayerId: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(withAs(pathname, e.target.value))
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--accent)]/8 border-b border-[var(--accent)]/20">
      <span className="text-[10px] font-semibold text-[var(--text-secondary)] shrink-0">Viewing as</span>
      <select
        value={selectedPlayerId ?? ''}
        onChange={onChange}
        aria-label="Choose a player to view"
        className="flex-1 min-w-0 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
      >
        {players.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  )
}

export function PublicTopBar({ title, backHref }: { title?: string; backHref?: string }) {
  const searchParams = useSearchParams()
  const as = searchParams.get('as')

  return (
    <header
      className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md"
      style={{ height: 'var(--header-h)' }}
    >
      <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-full">
        {backHref ? (
          <Link
            href={as ? `${backHref}?as=${as}` : backHref}
            aria-label="Back"
            title="Back"
            className="w-11 h-11 -ml-1.5 rounded-lg flex items-center justify-center shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
        ) : (
          <div className="flex items-center gap-2 shrink-0 -ml-1 pl-1">
            <svg viewBox="0 0 24 28" fill="none" className="w-6 h-7" aria-hidden="true">
              <path
                d="M12 1L2 5v8c0 6.075 4.477 11.742 10 13 5.523-1.258 10-6.925 10-13V5L12 1Z"
                fill="url(#watch-shield-grad)"
              />
              <path d="M8 13.5l2.5 2.5L16 10.5" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="watch-shield-grad" x1="2" y1="1" x2="22" y2="27" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="var(--brand-purple-light)" />
                  <stop offset="1" stopColor="var(--accent)" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-card)] border border-[var(--border)] px-1.5 py-0.5 rounded-full">
              Read-only
            </span>
          </div>
        )}

        {title ? (
          <h1 className="font-semibold text-[var(--text-primary)] text-sm flex-1 truncate">{title}</h1>
        ) : (
          <div className="flex-1" />
        )}

        <Link
          href="/auth/login"
          className="shrink-0 text-xs font-bold text-white bg-[var(--accent)] px-3 py-2 rounded-lg hover:opacity-90 transition-opacity min-h-9 flex items-center"
        >
          Sign in
        </Link>
      </div>
    </header>
  )
}

export function PublicBottomNav({ leagueId, selectedPlayerId }: { leagueId: string; selectedPlayerId: string | null }) {
  const pathname = usePathname()
  const base = `/watch/${leagueId}`

  const navItems = [
    {
      href: base,
      label: 'Home',
      icon: (filled: boolean) => filled ? (
        <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]"><path d="M12 2.5L2.5 10.5V21h6v-6h7v6h6V10.5L12 2.5Z" fill="currentColor" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[22px] h-[22px]">
          <path d="M3 12L12 3l9 9" strokeLinejoin="round" /><path d="M9 21V12h6v9" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      href: `${base}/standings`,
      label: 'Standings',
      icon: (filled: boolean) => filled ? (
        <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]">
          <rect x="5" y="12" width="4" height="9" rx="1" fill="currentColor" /><rect x="10" y="6" width="4" height="15" rx="1" fill="currentColor" /><rect x="15" y="9" width="4" height="12" rx="1" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[22px] h-[22px]">
          <rect x="5" y="12" width="4" height="9" rx="1" /><rect x="10" y="6" width="4" height="15" rx="1" /><rect x="15" y="9" width="4" height="12" rx="1" />
        </svg>
      ),
    },
    {
      href: `${base}/my-teams`,
      label: 'My Teams',
      icon: (filled: boolean) => filled ? (
        <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]">
          <circle cx="12" cy="8" r="4" fill="currentColor" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[22px] h-[22px]">
          <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      href: `${base}/fixtures`,
      label: 'Fixtures',
      icon: (filled: boolean) => filled ? (
        <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]">
          <rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" /><path d="M16 2v4M8 2v4" stroke="var(--bg-card)" strokeWidth="2" strokeLinecap="round" /><path d="M3 10h18" stroke="var(--bg-card)" strokeWidth="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[22px] h-[22px]">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      ),
    },
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--bg-card)]/96 backdrop-blur-md"
      style={{ height: 'var(--nav-h)' }}
    >
      <div className="flex items-stretch h-full max-w-lg mx-auto">
        {navItems.map(item => {
          const isActive = pathname === item.href || (item.href !== base && pathname.startsWith(item.href + '/'))
          return (
            <Link
              key={item.href}
              href={withAs(item.href, selectedPlayerId)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 px-1 transition-colors duration-150',
                isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <div className={cn('flex items-center justify-center w-12 h-7 rounded-full transition-all duration-200', isActive ? 'bg-[var(--accent)]/15' : '')}>
                {item.icon(isActive)}
              </div>
              <span className={cn('text-[10px] font-medium leading-none', isActive ? 'font-semibold' : '')}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function PublicNotAvailable() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center gap-3">
      <div className="text-4xl">🔒</div>
      <h1 className="font-bold text-lg text-[var(--text-primary)]">This link isn&apos;t available</h1>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs">
        Either this league doesn&apos;t exist, or its owner hasn&apos;t turned on a public read-only link.
      </p>
      <Link href="/auth/login" className="mt-2 text-sm font-semibold text-[var(--accent)] hover:underline">
        Sign in instead →
      </Link>
    </div>
  )
}

export function PublicShell({
  leagueId,
  players,
  selectedPlayerId,
  title,
  backHref,
  children,
}: {
  leagueId: string
  players: PublicPlayer[]
  selectedPlayerId: string | null
  title?: string
  backHref?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      <PublicTopBar title={title} backHref={backHref} />
      {!backHref && <PlayerSwitcher players={players} selectedPlayerId={selectedPlayerId} />}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-[calc(var(--nav-h)+16px)]">
        {children}
      </main>
      <PublicBottomNav leagueId={leagueId} selectedPlayerId={selectedPlayerId} />
    </div>
  )
}

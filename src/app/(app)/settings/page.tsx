import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getLeagueById } from '@/lib/data'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { SignOutButton } from '@/components/ui/SignOutButton'
import Link from 'next/link'

const adminSections = [
  {
    href: '/settings/league',
    label: 'League setup',
    description: 'Create or edit the season',
    bg: 'bg-amber-400/12',
    color: 'text-amber-400',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <path d="M6 9H4.5a2.5 2.5 0 010-5H6" /><path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
        <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 0012 0V2z" />
      </svg>
    ),
  },
  {
    href: '/settings/players',
    label: 'Players',
    description: 'Add and manage the players',
    bg: 'bg-[var(--accent)]/12',
    color: 'text-[var(--accent)]',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    href: '/settings/teams',
    label: 'Team pool',
    description: 'Choose which Premier League clubs are in play',
    bg: 'bg-emerald-500/12',
    color: 'text-emerald-400',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    href: '/settings/scoring',
    label: 'Scoring rules',
    description: 'Configure points and bonuses',
    bg: 'bg-[var(--accent)]/12',
    color: 'text-[var(--accent)]',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: '/draft',
    label: 'Draft room',
    description: 'Run, lock, and manage the draw',
    bg: 'bg-amber-400/12',
    color: 'text-amber-400',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
        <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
      </svg>
    ),
  },
]

const userSections = [
  {
    href: '/settings/account',
    label: 'Account',
    description: 'Change your password',
    bg: 'bg-[var(--border)]',
    color: 'text-[var(--text-secondary)]',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    href: '/rules',
    label: 'How it works',
    description: 'Scoring, power-ups, and rules',
    bg: 'bg-[var(--border)]',
    color: 'text-[var(--text-secondary)]',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
]

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const leagueId = cookieStore.get('ss_league')?.value
  const league = leagueId ? await getLeagueById(leagueId) : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
    : { data: null }
  const isAdmin = (profile as any)?.is_admin ?? false

  const sections = isAdmin ? [...adminSections, ...userSections] : userSections

  return (
    <AppShell title="Settings">
      {isAdmin && league && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{league.name}</p>
            <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
          </div>
          <Badge variant={league.status === 'active' ? 'success' : 'warning'} className="shrink-0">
            {league.status}
          </Badge>
          {league.draft_locked && <Badge variant="info" className="shrink-0">Draft locked</Badge>}
        </div>
      )}

      {isAdmin && (
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">Admin</p>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden mb-3">
        {(isAdmin ? adminSections : []).map((s, i) => (
          <Link key={s.href} href={s.href}>
            <div className={`flex items-center gap-3 px-3 py-3 min-h-[56px] hover:bg-[var(--bg-card-hover)] transition-colors ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.bg} ${s.color}`}>
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[var(--text-primary)]">{s.label}</p>
                <p className="text-xs text-[var(--text-secondary)] truncate">{s.description}</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-[var(--text-muted)] shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">Account</p>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden mb-3">
        {userSections.map((s, i) => (
          <Link key={s.href} href={s.href}>
            <div className={`flex items-center gap-3 px-3 py-3 min-h-[56px] hover:bg-[var(--bg-card-hover)] transition-colors ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.bg} ${s.color}`}>
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[var(--text-primary)]">{s.label}</p>
                <p className="text-xs text-[var(--text-secondary)] truncate">{s.description}</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-[var(--text-muted)] shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      <SignOutButton />
    </AppShell>
  )
}

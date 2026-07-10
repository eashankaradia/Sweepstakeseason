import { cookies } from 'next/headers'
import { getLeagueById } from '@/lib/data'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'

const settingsSections = [
  { href: '/settings/league', icon: '🏆', label: 'League setup', description: 'Create or edit the season' },
  { href: '/settings/players', icon: '👥', label: 'Players', description: 'Add and manage the 12 players' },
  { href: '/settings/competitions', icon: '🌍', label: 'Competitions', description: 'Enable leagues and European cups' },
  { href: '/settings/teams', icon: '⚽', label: 'Teams', description: 'Assign teams to competitions' },
  { href: '/settings/scoring', icon: '📊', label: 'Scoring rules', description: 'Configure points and bonuses' },
  { href: '/draft', icon: '🎯', label: 'Draft room', description: 'Run, lock, and manage the draw' },
  { href: '/rules', icon: '📖', label: 'How it works', description: 'Scoring, power-ups, and competition rules' },
]

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const leagueId = cookieStore.get('ss_league')?.value
  const league = leagueId ? await getLeagueById(leagueId) : null

  return (
    <AppShell title="Settings">
      {league && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-[var(--text-primary)] truncate">{league.name}</p>
            <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
          </div>
          <Badge variant={league.status === 'active' ? 'success' : 'warning'}>{league.status}</Badge>
          {league.draft_locked && <Badge variant="info">Draft locked</Badge>}
        </div>
      )}

      <div className="space-y-2">
        {settingsSections.map(s => (
          <Link key={s.href} href={s.href}>
            <Card className="!p-3 hover:border-[var(--accent)]/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--border)] flex items-center justify-center text-lg shrink-0">
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
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  )
}

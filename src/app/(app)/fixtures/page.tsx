'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { TabBar } from '@/components/ui/TabBar'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/lib/utils'
import { isAdminUser } from '@/lib/admin'
import type { League, Competition, Team, Fixture } from '@/lib/supabase/types'
import Link from 'next/link'

type Player = { id: string; name: string; color: string }
type FixtureRow = Fixture & { competition: Competition; home_team: Team; away_team: Team }

export default function FixturesPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [fixtures, setFixtures] = useState<FixtureRow[]>([])
  const [ownerMap, setOwnerMap] = useState<Map<string, Player>>(new Map())
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'results'>('upcoming')
  const [activeComp, setActiveComp] = useState('all')
  const [compact, setCompact] = useState(false)
  const [adding, setAdding] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingResults, setSyncingResults] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: lg } = await supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle()
    setLeague(lg)
    if (!lg) { setLoading(false); return }

    const [{ data: comps }, { data: fix }, { data: assignments }, { data: teamCompData }, { data: authData }] = await Promise.all([
      supabase.from('competitions').select('*').eq('league_id', lg.id).eq('enabled', true).order('display_order'),
      supabase.from('fixtures')
        .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', lg.id)
        .order('kickoff_time', { ascending: true }),
      supabase.from('player_team_assignments').select('team_id, players(id, name, color)').eq('league_id', lg.id),
      supabase.from('team_competitions').select('teams(*)').eq('league_id', lg.id),
      supabase.auth.getUser(),
    ])

    const user = authData?.user ?? null
    const { data: profile } = user
      ? await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
      : { data: null }

    setCompetitions(comps ?? [])
    setFixtures((fix ?? []) as any[])
    setIsAdmin(isAdminUser(user, profile))

    const map = new Map<string, Player>()
    for (const a of (assignments ?? []) as any[]) {
      if (a.players && a.team_id) map.set(a.team_id, a.players)
    }
    setOwnerMap(map)

    const uniqueTeams: Team[] = []
    const seen = new Set<string>()
    for (const row of (teamCompData ?? []) as any[]) {
      if (row.teams && !seen.has(row.teams.id)) {
        seen.add(row.teams.id)
        uniqueTeams.push(row.teams)
      }
    }
    setTeams(uniqueTeams)
    setLoading(false)
  }

  async function syncEspnFixtures() {
    setSyncing(true)
    setSyncMessage('')
    try {
      const response = await fetch('/api/fixtures/sync-espn', { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not sync fixtures')
      setSyncMessage(payload.imported > 0 ? `Imported ${payload.imported} fixtures` : 'No new fixtures')
      await load()
    } catch (e: any) {
      setSyncMessage(e.message)
    }
    setSyncing(false)
  }

  async function syncResults() {
    setSyncingResults(true)
    setSyncMessage('')
    try {
      const response = await fetch('/api/cron/sync-results')
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Sync failed')
      setSyncMessage('Results synced')
      await load()
    } catch (e: any) {
      setSyncMessage(e.message)
    }
    setSyncingResults(false)
  }

  const filtered = fixtures.filter(f => {
    const statusOk = activeTab === 'upcoming'
      ? f.status === 'scheduled' || f.status === 'live' || (f.status as any) === 'postponed'
      : f.status === 'completed'
    return statusOk && (activeComp === 'all' || f.competition_id === activeComp)
  })

  const headerAction = (
    <div className="flex items-center gap-1.5">
      {isAdmin && (
        <>
          <Button size="sm" variant="secondary" onClick={syncResults} loading={syncingResults}>Sync Results</Button>
          <Button size="sm" variant="secondary" onClick={syncEspnFixtures} loading={syncing}>Sync</Button>
          <Button size="sm" onClick={() => setAdding(true)}>+ Add</Button>
        </>
      )}
      <button
        onClick={() => setCompact(c => !c)}
        className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
        title={compact ? 'Normal view' : 'Compact view'}
      >
        {compact ? (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
            <rect x="2" y="4" width="16" height="4" rx="1" />
            <rect x="2" y="10" width="16" height="4" rx="1" />
            <rect x="2" y="16" width="16" height="4" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
            <line x1="2" y1="5" x2="18" y2="5" />
            <line x1="2" y1="10" x2="18" y2="10" />
            <line x1="2" y1="15" x2="18" y2="15" />
          </svg>
        )}
      </button>
    </div>
  )

  if (loading) return <AppShell title="Fixtures"><PageLoader /></AppShell>

  return (
    <AppShell title="Fixtures" action={headerAction}>
      <TabBar
        tabs={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'results', label: 'Results' }]}
        active={activeTab}
        onChange={v => { setActiveTab(v as any); setSyncMessage('') }}
        className="mb-3"
      />

      {syncMessage && (
        <div className="mb-3 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          {syncMessage}
        </div>
      )}

      {competitions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-4 px-4 scrollbar-none">
          <FilterChip active={activeComp === 'all'} onClick={() => setActiveComp('all')}>All</FilterChip>
          {competitions.map(c => (
            <FilterChip key={c.id} active={activeComp === c.id} onClick={() => setActiveComp(c.id)}>
              {c.short_name}
            </FilterChip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={activeTab === 'upcoming' ? '📅' : '📊'}
          title={activeTab === 'upcoming' ? 'No upcoming fixtures' : 'No results yet'}
          description={activeTab === 'upcoming'
            ? isAdmin ? 'Use Sync to import fixtures from ESPN.' : 'Fixtures import automatically.'
            : 'Results appear once matches are completed.'}
        />
      ) : compact ? (
        <div className="rounded-xl border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
          {filtered.map(f => <CompactFixtureCard key={f.id} fixture={f} ownerMap={ownerMap} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => <FixtureCard key={f.id} fixture={f} ownerMap={ownerMap} />)}
        </div>
      )}

      {adding && league && (
        <AddFixtureModal
          leagueId={league.id}
          competitions={competitions}
          teams={teams}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load() }}
        />
      )}
    </AppShell>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
          : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
      }`}
    >
      {children}
    </button>
  )
}

function CompactFixtureCard({ fixture, ownerMap }: { fixture: FixtureRow; ownerMap: Map<string, any> }) {
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'
  const homeOwner = ownerMap.get(fixture.home_team_id)
  const awayOwner = ownerMap.get(fixture.away_team_id)

  return (
    <Link href={`/fixtures/${fixture.id}`} className="block">
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--accent)]/5 transition-colors">
        <Badge
          variant={(fixture.competition as any)?.competition_type === 'european' ? 'purple' : 'default'}
          className="text-[9px] shrink-0 min-w-[28px] text-center"
        >
          {(fixture.competition as any)?.short_name}
        </Badge>

        <div className="flex items-center gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
            {homeOwner && <Avatar name={homeOwner.name} color={homeOwner.color} size="sm" />}
            <span className="text-xs text-[var(--text-primary)] truncate">{fixture.home_team?.short_name || fixture.home_team?.name}</span>
            <TeamCrest team={fixture.home_team} size="xs" />
          </div>

          <div className="shrink-0 w-14 text-center">
            {isCompleted ? (
              <span className="font-bold text-xs text-[var(--text-primary)]">{fixture.home_score}–{fixture.away_score}</span>
            ) : isLive ? (
              <span className="text-[10px] text-red-400 font-bold">LIVE</span>
            ) : (
              <span className="text-[10px] text-[var(--text-muted)]">
                {fixture.kickoff_time
                  ? new Date(fixture.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  : 'vs'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-1 min-w-0">
            <TeamCrest team={fixture.away_team} size="xs" />
            <span className="text-xs text-[var(--text-primary)] truncate">{fixture.away_team?.short_name || fixture.away_team?.name}</span>
            {awayOwner && <Avatar name={awayOwner.name} color={awayOwner.color} size="sm" />}
          </div>
        </div>

        {!isCompleted && fixture.kickoff_time && (
          <span className="text-[9px] text-[var(--text-muted)] shrink-0">
            {new Date(fixture.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
    </Link>
  )
}

function FixtureCard({ fixture, ownerMap }: { fixture: FixtureRow; ownerMap: Map<string, any> }) {
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'
  const homeOwner = ownerMap.get(fixture.home_team_id)
  const awayOwner = ownerMap.get(fixture.away_team_id)
  const hasOdds = fixture.home_odds != null || fixture.draw_odds != null || fixture.away_odds != null

  return (
    <Link href={`/fixtures/${fixture.id}`} className="block">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:border-[var(--accent)]/40 transition-colors">
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 text-[10px] text-[var(--text-muted)]">
          <Badge
            variant={(fixture.competition as any)?.competition_type === 'european' ? 'purple' : 'default'}
            className="text-[9px]"
          >
            {(fixture.competition as any)?.short_name}
          </Badge>
          {fixture.round && <span>{fixture.round}</span>}
          {fixture.matchday && <span>MD{fixture.matchday}</span>}
          {isLive && <Badge variant="danger" className="text-[9px] ml-1">● LIVE</Badge>}
          {(fixture.status as any) === 'postponed' && <Badge variant="warning" className="text-[9px] ml-1">PPD</Badge>}
          <span className="ml-auto">{fixture.kickoff_time ? formatDateTime(fixture.kickoff_time) : '—'}</span>
        </div>

        <div className="flex items-center gap-2 px-3 pb-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <TeamCrest team={fixture.home_team} size="sm" />
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{fixture.home_team?.name}</span>
            </div>
            {homeOwner && (
              <div className="flex items-center gap-1 mt-0.5 ml-0.5">
                <Avatar name={homeOwner.name} color={homeOwner.color} size="sm" />
                <span className="text-[9px] text-[var(--text-muted)]">{homeOwner.name}</span>
              </div>
            )}
          </div>

          <div className="shrink-0 text-center min-w-[56px]">
            {isCompleted ? (
              <span className="font-bold text-base text-[var(--text-primary)]">
                {fixture.home_score} – {fixture.away_score}
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)] font-medium">vs</span>
            )}
          </div>

          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{fixture.away_team?.name}</span>
              <TeamCrest team={fixture.away_team} size="sm" />
            </div>
            {awayOwner && (
              <div className="flex items-center gap-1 mt-0.5 justify-end mr-0.5">
                <span className="text-[9px] text-[var(--text-muted)]">{awayOwner.name}</span>
                <Avatar name={awayOwner.name} color={awayOwner.color} size="sm" />
              </div>
            )}
          </div>
        </div>

        {!isCompleted && hasOdds && (
          <div className="flex items-center gap-1 px-3 pb-2.5">
            <OddsPill label="1" value={fixture.home_odds} />
            <OddsPill label="X" value={fixture.draw_odds} />
            <OddsPill label="2" value={fixture.away_odds} />
          </div>
        )}
      </div>
    </Link>
  )
}

function OddsPill({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null
  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg)] border border-[var(--border)]">
      <span className="text-[9px] text-[var(--text-muted)] font-medium">{label}</span>
      <span className="text-[10px] font-semibold text-[var(--text-primary)]">{value.toFixed(2)}</span>
    </div>
  )
}

function AddFixtureModal({ leagueId, competitions, teams, onClose, onSaved }: {
  leagueId: string; competitions: Competition[]; teams: Team[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({ competition_id: competitions[0]?.id ?? '', home_team_id: '', away_team_id: '', kickoff_time: '', round: '', matchday: '' })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.competition_id || !form.home_team_id || !form.away_team_id || form.home_team_id === form.away_team_id) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('fixtures').insert({
      league_id: leagueId,
      competition_id: form.competition_id,
      home_team_id: form.home_team_id,
      away_team_id: form.away_team_id,
      kickoff_time: form.kickoff_time || null,
      round: form.round || null,
      matchday: form.matchday ? parseInt(form.matchday, 10) : null,
      status: 'scheduled',
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="mx-auto w-full max-w-lg rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg-card)] p-5 pb-8">
        <h3 className="mb-4 font-semibold text-[var(--text-primary)]">Add Fixture</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">Competition</label>
            <select value={form.competition_id} onChange={e => setForm(f => ({ ...f, competition_id: e.target.value }))}>
              {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">Home team</label>
              <select value={form.home_team_id} onChange={e => setForm(f => ({ ...f, home_team_id: e.target.value }))}>
                <option value="">Select...</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">Away team</label>
              <select value={form.away_team_id} onChange={e => setForm(f => ({ ...f, away_team_id: e.target.value }))}>
                <option value="">Select...</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">Date/time</label>
              <input type="datetime-local" value={form.kickoff_time} onChange={e => setForm(f => ({ ...f, kickoff_time: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">Matchday</label>
              <input type="number" value={form.matchday} onChange={e => setForm(f => ({ ...f, matchday: e.target.value }))} placeholder="e.g. 1" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-secondary)]">Round</label>
            <input value={form.round} onChange={e => setForm(f => ({ ...f, round: e.target.value }))} placeholder="e.g. Group Stage" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={save} loading={saving} className="flex-1">Add fixture</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

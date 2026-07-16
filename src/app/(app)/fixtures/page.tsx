'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { TabBar } from '@/components/ui/TabBar'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/lib/utils'
import type { League, Competition, Team, Fixture } from '@/lib/supabase/types'
import Link from 'next/link'

type Player = { id: string; name: string; color: string }
type FixtureRow = Fixture & { competition: Competition; home_team: Team; away_team: Team }

export default function FixturesPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [fixtures, setFixtures] = useState<FixtureRow[]>([])
  const [ownerMap, setOwnerMap] = useState<Map<string, Player[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'results'>('upcoming')
  const [activeComp, setActiveComp] = useState('all')
  const [compact, setCompact] = useState(true)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: lg } = await supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle()
    setLeague(lg)
    if (!lg) { setLoading(false); return }

    const [{ data: comps }, { data: fix }, { data: assignments }, { data: lastSync }] = await Promise.all([
      supabase.from('competitions').select('*').eq('league_id', lg.id).eq('enabled', true).order('display_order'),
      supabase.from('fixtures')
        .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', lg.id)
        .order('kickoff_time', { ascending: true }),
      supabase.from('player_team_assignments').select('team_id, players(id, name, color)').eq('league_id', lg.id),
      supabase.from('activity_feed')
        .select('created_at')
        .eq('league_id', lg.id)
        .eq('event_type', 'full_time')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    setCompetitions((comps ?? []).filter((c: any) => c.competition_type !== 'domestic_cup'))
    setFixtures((fix ?? []) as any[])
    setLastSyncedAt((lastSync as any)?.created_at ?? null)

    const map = new Map<string, Player[]>()
    for (const a of (assignments ?? []) as any[]) {
      if (a.players && a.team_id) {
        const arr = map.get(a.team_id) ?? []
        arr.push(a.players)
        map.set(a.team_id, arr)
      }
    }
    setOwnerMap(map)
    setLoading(false)
  }

  const filtered = fixtures.filter(f => {
    const statusOk = activeTab === 'upcoming'
      ? f.status === 'scheduled' || f.status === 'live' || (f.status as any) === 'postponed'
      : f.status === 'completed'
    const notCup = (f.competition as any)?.competition_type !== 'domestic_cup'
    return statusOk && notCup && (activeComp === 'all' || f.competition_id === activeComp)
  })

  if (loading) return <AppShell title="Fixtures"><PageLoader /></AppShell>

  return (
    <AppShell title="Fixtures">
      <TabBar
        tabs={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'results', label: 'Results' }]}
        active={activeTab}
        onChange={v => setActiveTab(v as any)}
        className="mb-3"
      />

      {/* Last synced + compact toggle row */}
      <div className="flex items-center gap-2 mb-3">
        {lastSyncedAt && (
          <span className="text-[10px] text-[var(--text-muted)] flex-1">
            Last synced {formatRelativeTime(lastSyncedAt)}
          </span>
        )}
        <button
          onClick={() => setCompact(c => !c)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ml-auto"
          style={{
            borderColor: compact ? 'var(--accent)' : 'var(--border)',
            color: compact ? 'var(--accent)' : 'var(--text-muted)',
            background: compact ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
          }}
        >
          {compact ? (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3 h-3">
              <line x1="1" y1="4" x2="15" y2="4" /><line x1="1" y1="8" x2="15" y2="8" /><line x1="1" y1="12" x2="15" y2="12" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3 h-3">
              <rect x="1" y="2" width="14" height="4" rx="1" /><rect x="1" y="8" width="14" height="4" rx="1" />
            </svg>
          )}
          {compact ? 'Compact' : 'Detailed'}
        </button>
      </div>

      {/* Competition filter chips */}
      {competitions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-4 px-4 scrollbar-none">
          <FilterChip active={activeComp === 'all'} onClick={() => setActiveComp('all')}>All</FilterChip>
          {competitions.map(c => (
            <FilterChip key={c.id} active={activeComp === c.id} onClick={() => setActiveComp(c.id)}>
              {c.short_name}
              {(c as any).competition_type === 'domestic_cup' && (
                <span className="ml-1 text-[8px] opacity-60">no pts</span>
              )}
            </FilterChip>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={activeTab === 'upcoming' ? '📅' : '📊'}
          title={activeTab === 'upcoming' ? 'No upcoming fixtures' : 'No results yet'}
          description={activeTab === 'upcoming'
            ? 'Fixtures import automatically from ESPN.'
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
    </AppShell>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center ${
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
  const homeOwners: Player[] = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners: Player[] = ownerMap.get(fixture.away_team_id) ?? []
  const isCup = (fixture.competition as any)?.competition_type === 'domestic_cup'

  return (
    <Link href={`/fixtures/${fixture.id}`} className="block">
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--accent)]/5 transition-colors">
        <Badge
          variant={isCup ? 'warning' : (fixture.competition as any)?.competition_type === 'european' ? 'purple' : 'default'}
          className="text-[9px] shrink-0 min-w-[28px] text-center"
        >
          {(fixture.competition as any)?.short_name}
        </Badge>

        <div className="flex items-center gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
            {homeOwners.length > 0 && (
              <div className="flex -space-x-1.5 shrink-0">
                {homeOwners.map(o => <Avatar key={o.id} name={o.name} color={o.color} size="sm" />)}
              </div>
            )}
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
            {awayOwners.length > 0 && (
              <div className="flex -space-x-1.5 shrink-0">
                {awayOwners.map(o => <Avatar key={o.id} name={o.name} color={o.color} size="sm" />)}
              </div>
            )}
          </div>
        </div>

        {!isCompleted && fixture.kickoff_time && (
          <span className="text-[9px] text-[var(--text-muted)] shrink-0">
            {new Date(fixture.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
        {isCup && <span className="text-[9px] text-[var(--text-muted)] shrink-0 italic">no pts</span>}
      </div>
    </Link>
  )
}

function FixtureCard({ fixture, ownerMap }: { fixture: FixtureRow; ownerMap: Map<string, any> }) {
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'
  const homeOwners: Player[] = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners: Player[] = ownerMap.get(fixture.away_team_id) ?? []
  const hasOdds = fixture.home_odds != null || fixture.draw_odds != null || fixture.away_odds != null
  const isCup = (fixture.competition as any)?.competition_type === 'domestic_cup'

  return (
    <Link href={`/fixtures/${fixture.id}`} className="block">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:border-[var(--accent)]/40 transition-colors">
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 text-[10px] text-[var(--text-muted)]">
          <Badge
            variant={isCup ? 'warning' : (fixture.competition as any)?.competition_type === 'european' ? 'purple' : 'default'}
            className="text-[9px]"
          >
            {(fixture.competition as any)?.short_name}
          </Badge>
          {isCup && <span className="text-[9px] text-amber-400/70 italic">no pts</span>}
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
            {homeOwners.length > 0 && (
              <div className="flex flex-col gap-0.5 mt-0.5 ml-0.5">
                {homeOwners.map(o => (
                  <div key={o.id} className="flex items-center gap-1">
                    <Avatar name={o.name} color={o.color} size="sm" />
                    <span className="text-[9px] text-[var(--text-muted)]">{o.name}</span>
                  </div>
                ))}
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
            {awayOwners.length > 0 && (
              <div className="flex flex-col gap-0.5 mt-0.5 items-end mr-0.5">
                {awayOwners.map(o => (
                  <div key={o.id} className="flex items-center gap-1 flex-row-reverse">
                    <Avatar name={o.name} color={o.color} size="sm" />
                    <span className="text-[9px] text-[var(--text-muted)]">{o.name}</span>
                  </div>
                ))}
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

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

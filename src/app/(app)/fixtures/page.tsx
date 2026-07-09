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
import type { Competition, Team, Fixture } from '@/lib/supabase/types'

type Player = { id: string; name: string; color: string }
type FixtureRow = Fixture & { competition: Competition; home_team: Team; away_team: Team }

export default function FixturesPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [fixtures, setFixtures] = useState<FixtureRow[]>([])
  const [ownerMap, setOwnerMap] = useState<Map<string, Player>>(new Map())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'results'>('upcoming')
  const [activeComp, setActiveComp] = useState('all')

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const [{ data: comps }, { data: fix }, { data: assignments }, { data: players }] = await Promise.all([
      supabase.from('competitions').select('*').eq('league_id', leagueId).eq('enabled', true).order('display_order'),
      supabase.from('fixtures')
        .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', leagueId)
        .order('kickoff_time', { ascending: true }),
      supabase.from('player_team_assignments').select('team_id, players(id, name, color)').eq('league_id', leagueId),
      supabase.from('players').select('id, name, color').eq('league_id', leagueId),
    ])

    setCompetitions(comps ?? [])
    setFixtures((fix ?? []) as any[])

    const map = new Map<string, Player>()
    for (const a of (assignments ?? []) as any[]) {
      if (a.players && a.team_id) map.set(a.team_id, a.players)
    }
    setOwnerMap(map)
    setLoading(false)
  }

  const filtered = fixtures.filter(f => {
    const statusOk = activeTab === 'upcoming'
      ? f.status === 'scheduled' || f.status === 'live'
      : f.status === 'completed'
    return statusOk && (activeComp === 'all' || f.competition_id === activeComp)
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
          description={activeTab === 'upcoming' ? 'Fixtures import automatically via ESPN.' : 'Results appear once matches are completed.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(f => (
            <FixtureCard key={f.id} fixture={f} ownerMap={ownerMap} />
          ))}
        </div>
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

function FixtureCard({ fixture, ownerMap }: { fixture: FixtureRow; ownerMap: Map<string, any> }) {
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'
  const homeOwner = ownerMap.get(fixture.home_team_id)
  const awayOwner = ownerMap.get(fixture.away_team_id)
  const hasOdds = fixture.home_odds != null || fixture.draw_odds != null || fixture.away_odds != null

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {/* Meta row */}
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
        <span className="ml-auto">{fixture.kickoff_time ? formatDateTime(fixture.kickoff_time) : '—'}</span>
      </div>

      {/* Score row */}
      <div className="flex items-center gap-2 px-3 pb-2.5">
        {/* Home team */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <TeamCrest team={fixture.home_team} size="sm" />
            <span className="text-sm font-medium text-[var(--text-primary)] truncate">{fixture.home_team?.name}</span>
          </div>
          {homeOwner && (
            <div className="flex items-center gap-1 mt-0.5 ml-0.5">
              <Avatar name={homeOwner.name} color={homeOwner.color} size="xs" />
              <span className="text-[9px] text-[var(--text-muted)]">{homeOwner.name}</span>
            </div>
          )}
        </div>

        {/* Score / vs */}
        <div className="shrink-0 text-center min-w-[56px]">
          {isCompleted ? (
            <span className="font-bold text-base text-[var(--text-primary)]">
              {fixture.home_score} – {fixture.away_score}
            </span>
          ) : (
            <span className="text-xs text-[var(--text-muted)] font-medium">vs</span>
          )}
        </div>

        {/* Away team */}
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center gap-1.5 justify-end">
            <span className="text-sm font-medium text-[var(--text-primary)] truncate">{fixture.away_team?.name}</span>
            <TeamCrest team={fixture.away_team} size="sm" />
          </div>
          {awayOwner && (
            <div className="flex items-center gap-1 mt-0.5 justify-end mr-0.5">
              <span className="text-[9px] text-[var(--text-muted)]">{awayOwner.name}</span>
              <Avatar name={awayOwner.name} color={awayOwner.color} size="xs" />
            </div>
          )}
        </div>
      </div>

      {/* Odds row (upcoming only) */}
      {!isCompleted && hasOdds && (
        <div className="flex items-center gap-1 px-3 pb-2.5">
          <OddsPill label="1" value={fixture.home_odds} />
          <OddsPill label="X" value={fixture.draw_odds} />
          <OddsPill label="2" value={fixture.away_odds} />
        </div>
      )}
    </div>
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

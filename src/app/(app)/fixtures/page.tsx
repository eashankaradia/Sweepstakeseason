'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { TabBar } from '@/components/ui/TabBar'
import { FilterChip } from '@/components/ui/FilterChip'
import { OwnerStack } from '@/components/ui/OwnerStack'
import { CompetitionBadge } from '@/components/ui/CompetitionBadge'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import type { Competition, Team, Fixture } from '@/lib/supabase/types'
import Link from 'next/link'

type Player = { id: string; name: string; color: string }
type FixtureRow = Fixture & { competition: Competition; home_team: Team; away_team: Team }

export default function FixturesPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [fixtures, setFixtures] = useState<FixtureRow[]>([])
  const [ownerMap, setOwnerMap] = useState<Map<string, Player[]>>(new Map())
  const [myTeamIds, setMyTeamIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'results'>('upcoming')
  const [activeComp, setActiveComp] = useState('all')
  const [myTeamsOnly, setMyTeamsOnly] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id

    const [{ data: comps }, { data: fix }, { data: assignments }, { data: lastSync }, { data: players }] = await Promise.all([
      supabase.from('competitions').select('*').eq('league_id', leagueId).eq('enabled', true).order('display_order'),
      supabase.from('fixtures')
        .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', leagueId)
        .order('kickoff_time', { ascending: true }),
      supabase.from('player_team_assignments').select('team_id, players(id, name, color)').eq('league_id', leagueId),
      supabase.from('activity_feed')
        .select('created_at')
        .eq('league_id', leagueId)
        .eq('event_type', 'full_time')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      uid
        ? supabase.from('players').select('id').eq('league_id', leagueId).eq('user_id', uid).maybeSingle()
        : Promise.resolve({ data: null }),
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

    if ((players as any)?.id) {
      const myPlayerId = (players as any).id
      const myTeams = new Set<string>()
      for (const a of (assignments ?? []) as any[]) {
        if (a.players && a.players.id === myPlayerId) myTeams.add(a.team_id)
      }
      setMyTeamIds(myTeams)
    }

    setLoading(false)
  }

  const filtered = fixtures.filter(f => {
    const statusOk = activeTab === 'upcoming'
      ? f.status === 'scheduled' || f.status === 'live' || (f.status as any) === 'postponed'
      : f.status === 'completed'
    const notCup = (f.competition as any)?.competition_type !== 'domestic_cup'
    const compOk = activeComp === 'all' || f.competition_id === activeComp
    const myTeamOk = !myTeamsOnly || myTeamIds.has(f.home_team_id) || myTeamIds.has(f.away_team_id)
    return statusOk && notCup && compOk && myTeamOk
  })

  const groups = groupByDate(filtered, activeTab === 'results')

  if (loading) return <AppShell title="Fixtures"><PageLoader /></AppShell>

  return (
    <AppShell title="Fixtures">
      <TabBar
        tabs={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'results', label: 'Results' }]}
        active={activeTab}
        onChange={v => setActiveTab(v as any)}
        className="mb-3"
      />

      {/* Filter chips row */}
      {(competitions.length > 0 || myTeamIds.size > 0) && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-4 px-4 scrollbar-none">
          <FilterChip active={activeComp === 'all'} onClick={() => setActiveComp('all')}>All</FilterChip>
          {competitions.map(c => (
            <FilterChip key={c.id} active={activeComp === c.id} onClick={() => setActiveComp(c.id)}>
              {(c as any).short_name || c.name}
            </FilterChip>
          ))}
          {myTeamIds.size > 0 && (
            <FilterChip active={myTeamsOnly} onClick={() => setMyTeamsOnly(v => !v)}>My Teams</FilterChip>
          )}
        </div>
      )}

      {/* Sync timestamp */}
      {lastSyncedAt && (
        <p className="text-[10px] text-[var(--text-muted)] mb-3">
          Synced {formatRelativeTime(lastSyncedAt)}
        </p>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={activeTab === 'upcoming' ? '📅' : '📊'}
          title={activeTab === 'upcoming' ? 'No upcoming fixtures' : 'No results yet'}
          description={activeTab === 'upcoming'
            ? 'Fixtures import automatically from ESPN.'
            : 'Results appear once matches are completed.'}
        />
      ) : (
        <div className="space-y-5">
          {groups.map(({ label, fixtures: groupFixtures }) => (
            <div key={label}>
              {/* Date header */}
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 px-1">
                {label}
              </p>

              {/* Fixture rows */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                {groupFixtures.map((f, i) => (
                  <FixtureRow
                    key={f.id}
                    fixture={f}
                    ownerMap={ownerMap}
                    myTeamIds={myTeamIds}
                    divider={i < groupFixtures.length - 1}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}

function FixtureRow({
  fixture,
  ownerMap,
  myTeamIds,
  divider,
}: {
  fixture: FixtureRow
  ownerMap: Map<string, Player[]>
  myTeamIds: Set<string>
  divider: boolean
}) {
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'
  const isPostponed = (fixture.status as any) === 'postponed'
  const homeOwners: Player[] = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners: Player[] = ownerMap.get(fixture.away_team_id) ?? []
  const isMine = myTeamIds.has(fixture.home_team_id) || myTeamIds.has(fixture.away_team_id)
  const comp = fixture.competition as any

  return (
    <Link href={`/fixtures/${fixture.id}`} className="block pressable">
      <div
        className={[
          'relative flex items-center gap-1.5 px-3 py-2.5 hover:bg-[var(--accent)]/5 transition-colors',
          divider ? 'border-b border-[var(--border)]' : '',
          isMine ? 'bg-[var(--accent)]/[0.04]' : '',
        ].join(' ')}
      >
        {/* My team accent bar */}
        {isMine && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--accent)] rounded-r" />
        )}

        {/* Competition badge — slim column */}
        <CompetitionBadge
          shortName={comp?.short_name}
          name={comp?.name}
          type={comp?.competition_type}
          className="shrink-0 w-[30px] text-center"
        />

        {/* Home side */}
        <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
          <OwnerStack owners={homeOwners} size="xs" max={2} />
          <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
            {fixture.home_team?.short_name || fixture.home_team?.name}
          </span>
          <TeamCrest team={fixture.home_team} size="xs" />
        </div>

        {/* Score / time column */}
        <div className="shrink-0 w-[52px] text-center">
          {isCompleted ? (
            <span className="font-bold text-[13px] text-[var(--text-primary)] tabular-nums">
              {fixture.home_score}–{fixture.away_score}
            </span>
          ) : isLive ? (
            <Badge variant="live" className="text-[9px] px-1">LIVE</Badge>
          ) : isPostponed ? (
            <span className="text-[10px] text-[var(--amber)] font-semibold">PPD</span>
          ) : (
            <span className="text-[11px] text-[var(--text-muted)] font-medium tabular-nums">
              {fixture.kickoff_time
                ? new Date(fixture.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                : 'vs'}
            </span>
          )}
        </div>

        {/* Away side */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <TeamCrest team={fixture.away_team} size="xs" />
          <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
            {fixture.away_team?.short_name || fixture.away_team?.name}
          </span>
          <OwnerStack owners={awayOwners} size="xs" max={2} />
        </div>
      </div>
    </Link>
  )
}

function groupByDate(fixtures: FixtureRow[], reverseChron: boolean) {
  const groups = new Map<string, FixtureRow[]>()
  for (const f of fixtures) {
    const label = f.kickoff_time
      ? formatDateLabel(f.kickoff_time)
      : 'Unknown date'
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(f)
  }
  const entries = [...groups.entries()].map(([label, fixtures]) => ({ label, fixtures }))
  return reverseChron ? entries.reverse() : entries
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + 86400000)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (day.getTime() === today.getTime()) return 'Today'
  if (day.getTime() === tomorrow.getTime()) return 'Tomorrow'

  const diff = (day.getTime() - today.getTime()) / 86400000
  if (diff > -7 && diff < 7) {
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  }
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
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

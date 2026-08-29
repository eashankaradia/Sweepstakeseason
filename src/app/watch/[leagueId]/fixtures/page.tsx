'use client'
import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicShell, PublicNotAvailable } from '@/components/layout/PublicShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { TabBar } from '@/components/ui/TabBar'
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/LoadingSpinner'
import { fetchPublicLeagueData, type PublicLeagueData } from '@/lib/publicLeague'
import { computeStandingsAsOf, giantKillerEligibility, type TeamRank } from '@/lib/giantKiller'

type Player = { id: string; name: string; color: string }

export default function PublicFixturesPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = use(params)
  const searchParams = useSearchParams()
  const asPlayerId = searchParams.get('as')

  const [data, setData] = useState<PublicLeagueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [error, setError] = useState(false)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'results'>('upcoming')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const result = await fetchPublicLeagueData(leagueId)
      if (result.notAvailable) { setNotAvailable(true); setLoading(false); return }
      setData(result.data)
      setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  if (loading) return <PageLoader />
  if (notAvailable) return <PublicNotAvailable />
  if (error || !data) return <ErrorState onRetry={load} />

  const { players, assignments, fixtures } = data

  const ownerMap = new Map<string, Player[]>()
  for (const a of assignments) {
    if (a.teams && a.players) {
      const arr = ownerMap.get(a.teams.id) ?? []
      arr.push(a.players)
      ownerMap.set(a.teams.id, arr)
    }
  }

  const filtered = fixtures.filter((f: any) =>
    activeTab === 'upcoming' ? (f.status === 'scheduled' || f.status === 'live' || f.status === 'postponed') : f.status === 'completed'
  )
  const groups = groupByDate(filtered, activeTab === 'results')

  const allTeamIds = [...new Set(fixtures.flatMap((f: any) => [f.home_team_id, f.away_team_id]))]
  const gkRankCache = new Map<string, Map<string, TeamRank> | null>()
  function ranksBefore(kickoff: string | null) {
    if (!kickoff) return null
    if (!gkRankCache.has(kickoff)) gkRankCache.set(kickoff, computeStandingsAsOf(allTeamIds, fixtures, kickoff))
    return gkRankCache.get(kickoff) ?? null
  }

  return (
    <PublicShell leagueId={leagueId} players={players} selectedPlayerId={asPlayerId}>
      <h1 className="font-bold text-base text-[var(--text-primary)] mb-3">Fixtures</h1>

      <TabBar
        tabs={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'results', label: 'Results' }]}
        active={activeTab}
        onChange={v => setActiveTab(v as any)}
        className="mb-4"
      />

      {groups.length === 0 ? (
        <EmptyState icon={activeTab === 'upcoming' ? '📅' : '📊'} title={activeTab === 'upcoming' ? 'No upcoming fixtures' : 'No results yet'} />
      ) : (
        <div className="space-y-5">
          {groups.map(({ label, fixtures: groupFixtures }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-1.5 px-1">{label}</p>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                {groupFixtures.map((f: any, i: number) => (
                  <PublicFixtureRow
                    key={f.id}
                    fixture={f}
                    ownerMap={ownerMap}
                    divider={i < groupFixtures.length - 1}
                    leagueId={leagueId}
                    asId={asPlayerId}
                    giantKiller={f.status !== 'completed' ? giantKillerEligibility(f.home_team_id, f.away_team_id, ranksBefore(f.kickoff_time)) : { eligible: false }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PublicShell>
  )
}

function PublicFixtureRow({
  fixture, ownerMap, divider, leagueId, asId, giantKiller,
}: {
  fixture: any
  ownerMap: Map<string, Player[]>
  divider: boolean
  leagueId: string
  asId: string | null
  giantKiller: { eligible: boolean }
}) {
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'
  const isPostponed = fixture.status === 'postponed'
  const homeOwners = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners = ownerMap.get(fixture.away_team_id) ?? []

  const winnerOwners = isCompleted
    ? fixture.home_score! > fixture.away_score! ? homeOwners : fixture.away_score! > fixture.home_score! ? awayOwners : []
    : []
  const winnerColor = winnerOwners[0]?.color

  return (
    <Link href={`/watch/${leagueId}/fixtures/${fixture.id}${asId ? `?as=${asId}` : ''}`} className="block pressable">
      <div
        className={['flex items-center gap-1 px-2.5 py-1.5 hover:bg-[var(--accent)]/5 transition-colors', divider ? 'border-b border-[var(--border)]' : ''].join(' ')}
        style={winnerColor ? { backgroundColor: winnerColor + '10' } : undefined}
      >
        <div className="flex items-center gap-1 flex-1 min-w-0 justify-end">
          <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">{fixture.home_team?.short_name || fixture.home_team?.name}</span>
          <TeamCrest team={fixture.home_team} size="xs" />
        </div>
        <div className="shrink-0 w-[46px] text-center">
          {isCompleted ? (
            <span className="font-bold text-[12px] text-[var(--text-primary)] tabular-nums">{fixture.home_score}–{fixture.away_score}</span>
          ) : isLive ? (
            <Badge variant="live" className="text-[9px] px-1">LIVE</Badge>
          ) : isPostponed ? (
            <span className="text-[10px] text-[var(--amber)] font-semibold">PPD</span>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)] font-medium tabular-nums">
              {fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'vs'}
            </span>
          )}
          {giantKiller.eligible && <div className="text-[8px] font-bold text-amber-500 mt-0.5">⚔ GK</div>}
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <TeamCrest team={fixture.away_team} size="xs" />
          <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">{fixture.away_team?.short_name || fixture.away_team?.name}</span>
        </div>
      </div>
    </Link>
  )
}

function groupByDate(fixtures: any[], reverseChron: boolean) {
  const groups = new Map<string, any[]>()
  for (const f of fixtures) {
    const label = f.kickoff_time ? formatDateLabel(f.kickoff_time) : 'Unknown date'
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
  if (diff > -7 && diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
}

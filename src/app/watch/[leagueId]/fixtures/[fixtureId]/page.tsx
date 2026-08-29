'use client'
import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicShell, PublicNotAvailable } from '@/components/layout/PublicShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { PageLoader, ErrorState } from '@/components/ui/LoadingSpinner'
import { fetchPublicLeagueData, type PublicLeagueData } from '@/lib/publicLeague'
import { computeStandingsAsOf, giantKillerEligibility } from '@/lib/giantKiller'

export default function PublicFixtureDetailPage({ params }: { params: Promise<{ leagueId: string; fixtureId: string }> }) {
  const { leagueId, fixtureId } = use(params)
  const searchParams = useSearchParams()
  const asPlayerId = searchParams.get('as')

  const [data, setData] = useState<PublicLeagueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [error, setError] = useState(false)

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

  const { players, assignments, fixtures, powerUps } = data
  const fixture = fixtures.find((f: any) => f.id === fixtureId)
  if (!fixture) return <ErrorState title="Fixture not found" onRetry={load} />

  const ownerMap = new Map<string, any[]>()
  for (const a of assignments) {
    if (a.teams && a.players) {
      const arr = ownerMap.get(a.teams.id) ?? []
      arr.push(a.players)
      ownerMap.set(a.teams.id, arr)
    }
  }
  const homeOwners = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners = ownerMap.get(fixture.away_team_id) ?? []

  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'

  const allTeamIds = [...new Set(fixtures.flatMap((f: any) => [f.home_team_id, f.away_team_id]))]
  const gkRanks = fixture.kickoff_time ? computeStandingsAsOf(allTeamIds, fixtures, fixture.kickoff_time) : null
  const gk = !isCompleted ? giantKillerEligibility(fixture.home_team_id, fixture.away_team_id, gkRanks) : { eligible: false }

  const donRows = powerUps.filter((p: any) => p.power_up_type === 'double_or_nothing' && p.status === 'pending' &&
    (p.team_id === fixture.home_team_id || p.team_id === fixture.away_team_id))

  return (
    <PublicShell leagueId={leagueId} players={players} selectedPlayerId={asPlayerId} title="Match Centre" backHref={`/watch/${leagueId}/fixtures`}>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <TeamCrest team={fixture.home_team} size="lg" />
            <p className="text-xs font-semibold text-[var(--text-primary)] text-center truncate w-full">{fixture.home_team?.name}</p>
            {homeOwners.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1">
                {homeOwners.map((o: any) => (
                  <Link key={o.id} href={`/watch/${leagueId}/players/${o.id}${asPlayerId ? `?as=${asPlayerId}` : ''}`}>
                    <Avatar name={o.name} color={o.color} size="xs" />
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 text-center px-2">
            {isCompleted || isLive ? (
              <div className="font-display text-4xl font-black text-[var(--text-primary)] tabular-nums">
                {fixture.home_score ?? '–'}<span className="text-[var(--text-muted)] mx-1">:</span>{fixture.away_score ?? '–'}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-[var(--text-muted)]">vs</span>
                {fixture.kickoff_time && (
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {new Date(fixture.kickoff_time).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}
            {isLive && <Badge variant="live" className="mt-1">LIVE</Badge>}
            {isCompleted && <div className="text-[9px] text-[var(--text-muted)] mt-1">FT</div>}
          </div>
          <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <TeamCrest team={fixture.away_team} size="lg" />
            <p className="text-xs font-semibold text-[var(--text-primary)] text-center truncate w-full">{fixture.away_team?.name}</p>
            {awayOwners.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1">
                {awayOwners.map((o: any) => (
                  <Link key={o.id} href={`/watch/${leagueId}/players/${o.id}${asPlayerId ? `?as=${asPlayerId}` : ''}`}>
                    <Avatar name={o.name} color={o.color} size="xs" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {gk.eligible && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 mb-4">
          <p className="text-xs font-bold text-amber-500">⚔ Giant Killer chance</p>
          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">A bottom-6 side facing a top-6 side — a win here earns bonus points.</p>
        </div>
      )}

      {donRows.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-4">
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Power-ups in play</p>
          <div className="space-y-1.5">
            {donRows.map((pu: any) => (
              <div key={pu.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span>🎲</span>
                <span>{pu.players?.name} doubled {pu.team_id === fixture.home_team_id ? fixture.home_team?.short_name : fixture.away_team?.short_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </PublicShell>
  )
}

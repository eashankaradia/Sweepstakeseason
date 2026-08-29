'use client'
import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PublicShell, PublicNotAvailable } from '@/components/layout/PublicShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { PageLoader, ErrorState } from '@/components/ui/LoadingSpinner'
import { fetchPublicLeagueData, type PublicLeagueData } from '@/lib/publicLeague'

export default function PublicHomePage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = use(params)
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

  const { league, players, playerScores, assignments, teamScores, fixtures, powerUps } = data

  const standings = players.map((p: any) => {
    const score = playerScores.find((s: any) => s.player_id === p.id)
    return { player: p, totalPoints: score?.total_points ?? 0 }
  }).sort((a: any, b: any) => b.totalPoints - a.totalPoints)

  const selectedId = asPlayerId ?? standings[0]?.player.id ?? null
  const myIdx = standings.findIndex((s: any) => s.player.id === selectedId)
  const myEntry = myIdx >= 0 ? standings[myIdx] : null

  const teamPtsMap = new Map<string, number>()
  for (const ts of teamScores) teamPtsMap.set(ts.team_id, (teamPtsMap.get(ts.team_id) ?? 0) + (ts.total_points ?? 0))

  const ownerMap = new Map<string, any[]>()
  for (const a of assignments) {
    if (a.teams && a.players) {
      const arr = ownerMap.get(a.teams.id) ?? []
      arr.push(a.players)
      ownerMap.set(a.teams.id, arr)
    }
  }

  const myTeams = assignments
    .filter((a: any) => a.player_id === selectedId && a.teams)
    .map((a: any) => a.teams)
    .sort((a: any, b: any) => (teamPtsMap.get(b.id) ?? 0) - (teamPtsMap.get(a.id) ?? 0))

  const myTeamIds = new Set(myTeams.map((t: any) => t.id))
  const now = Date.now()
  const liveFixtures = fixtures.filter((f: any) => f.status === 'live')
  const todayStr = new Date().toISOString().substring(0, 10)
  const todayFixtures = fixtures.filter((f: any) => f.status === 'scheduled' && f.kickoff_time?.startsWith(todayStr))

  const myUpcoming = fixtures
    .filter((f: any) => f.status === 'scheduled' && new Date(f.kickoff_time).getTime() > now && (myTeamIds.has(f.home_team_id) || myTeamIds.has(f.away_team_id)))
    .sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
    .slice(0, 5)

  return (
    <PublicShell leagueId={leagueId} players={players} selectedPlayerId={selectedId}>
      <div className="mb-4">
        <h1 className="font-black text-lg text-[var(--text-primary)] leading-tight truncate">{league.name}</h1>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{league.season}</p>
      </div>

      {myEntry && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] mb-5 p-4 flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar name={myEntry.player.name} color={myEntry.player.color} size="lg" />
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-[var(--bg-card)]"
              style={{ backgroundColor: myEntry.player.color, color: '#fff' }}
            >
              {myIdx + 1}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="label-caps mb-0.5">Standing</p>
            <p className="font-bold text-base text-[var(--text-primary)] leading-tight truncate">{myEntry.player.name}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-display font-black text-2xl text-[var(--text-primary)] leading-none">{myEntry.totalPoints}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">pts total</p>
          </div>
        </div>
      )}

      {liveFixtures.length > 0 && (
        <section className="mb-5">
          <p className="text-xs font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)] animate-pulse" /> Live now
          </p>
          <div className="space-y-2">
            {liveFixtures.map((f: any) => <MiniFixture key={f.id} fixture={f} ownerMap={ownerMap} leagueId={leagueId} asId={selectedId} />)}
          </div>
        </section>
      )}

      {todayFixtures.length > 0 && (
        <section className="mb-5">
          <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Today · {todayFixtures.length} game{todayFixtures.length !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            {todayFixtures.map((f: any) => <MiniFixture key={f.id} fixture={f} ownerMap={ownerMap} leagueId={leagueId} asId={selectedId} />)}
          </div>
        </section>
      )}

      {myTeams.length > 0 && (
        <section className="mb-5">
          <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">{myEntry?.player.name}&apos;s clubs</p>
          <div className="flex items-center justify-between gap-2 mb-3">
            {myTeams.map((team: any) => (
              <Link key={team.id} href={`/watch/${leagueId}/teams/${team.id}${selectedId ? `?as=${selectedId}` : ''}`} className="flex-1 flex flex-col items-center gap-1 pressable">
                <div className="w-14 h-14 flex items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border)]">
                  <TeamCrest team={team} size="lg" />
                </div>
              </Link>
            ))}
          </div>
          {myUpcoming.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">Next up</p>
              <div className="space-y-2">
                {myUpcoming.map((f: any) => <MiniFixture key={f.id} fixture={f} ownerMap={ownerMap} leagueId={leagueId} asId={selectedId} />)}
              </div>
            </div>
          )}
        </section>
      )}

      <PublicPowerUpsFeed activations={powerUps} />

      <div className="mt-6 text-center">
        <p className="text-xs text-[var(--text-secondary)] mb-2">Playing along? Get your own account to activate power-ups and more.</p>
        <Link href="/auth/signup" className="text-sm font-semibold text-[var(--accent)] hover:underline">Sign up →</Link>
      </div>
    </PublicShell>
  )
}

export function MiniFixture({ fixture, ownerMap, leagueId, asId }: { fixture: any; ownerMap: Map<string, any[]>; leagueId: string; asId: string | null }) {
  const isLive = fixture.status === 'live'
  const isCompleted = fixture.status === 'completed'
  const homeOwners = ownerMap.get(fixture.home_team_id) ?? []
  const awayOwners = ownerMap.get(fixture.away_team_id) ?? []
  return (
    <Link href={`/watch/${leagueId}/fixtures/${fixture.id}${asId ? `?as=${asId}` : ''}`} className="block pressable">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 justify-end">
          <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">{fixture.home_team?.short_name || fixture.home_team?.name}</span>
          <TeamCrest team={fixture.home_team} size="xs" />
        </div>
        <div className="shrink-0 w-14 text-center">
          {isCompleted || isLive ? (
            <span className="font-bold text-xs text-[var(--text-primary)] tabular-nums">{fixture.home_score}–{fixture.away_score}</span>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
              {fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'vs'}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <TeamCrest team={fixture.away_team} size="xs" />
          <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">{fixture.away_team?.short_name || fixture.away_team?.name}</span>
        </div>
      </div>
      {(homeOwners.length > 0 || awayOwners.length > 0) && (
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-[9px] text-[var(--text-muted)] truncate">{homeOwners.map((o: any) => o.name.split(' ')[0]).join(', ')}</span>
          <span className="text-[9px] text-[var(--text-muted)] truncate">{awayOwners.map((o: any) => o.name.split(' ')[0]).join(', ')}</span>
        </div>
      )}
    </Link>
  )
}

export function PublicPowerUpsFeed({ activations }: { activations: any[] }) {
  type Group = { key: string; type: 'don'; player: any; team: any; month: string; total: number; applied: number; netDelta: number }
  const donGroups = new Map<string, Group>()
  const reverseRows: any[] = []

  for (const a of activations) {
    if (a.power_up_type === 'double_or_nothing') {
      const key = `${a.player_id}-${a.team_id}-${a.season_month}`
      const g = donGroups.get(key) ?? { key, type: 'don', player: a.players, team: a.teams, month: a.season_month, total: 0, applied: 0, netDelta: 0 }
      g.total++
      if (a.status === 'applied') { g.applied++; g.netDelta += a.points_delta ?? 0 }
      donGroups.set(key, g)
    } else if (a.power_up_type === 'reverse' && a.status === 'applied') {
      reverseRows.push(a)
    }
  }

  const items = [...donGroups.values(), ...reverseRows.map(r => ({ ...r, type: 'reverse' as const }))]
  if (items.length === 0) return null

  return (
    <section className="mb-5">
      <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Power-ups</p>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        {items.map((item: any, i) => {
          if (item.type === 'don') {
            return (
              <div key={item.key} className={`flex items-center gap-2.5 px-3 py-2.5 ${i < items.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
                <span className="text-base shrink-0">🎲</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-primary)] font-medium leading-snug">
                    {item.player?.name} doubled {item.team?.short_name || item.team?.name}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {item.applied}/{item.total} games played
                    {item.applied > 0 && item.netDelta !== 0 && (
                      <span className={item.netDelta > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}> · {item.netDelta > 0 ? 'paying off' : 'backfiring'}</span>
                    )}
                  </p>
                </div>
              </div>
            )
          }
          const targeted = item.teams
          const fx = item.fixtures
          const opponent = fx && targeted ? (fx.home_team_id === targeted.id ? fx.away_team : fx.home_team) : null
          return (
            <div key={item.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${i < items.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
              <span className="text-base shrink-0">🔄</span>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <TeamCrest team={targeted} size="xs" />
                <span className="text-xs text-[var(--text-primary)] font-medium truncate">{targeted?.short_name || targeted?.name}</span>
                {opponent && (
                  <>
                    <span className="text-[9px] text-[var(--text-muted)] shrink-0">vs opponent</span>
                    <TeamCrest team={opponent} size="xs" />
                    <span className="text-xs text-[var(--text-primary)] font-medium truncate">{opponent.short_name || opponent.name}</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

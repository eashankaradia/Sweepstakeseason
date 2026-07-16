'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { TabBar } from '@/components/ui/TabBar'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'

type StandingEntry = {
  player: { id: string; name: string; color: string; user_id: string | null }
  totalPoints: number
  wins: number
  draws: number
  losses: number
  played: number
  gf: number
  ga: number
  gd: number
  teams: any[]
}

type MonthlyEntry = {
  month: string
  player_id: string
  player_name: string
  player_color: string
  monthly_points: number
  monthly_wins: number
  monthly_draws: number
  monthly_losses: number
  monthly_played: number
}

type MonthGroup = { month: string; rows: MonthlyEntry[] }

export default function StandingsPage() {
  const [standings, setStandings] = useState<StandingEntry[]>([])
  const [monthlyGroups, setMonthlyGroups] = useState<MonthGroup[]>([])
  const [competitions, setCompetitions] = useState<any[]>([])
  const [teamScores, setTeamScores] = useState<any[]>([])
  const [teamCompetitions, setTeamCompetitions] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [league, setLeague] = useState<any>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overall' | 'monthly' | 'tables' | 'heatmap'>('overall')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [espnStandings, setEspnStandings] = useState<Map<string, any[]>>(new Map())
  const [espnLoading, setEspnLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (tab !== 'tables' || competitions.length === 0 || espnStandings.size > 0) return
    const domestic = competitions.filter((c: any) => c.competition_type === 'domestic_league' && c.espn_slug)
    if (domestic.length === 0) return
    setEspnLoading(true)
    const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
    Promise.all(domestic.map(async (comp: any) => {
      try {
        const res = await fetch(`${ESPN_BASE}/${comp.espn_slug}/standings`)
        if (!res.ok) return null
        const data = await res.json()
        const entries = data?.standings?.entries ?? data?.children?.[0]?.standings?.entries ?? []
        const rows = entries.map((entry: any, i: number) => {
          const stats: Record<string, number> = {}
          for (const s of (entry.stats ?? [])) stats[s.name] = Number(s.value ?? 0)
          return {
            espnTeamId: String(entry.team?.id ?? ''),
            teamName: entry.team?.displayName ?? '',
            abbr: entry.team?.abbreviation ?? '',
            position: stats.rank ?? stats.position ?? i + 1,
            played: stats.gamesPlayed ?? 0,
            wins: stats.wins ?? 0,
            draws: stats.ties ?? stats.draws ?? 0,
            losses: stats.losses ?? 0,
            gf: stats.pointsFor ?? stats.goalsFor ?? 0,
            ga: stats.pointsAgainst ?? stats.goalsAgainst ?? 0,
            gd: stats.pointDifferential ?? 0,
            points: stats.points ?? 0,
          }
        }).sort((a: any, b: any) => a.position - b.position)
        return { compId: comp.id, rows }
      } catch { return null }
    })).then(results => {
      const map = new Map<string, any[]>()
      for (const r of results) {
        if (r) map.set(r.compId, r.rows)
      }
      setEspnStandings(map)
      setEspnLoading(false)
    })
  }, [tab, competitions])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const [{ data: lg }, { data: authData }] = await Promise.all([
      supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle(),
      supabase.auth.getUser(),
    ])
    setLeague(lg)
    setMyUserId(authData?.user?.id ?? null)
    if (!lg) { setLoading(false); return }

    const [
      { data: playersData },
      { data: playerScores },
      { data: assignmentsData },
      { data: monthly },
      { data: teamScoresData },
      { data: compsData },
      { data: tcData },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_scores').select('*').eq('league_id', lg.id),
      supabase.from('player_team_assignments').select('*, teams(*)').eq('league_id', lg.id),
      supabase.rpc('get_monthly_standings', { p_league_id: lg.id }),
      supabase.from('team_scores').select('*, teams(*)').eq('league_id', lg.id),
      supabase.from('competitions').select('*').eq('league_id', lg.id).eq('enabled', true).order('display_order'),
      supabase.from('team_competitions').select('team_id, competition_id, teams(*)').eq('league_id', lg.id),
    ])

    setAssignments(assignmentsData ?? [])
    setPlayers(playersData ?? [])
    setTeamScores(teamScoresData ?? [])
    setCompetitions(compsData ?? [])
    setTeamCompetitions(tcData ?? [])

    const draftDone = (assignmentsData?.length ?? 0) > 0
    setHasDraft(draftDone)

    // Aggregate GF/GA per team across all competitions for player-level GD
    const teamGF = new Map<string, number>()
    const teamGA = new Map<string, number>()
    for (const ts of (teamScoresData ?? [])) {
      teamGF.set(ts.team_id, (teamGF.get(ts.team_id) ?? 0) + ts.goals_for)
      teamGA.set(ts.team_id, (teamGA.get(ts.team_id) ?? 0) + ts.goals_against)
    }

    const rows: StandingEntry[] = (playersData ?? []).map((p: any) => {
      const score = (playerScores ?? []).find((s: any) => s.player_id === p.id)
      const teams = (assignmentsData ?? []).filter((a: any) => a.player_id === p.id).map((a: any) => a.teams).filter(Boolean)
      const gf = teams.reduce((sum: number, t: any) => sum + (teamGF.get(t.id) ?? 0), 0)
      const ga = teams.reduce((sum: number, t: any) => sum + (teamGA.get(t.id) ?? 0), 0)
      return {
        player: p,
        totalPoints: score?.total_points ?? 0,
        wins: score?.wins ?? 0,
        draws: score?.draws ?? 0,
        losses: score?.losses ?? 0,
        played: score?.matches_played ?? 0,
        gf,
        ga,
        gd: gf - ga,
        teams,
      }
    }).sort((a, b) => b.totalPoints - a.totalPoints || b.gd - a.gd)

    setStandings(rows)

    const groups: MonthGroup[] = []
    const seen = new Set<string>()
    for (const row of (monthly ?? []) as MonthlyEntry[]) {
      if (!seen.has(row.month)) {
        seen.add(row.month)
        groups.push({ month: row.month, rows: [] })
      }
      groups.find(g => g.month === row.month)!.rows.push(row)
    }
    setMonthlyGroups(groups)
    setLoading(false)
  }

  function toggleExpanded(playerId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  if (loading) return <AppShell title="Standings"><PageLoader /></AppShell>

  if (!league) {
    return (
      <AppShell title="Standings">
        <EmptyState icon="🏆" title="No league yet" description="Set up a league to see standings." />
      </AppShell>
    )
  }

  const ownerMap = new Map<string, any>()
  for (const a of assignments) {
    if (a.teams) ownerMap.set(a.teams.id, players.find(p => p.id === a.player_id))
  }

  return (
    <AppShell title="Standings">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
        <Badge variant={league.status === 'active' ? 'success' : 'warning'}>
          {league.status === 'active' ? 'Active' : league.status === 'setup' ? 'Setting up' : league.status}
        </Badge>
      </div>

      <TabBar
        tabs={[
          { key: 'overall', label: 'Overall' },
          { key: 'monthly', label: 'Monthly' },
          { key: 'tables', label: 'Tables' },
          { key: 'heatmap', label: 'Heatmap' },
        ]}
        active={tab}
        onChange={v => setTab(v as any)}
        className="mb-4"
      />

      {tab === 'overall' && (
        standings.length === 0
          ? <EmptyState icon="👥" title="No players yet" description="Add players in Settings." />
          : (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="sticky top-14 z-10 grid grid-cols-[28px_1fr_28px_28px_28px_40px_44px] items-center gap-1 px-3 py-2 bg-[var(--bg-card)] border-b border-[var(--border)]">
                <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">#</span>
                <span className="text-[10px] text-[var(--text-muted)] font-medium">Player</span>
                <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">W</span>
                <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">D</span>
                <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">L</span>
                <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">GD</span>
                <span className="text-[10px] text-[var(--text-muted)] font-medium text-right">Pts</span>
              </div>

              {standings.map((entry, idx) => {
                const isMe = entry.player.user_id === myUserId
                const isExpandedPlayer = expanded.has(entry.player.id)
                const medals = ['🥇', '🥈', '🥉']
                const gdColor = entry.gd > 0 ? 'text-emerald-400' : entry.gd < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'
                const ptsColor = idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-orange-400' : 'text-[var(--text-primary)]'
                return (
                  <div
                    key={entry.player.id}
                    className="border-b border-[var(--border)] last:border-0"
                    style={{ background: isMe ? `${entry.player.color}08` : idx === 0 ? 'rgba(251,191,36,0.04)' : 'var(--bg-card)' }}
                  >
                    <button onClick={() => toggleExpanded(entry.player.id)} className="w-full text-left">
                      <div className="grid grid-cols-[28px_1fr_28px_28px_28px_40px_44px] items-center gap-1 px-3 py-3">
                        <div className="flex items-center justify-center">
                          {idx < 3
                            ? <span className="text-base leading-none">{medals[idx]}</span>
                            : <span className="text-[11px] font-bold text-[var(--text-muted)]">{idx + 1}</span>
                          }
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={entry.player.name} color={entry.player.color} size="sm" />
                          <div className="min-w-0">
                            <span className="font-semibold text-sm text-[var(--text-primary)] truncate block">
                              {entry.player.name}
                              {isMe && (
                                <span
                                  className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: `${entry.player.color}25`, color: entry.player.color }}
                                >
                                  You
                                </span>
                              )}
                            </span>
                            {!hasDraft && <span className="text-[10px] text-[var(--text-muted)]">Draft pending</span>}
                          </div>
                        </div>
                        <span className="text-xs text-emerald-400 font-medium text-center">{hasDraft ? entry.wins : '—'}</span>
                        <span className="text-xs text-amber-400 font-medium text-center">{hasDraft ? entry.draws : '—'}</span>
                        <span className="text-xs text-red-400 font-medium text-center">{hasDraft ? entry.losses : '—'}</span>
                        <span className={`text-xs font-medium text-center ${gdColor}`}>
                          {hasDraft ? (entry.gd > 0 ? `+${entry.gd}` : `${entry.gd}`) : '—'}
                        </span>
                        <span className={`text-base font-black text-right ${ptsColor}`}>{entry.totalPoints}</span>
                      </div>
                    </button>

                    {isExpandedPlayer && entry.teams.length > 0 && (
                      <div className="px-3 pb-3 border-t border-[var(--border)]/50">
                        <p className="text-[10px] text-[var(--text-muted)] pt-2 pb-1.5 uppercase tracking-wide font-medium">Teams</p>
                        <div className="space-y-1">
                          {entry.teams.map((team: any) => {
                            const scores = teamScores.filter((ts: any) => ts.team_id === team.id)
                            const aggGF = scores.reduce((s: number, ts: any) => s + (ts.goals_for ?? 0), 0)
                            const aggGA = scores.reduce((s: number, ts: any) => s + (ts.goals_against ?? 0), 0)
                            const aggW = scores.reduce((s: number, ts: any) => s + (ts.wins ?? 0), 0)
                            const aggD = scores.reduce((s: number, ts: any) => s + (ts.draws ?? 0), 0)
                            const aggL = scores.reduce((s: number, ts: any) => s + (ts.losses ?? 0), 0)
                            const aggPts = scores.reduce((s: number, ts: any) => s + (ts.total_points ?? 0), 0)
                            const aggGD = aggGF - aggGA
                            return (
                              <div key={team.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-[var(--bg)]/60">
                                <TeamCrest team={team} size="xs" />
                                <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{team.short_name || team.name}</span>
                                {scores.length > 0 ? (
                                  <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                                    <span className="text-emerald-400">{aggW}W</span>
                                    <span className="text-amber-400">{aggD}D</span>
                                    <span className="text-red-400">{aggL}L</span>
                                    <span className={aggGD >= 0 ? 'text-emerald-400' : 'text-red-400'}>{aggGD >= 0 ? `+${aggGD}` : aggGD}</span>
                                    <span className="font-bold text-[var(--text-primary)] ml-1">{aggPts}pts</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-[var(--text-muted)]">No results yet</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
      )}

      {tab === 'monthly' && (
        <MonthlyView groups={monthlyGroups} myUserId={myUserId} />
      )}

      {tab === 'tables' && (
        <TablesView
          competitions={competitions}
          teamScores={teamScores}
          teamCompetitions={teamCompetitions}
          ownerMap={ownerMap}
          espnStandings={espnStandings}
          espnLoading={espnLoading}
        />
      )}

      {tab === 'heatmap' && (
        <HeatmapView
          players={players}
          competitions={competitions}
          teamCompetitions={teamCompetitions}
          assignments={assignments}
          myUserId={myUserId}
        />
      )}
    </AppShell>
  )
}

function MonthlyView({ groups, myUserId }: { groups: MonthGroup[]; myUserId: string | null }) {
  if (groups.length === 0) {
    return <EmptyState icon="📅" title="No monthly data yet" description="Monthly breakdowns appear once match results come in." />
  }

  const currentMonth = new Date().toISOString().substring(0, 7)
  // Show most recent month first
  const sortedGroups = [...groups].sort((a, b) => b.month.localeCompare(a.month))

  return (
    <div className="space-y-4">
      {sortedGroups.map(({ month, rows }) => {
        const label = new Date(month + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        const winner = rows[0]
        const last = rows[rows.length - 1]
        const isCurrent = month === currentMonth
        return (
          <div key={month} className={`rounded-xl border overflow-hidden ${isCurrent ? 'border-[var(--accent)]/40' : 'border-[var(--border)]'}`}>
            <div className={`px-3 py-2 border-b flex items-center justify-between ${isCurrent ? 'bg-[var(--accent)]/8 border-[var(--accent)]/30' : 'bg-[var(--bg-card)] border-[var(--border)]'}`}>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[var(--text-primary)]">{label}</span>
                {isCurrent && (
                  <span className="text-[9px] font-bold text-[var(--accent)] bg-[var(--accent)]/15 px-1.5 py-0.5 rounded-full">Current</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                {winner && <span className="text-amber-400 font-medium">🥇 {winner.player_name}</span>}
                {last && last.player_id !== winner?.player_id && (
                  <span className="text-red-400 font-medium">🪣 {last.player_name}</span>
                )}
              </div>
            </div>
            {rows.map((row, idx) => {
              const isMe = row.player_id === myUserId
              return (
                <div
                  key={row.player_id}
                  className={['flex items-center gap-2.5 px-3 py-2.5 border-b border-[var(--border)] last:border-0', isMe ? 'bg-[var(--accent)]/5' : 'bg-[var(--bg-card)]'].join(' ')}
                >
                  <span className={`text-[11px] font-bold w-4 text-center shrink-0 ${idx === 0 ? 'text-amber-400' : idx === rows.length - 1 ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                    {idx + 1}
                  </span>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.player_color }} />
                  <span className="flex-1 text-sm text-[var(--text-primary)] font-medium min-w-0 truncate">
                    {row.player_name}
                    {isMe && <span className="ml-1 text-[9px] text-[var(--accent)] font-semibold uppercase tracking-wide">You</span>}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 text-[11px]">
                    <span className="text-emerald-400">{row.monthly_wins}W</span>
                    <span className="text-amber-400">{row.monthly_draws}D</span>
                    <span className="text-red-400">{row.monthly_losses}L</span>
                    <span className="font-bold text-[var(--text-primary)] w-6 text-right">{row.monthly_points}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function TablesView({
  competitions,
  teamScores,
  teamCompetitions,
  ownerMap,
  espnStandings,
  espnLoading,
}: {
  competitions: any[]
  teamScores: any[]
  teamCompetitions: any[]
  ownerMap: Map<string, any>
  espnStandings: Map<string, any[]>
  espnLoading: boolean
}) {
  if (competitions.length === 0) {
    return <EmptyState icon="📊" title="No competitions" description="Enable competitions in Settings." />
  }

  // Build espn_team_id → our team + owner
  const espnTeamLookup = new Map<string, { team: any; owner: any }>()
  for (const tc of teamCompetitions) {
    if (!tc.teams?.espn_team_id) continue
    const owner = ownerMap.get(tc.teams.id)
    espnTeamLookup.set(String(tc.teams.espn_team_id), { team: tc.teams, owner })
  }

  // Group team_competitions by competition_id → unique teams (for non-ESPN tables)
  const compTeamMap = new Map<string, any[]>()
  for (const tc of teamCompetitions) {
    if (!tc.teams) continue
    if (!compTeamMap.has(tc.competition_id)) compTeamMap.set(tc.competition_id, [])
    const list = compTeamMap.get(tc.competition_id)!
    if (!list.find((t: any) => t.id === tc.teams.id)) list.push(tc.teams)
  }

  const typeOrder: Record<string, number> = { domestic_league: 0, european: 1 }
  // Only show scoring competitions in tables (no domestic cups — they don't award sweepstake points)
  const sortedComps = [...competitions]
    .filter(c => c.competition_type !== 'domestic_cup')
    .sort((a, b) =>
      (typeOrder[a.competition_type] ?? 9) - (typeOrder[b.competition_type] ?? 9) || a.display_order - b.display_order
    )

  return (
    <div className="space-y-5">
      {espnLoading && (
        <div className="text-center py-2 text-[10px] text-[var(--text-muted)]">Loading live tables…</div>
      )}
      {sortedComps.map(comp => {
        const isEu = comp.competition_type === 'european'
        const isCup = comp.competition_type === 'domestic_cup'
        const isDomestic = comp.competition_type === 'domestic_league'
        const espnRows = espnStandings.get(comp.id)
        const totalTeams = espnRows?.length ?? 0

        const compHeader = (
          <div className={`px-3 py-2 border-b border-[var(--border)] flex items-center gap-2 ${isEu ? 'bg-purple-500/10' : isCup ? 'bg-amber-500/10' : 'bg-[var(--bg-card)]'}`}>
            <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${isEu ? 'bg-purple-500/20 text-purple-400' : isCup ? 'bg-amber-500/20 text-amber-400' : 'bg-[var(--accent)]/20 text-[var(--accent)]'}`}>
              {comp.short_name}
            </div>
            <span className="font-semibold text-sm text-[var(--text-primary)] flex-1">{comp.name}</span>
            {espnRows && <span className="text-[9px] text-[var(--text-muted)]">Live</span>}
            <Badge variant={isEu ? 'purple' : isCup ? 'warning' : 'muted'} className="text-[9px]">
              {isCup ? 'Cup' : isEu ? 'European' : 'League'}
            </Badge>
          </div>
        )

        // ESPN live table for domestic leagues
        if (isDomestic && espnRows && espnRows.length > 0) {
          return (
            <div key={comp.id} className="rounded-xl border border-[var(--border)] overflow-hidden">
              {compHeader}
              <div className="grid grid-cols-[20px_20px_1fr_22px_22px_22px_22px_34px_32px] items-center gap-0.5 px-2 py-1.5 bg-[var(--bg-card)] border-b border-[var(--border)]/50">
                <span className="text-[9px] text-[var(--text-muted)] text-center">#</span>
                <span />
                <span className="text-[9px] text-[var(--text-muted)]">Club</span>
                <span className="text-[9px] text-[var(--text-muted)] text-center">P</span>
                <span className="text-[9px] text-[var(--text-muted)] text-center">W</span>
                <span className="text-[9px] text-[var(--text-muted)] text-center">D</span>
                <span className="text-[9px] text-[var(--text-muted)] text-center">L</span>
                <span className="text-[9px] text-[var(--text-muted)] text-center">GD</span>
                <span className="text-[9px] text-[var(--text-muted)] text-right">Pts</span>
              </div>
              {espnRows.map((row: any, idx: number) => {
                const lookup = espnTeamLookup.get(row.espnTeamId)
                const team = lookup?.team
                const owner = lookup?.owner
                const gdColor = row.gd > 0 ? 'text-emerald-400' : row.gd < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'
                const pos = idx + 1
                // Zone indicator: CL=1-4, EL=5, ECL=6, Relegation=last 3
                const zoneColor =
                  pos <= 4 ? '#22c55e' :
                  pos === 5 ? '#f97316' :
                  pos === 6 ? '#eab308' :
                  pos > totalTeams - 3 ? '#ef4444' :
                  'transparent'
                return (
                  <div
                    key={row.espnTeamId}
                    className={`grid grid-cols-[20px_20px_1fr_22px_22px_22px_22px_34px_32px] items-center gap-0.5 px-2 py-2 border-b border-[var(--border)]/40 last:border-0 ${owner ? 'bg-[var(--accent)]/3' : 'bg-[var(--bg-card)]'}`}
                    style={{
                      borderLeft: owner ? `3px solid ${owner.color}` : `3px solid ${zoneColor}20`,
                    }}
                  >
                    <span className="text-[10px] text-[var(--text-muted)] text-center font-medium">{pos}</span>
                    {team ? <TeamCrest team={team} size="xs" /> : <span className="w-4 h-4 rounded-full bg-[var(--border)] shrink-0" />}
                    <div className="min-w-0">
                      <span className="text-xs text-[var(--text-primary)] truncate block leading-tight font-medium">
                        {team?.short_name || row.teamName}
                      </span>
                      {owner && (
                        <span className="text-[9px] font-semibold leading-none" style={{ color: owner.color }}>
                          {owner.name}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--text-secondary)] text-center">{row.played}</span>
                    <span className="text-[10px] text-emerald-400 text-center">{row.wins}</span>
                    <span className="text-[10px] text-amber-400 text-center">{row.draws}</span>
                    <span className="text-[10px] text-red-400 text-center">{row.losses}</span>
                    <span className={`text-[10px] text-center font-medium ${gdColor}`}>{row.gd > 0 ? `+${row.gd}` : row.gd}</span>
                    <span className="text-[10px] font-bold text-[var(--text-primary)] text-right">{row.points}</span>
                  </div>
                )
              })}
              {totalTeams > 0 && (
                <div className="px-3 py-1.5 border-t border-[var(--border)]/50 bg-[var(--bg-card)] flex items-center gap-3 flex-wrap">
                  <LegendDot color="#22c55e" label="Champions League" />
                  <LegendDot color="#f97316" label="Europa League" />
                  <LegendDot color="#eab308" label="Conference League" />
                  <LegendDot color="#ef4444" label="Relegation" />
                </div>
              )}
            </div>
          )
        }

        // Sweepstake table fallback (cups / European / no ESPN data)
        const teams = compTeamMap.get(comp.id) ?? []
        if (teams.length === 0) return null
        const rows = teams.map((team: any) => {
          let scores = teamScores.filter((ts: any) => ts.team_id === team.id && ts.competition_id === comp.id)
          if (scores.length === 0) scores = teamScores.filter((ts: any) => ts.team_id === team.id && ts.competition_id === null)
          if (scores.length === 0) scores = teamScores.filter((ts: any) => ts.team_id === team.id)
          const aggGF = scores.reduce((s: number, ts: any) => s + (ts.goals_for ?? 0), 0)
          const aggGA = scores.reduce((s: number, ts: any) => s + (ts.goals_against ?? 0), 0)
          const aggW = scores.reduce((s: number, ts: any) => s + (ts.wins ?? 0), 0)
          const aggD = scores.reduce((s: number, ts: any) => s + (ts.draws ?? 0), 0)
          const aggL = scores.reduce((s: number, ts: any) => s + (ts.losses ?? 0), 0)
          const aggPts = scores.reduce((s: number, ts: any) => s + (ts.total_points ?? 0), 0)
          const aggP = scores.reduce((s: number, ts: any) => s + (ts.matches_played ?? 0), 0)
          return {
            team, p: aggP, w: aggW, d: aggD, l: aggL,
            gf: aggGF, ga: aggGA, gd: aggGF - aggGA, pts: aggPts,
            owner: ownerMap.get(team.id),
          }
        }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)

        return (
          <div key={comp.id} className="rounded-xl border border-[var(--border)] overflow-hidden">
            {compHeader}
            <div className="grid grid-cols-[20px_20px_1fr_22px_22px_22px_22px_34px_32px] items-center gap-0.5 px-2 py-1.5 bg-[var(--bg-card)] border-b border-[var(--border)]/50">
              <span className="text-[9px] text-[var(--text-muted)] text-center">#</span>
              <span />
              <span className="text-[9px] text-[var(--text-muted)]">Club</span>
              <span className="text-[9px] text-[var(--text-muted)] text-center">P</span>
              <span className="text-[9px] text-[var(--text-muted)] text-center">W</span>
              <span className="text-[9px] text-[var(--text-muted)] text-center">D</span>
              <span className="text-[9px] text-[var(--text-muted)] text-center">L</span>
              <span className="text-[9px] text-[var(--text-muted)] text-center">GD</span>
              <span className="text-[9px] text-[var(--text-muted)] text-right">Pts</span>
            </div>
            {rows.map((row, idx) => {
              const gdColor = row.gd > 0 ? 'text-emerald-400' : row.gd < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'
              return (
                <div
                  key={row.team.id}
                  className="grid grid-cols-[20px_20px_1fr_22px_22px_22px_22px_34px_32px] items-center gap-0.5 px-2 py-2 border-b border-[var(--border)]/40 last:border-0 bg-[var(--bg-card)]"
                  style={row.owner ? { borderLeft: `3px solid ${row.owner.color}` } : { borderLeft: '3px solid transparent' }}
                >
                  <span className="text-[10px] text-[var(--text-muted)] text-center">{idx + 1}</span>
                  <TeamCrest team={row.team} size="xs" />
                  <div className="min-w-0">
                    <span className="text-xs text-[var(--text-primary)] truncate block leading-tight">{row.team.short_name || row.team.name}</span>
                    {row.owner && (
                      <span className="text-[9px] font-semibold leading-none" style={{ color: row.owner.color }}>{row.owner.name}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)] text-center">{row.p}</span>
                  <span className="text-[10px] text-emerald-400 text-center">{row.w}</span>
                  <span className="text-[10px] text-amber-400 text-center">{row.d}</span>
                  <span className="text-[10px] text-red-400 text-center">{row.l}</span>
                  <span className={`text-[10px] text-center font-medium ${gdColor}`}>{row.gd > 0 ? `+${row.gd}` : row.gd}</span>
                  <span className="text-[10px] font-bold text-[var(--text-primary)] text-right">{row.pts}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[9px] text-[var(--text-muted)]">{label}</span>
    </div>
  )
}

function HeatmapView({
  players,
  competitions,
  teamCompetitions,
  assignments,
  myUserId,
}: {
  players: any[]
  competitions: any[]
  teamCompetitions: any[]
  assignments: any[]
  myUserId: string | null
}) {
  if (players.length === 0 || assignments.length === 0) {
    return <EmptyState icon="🗂️" title="No draft yet" description="Run the draft to see the ownership heatmap." />
  }

  const domesticLeague = competitions.find(c => c.competition_type === 'domestic_league')
  const europeanComps = competitions.filter(c => c.competition_type === 'european')

  // team_id → all competitions this team is in
  const teamCompsMap = new Map<string, any[]>()
  for (const tc of teamCompetitions) {
    if (!tc.teams) continue
    const comp = competitions.find(c => c.id === tc.competition_id)
    if (!comp) continue
    if (!teamCompsMap.has(tc.team_id)) teamCompsMap.set(tc.team_id, [])
    teamCompsMap.get(tc.team_id)!.push(comp)
  }

  // All PL teams sorted by position
  const plTeams = teamCompetitions
    .filter(tc => tc.competition_id === domesticLeague?.id && tc.teams)
    .map(tc => tc.teams)
    .filter((t: any, i: number, arr: any[]) => arr.findIndex((u: any) => u.id === t.id) === i)
    .sort((a: any, b: any) => (a.league_position ?? 999) - (b.league_position ?? 999) || a.name.localeCompare(b.name))

  // team_id → array of owners
  const teamOwnersMap = new Map<string, any[]>()
  for (const a of assignments) {
    const player = players.find(p => p.id === a.player_id)
    if (!player) continue
    if (!teamOwnersMap.has(a.team_id)) teamOwnersMap.set(a.team_id, [])
    teamOwnersMap.get(a.team_id)!.push(player)
  }

  const myPlayer = myUserId ? players.find(p => p.user_id === myUserId) : null

  if (plTeams.length === 0) {
    return <EmptyState icon="🗂️" title="No teams found" description="Add teams to competitions to see the heatmap." />
  }

  return (
    <div className="space-y-4">
      {/* Player colour legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-0.5">
        {players.map(p => {
          const isMe = myPlayer ? p.id === myPlayer.id : false
          return (
            <div key={p.id} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className={`text-[10px] ${isMe ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                {p.name}
              </span>
              {isMe && <span className="text-[9px] font-bold" style={{ color: p.color }}>You</span>}
            </div>
          )
        })}
      </div>

      {/* European comp key */}
      {europeanComps.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {europeanComps.map(comp => (
            <span key={comp.id} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
              {comp.short_name}
            </span>
          ))}
          <span className="text-[9px] text-[var(--text-muted)]">= European qualification</span>
        </div>
      )}

      {/* PL teams grid — each team shown once */}
      {domesticLeague && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent)]/15 text-[var(--accent)]">
              {domesticLeague.short_name}
            </div>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">{domesticLeague.name}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {plTeams.map((team: any) => {
              const owners = teamOwnersMap.get(team.id) ?? []
              const euComps = (teamCompsMap.get(team.id) ?? []).filter(c => c.competition_type === 'european')
              const isMyTeam = myPlayer && owners.some(o => o.id === myPlayer.id)
              const primaryColor = owners[0]?.color

              return (
                <div
                  key={team.id}
                  className="rounded-lg p-2 flex flex-col items-center gap-1 border transition-colors"
                  style={{
                    background: primaryColor ? `${primaryColor}14` : 'var(--bg-card)',
                    borderColor: primaryColor ? `${primaryColor}35` : 'var(--border)',
                    boxShadow: isMyTeam ? `0 0 0 1.5px ${owners.find(o => o.id === myPlayer?.id)?.color}70` : undefined,
                  }}
                >
                  <TeamCrest team={team} size="xs" />
                  <span className="text-[9px] text-center text-[var(--text-secondary)] leading-tight line-clamp-1 w-full">
                    {team.short_name || team.name}
                  </span>
                  {euComps.length > 0 && (
                    <div className="flex gap-0.5 flex-wrap justify-center">
                      {euComps.map((ec: any) => (
                        <span key={ec.id} className="text-[7px] font-bold px-1 leading-4 rounded-full bg-purple-500/20 text-purple-400">
                          {ec.short_name}
                        </span>
                      ))}
                    </div>
                  )}
                  {owners.length > 0 ? (
                    <div className="flex items-center gap-0.5 flex-wrap justify-center mt-0.5">
                      {owners.map(owner => (
                        <div key={owner.id} className="w-2 h-2 rounded-full shrink-0 ring-1 ring-[var(--bg-card)]" style={{ backgroundColor: owner.color }} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-[8px] text-[var(--text-muted)]">—</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

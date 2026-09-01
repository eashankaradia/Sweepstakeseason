'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { TabBar } from '@/components/ui/TabBar'
import { PageLoader, EmptyState, ErrorState } from '@/components/ui/LoadingSpinner'
import { shareMonthlyTableToWhatsApp } from '@/lib/utils'
import Link from 'next/link'

type FormResult = 'W' | 'D' | 'L'

type StandingEntry = {
  player: { id: string; name: string; color: string; user_id: string | null }
  totalPoints: number
  bonusPoints: number
  wins: number
  draws: number
  losses: number
  played: number
  gf: number
  ga: number
  gd: number
  teams: any[]
  form: FormResult[]
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

function computeFormForTeams(teamIds: string[], matches: any[]): FormResult[] {
  const idSet = new Set(teamIds)
  const results: FormResult[] = []
  for (const m of matches) {
    const homeIsMine = idSet.has(m.home_team_id)
    const awayIsMine = idSet.has(m.away_team_id)
    if (!homeIsMine && !awayIsMine) continue
    const isDraw = m.home_score === m.away_score
    // A player who owns both sides of a fixture gets two independent
    // results out of it (one per club), not one — don't drop either.
    if (homeIsMine) {
      results.push(isDraw ? 'D' : m.home_score > m.away_score ? 'W' : 'L')
      if (results.length === 5) break
    }
    if (awayIsMine) {
      results.push(isDraw ? 'D' : m.away_score > m.home_score ? 'W' : 'L')
      if (results.length === 5) break
    }
  }
  return results
}

function FormGuide({ results }: { results: FormResult[] }) {
  const map: Record<FormResult, string> = {
    W: 'bg-emerald-500 text-white',
    D: 'bg-amber-400 text-white',
    L: 'bg-red-500 text-white',
  }
  const padded = Array.from({ length: 5 }, (_, i) => results[i] ?? null)
  return (
    <div className="flex items-center gap-0.5">
      {padded.map((r, i) => (
        <div
          key={i}
          className={`w-3.5 h-3.5 rounded-[3px] flex items-center justify-center text-[7px] font-black leading-none shrink-0 ${r ? map[r] : 'bg-[var(--border)]'}`}
        >
          {r}
        </div>
      ))}
    </div>
  )
}

function PositionChange({ movement }: { movement: number | null }) {
  if (movement === null) return <span className="text-[9px] text-[var(--text-secondary)] font-bold leading-none mt-0.5">NEW</span>
  if (movement > 0) return (
    <span className="text-[9px] text-emerald-400 font-black leading-none mt-0.5 bg-emerald-500/10 px-1 rounded-full">▲{movement}</span>
  )
  if (movement < 0) return (
    <span className="text-[9px] text-red-400 font-black leading-none mt-0.5 bg-red-500/10 px-1 rounded-full">▼{Math.abs(movement)}</span>
  )
  return <span className="text-[9px] text-[var(--text-secondary)] leading-none mt-0.5">—</span>
}

export default function StandingsPage() {
  const [standings, setStandings] = useState<StandingEntry[]>([])
  const [monthlyGroups, setMonthlyGroups] = useState<MonthGroup[]>([])
  const [lastMonthPositions, setLastMonthPositions] = useState<Map<string, number>>(new Map())
  const [teamScores, setTeamScores] = useState<any[]>([])
  const [teamCompetitions, setTeamCompetitions] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [league, setLeague] = useState<any>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'leaderboard' | 'monthly'>('leaderboard')
  const [insightsTab, setInsightsTab] = useState<'tables' | 'charts'>('tables')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activityFeed, setActivityFeed] = useState<any[]>([])
  const [recentMatches, setRecentMatches] = useState<any[]>([])

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(false)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    try {

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
      { data: tcData },
      { data: recentMatchData },
      { data: actFeedData },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_scores').select('*').eq('league_id', lg.id),
      supabase.from('player_team_assignments').select('*, teams(*)').eq('league_id', lg.id),
      supabase.rpc('get_monthly_standings', { p_league_id: lg.id }),
      supabase.from('team_scores').select('*, teams(*)').eq('league_id', lg.id),
      supabase.from('team_competitions').select('team_id, competition_id, teams(*)').eq('league_id', lg.id),
      supabase.from('fixtures')
        .select('id, home_team_id, away_team_id, home_score, away_score, kickoff_time')
        .eq('league_id', lg.id)
        .eq('status', 'completed')
        .order('kickoff_time', { ascending: false })
        .limit(500),
      supabase.from('activity_feed')
        .select('player_id, points_delta, created_at')
        .eq('league_id', lg.id)
        .eq('event_type', 'full_time')
        .order('created_at', { ascending: true })
        .limit(3000),
    ])

    setAssignments(assignmentsData ?? [])
    setPlayers(playersData ?? [])
    setTeamScores(teamScoresData ?? [])
    setTeamCompetitions(tcData ?? [])
    setRecentMatches([...(recentMatchData ?? [])].reverse())
    setActivityFeed(actFeedData ?? [])

    const draftDone = (assignmentsData?.length ?? 0) > 0
    setHasDraft(draftDone)

    // Build team assignment map
    const playerTeamsMap = new Map<string, any[]>()
    for (const a of (assignmentsData ?? [])) {
      if (!a.teams) continue
      if (!playerTeamsMap.has(a.player_id)) playerTeamsMap.set(a.player_id, [])
      playerTeamsMap.get(a.player_id)!.push(a.teams)
    }

    // Aggregate GF/GA/points per team across all competitions
    const teamGF = new Map<string, number>()
    const teamGA = new Map<string, number>()
    const teamPts = new Map<string, number>()
    for (const ts of (teamScoresData ?? [])) {
      teamGF.set(ts.team_id, (teamGF.get(ts.team_id) ?? 0) + ts.goals_for)
      teamGA.set(ts.team_id, (teamGA.get(ts.team_id) ?? 0) + ts.goals_against)
      teamPts.set(ts.team_id, (teamPts.get(ts.team_id) ?? 0) + (ts.total_points ?? 0))
    }

    const rows: StandingEntry[] = (playersData ?? []).map((p: any) => {
      const score = (playerScores ?? []).find((s: any) => s.player_id === p.id)
      const teams = (assignmentsData ?? [])
        .filter((a: any) => a.player_id === p.id)
        .map((a: any) => a.teams)
        .filter(Boolean)
        .sort((a: any, b: any) => (teamPts.get(b.id) ?? 0) - (teamPts.get(a.id) ?? 0))
      const gf = teams.reduce((sum: number, t: any) => sum + (teamGF.get(t.id) ?? 0), 0)
      const ga = teams.reduce((sum: number, t: any) => sum + (teamGA.get(t.id) ?? 0), 0)
      const teamIds = teams.map((t: any) => t.id)
      const form = computeFormForTeams(teamIds, recentMatchData ?? [])
      return {
        player: p,
        totalPoints: score?.total_points ?? 0,
        bonusPoints: score?.bonus_points ?? 0,
        wins: score?.wins ?? 0,
        draws: score?.draws ?? 0,
        losses: score?.losses ?? 0,
        played: score?.matches_played ?? 0,
        gf,
        ga,
        gd: gf - ga,
        teams,
        form,
      }
    }).sort((a, b) => b.totalPoints - a.totalPoints || b.gd - a.gd)

    setStandings(rows)

    // Build monthly groups
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

    // Compute last-month position for movement arrows
    const currentMonthYM = new Date().toISOString().substring(0, 7)
    const sortedGroups = [...groups].sort((a, b) => b.month.localeCompare(a.month))
    const lastCompletedGroup = sortedGroups.find(g => g.month !== currentMonthYM) ?? sortedGroups[1]
    if (lastCompletedGroup) {
      const sortedRows = [...lastCompletedGroup.rows].sort((a, b) => b.monthly_points - a.monthly_points)
      const posMap = new Map<string, number>()
      sortedRows.forEach((r, i) => posMap.set(r.player_id, i + 1))
      setLastMonthPositions(posMap)
    }

    setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
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

  if (error) return <AppShell title="Standings"><ErrorState onRetry={load} /></AppShell>

  if (!league) {
    return (
      <AppShell title="Standings">
        <EmptyState icon="🏆" title="No league yet" description="Set up a league to see standings." />
      </AppShell>
    )
  }

  const ownerMap = new Map<string, any[]>()
  for (const a of assignments) {
    if (a.teams) {
      const player = players.find(p => p.id === a.player_id)
      if (player) {
        const arr = ownerMap.get(a.teams.id) ?? []
        if (!arr.find((p: any) => p.id === player.id)) arr.push(player)
        ownerMap.set(a.teams.id, arr)
      }
    }
  }

  return (
    <AppShell
      title="Standings"
      action={
        <Link
          href="/teams"
          aria-label="Browse all clubs"
          title="Browse all clubs"
          className="w-11 h-11 -mr-1.5 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
          </svg>
        </Link>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
        <Badge variant={league.status === 'active' ? 'success' : 'warning'}>
          {league.status === 'active' ? 'Active' : league.status === 'setup' ? 'Setting up' : league.status}
        </Badge>
      </div>

      <TabBar
        tabs={[
          { key: 'leaderboard', label: 'Leaderboard' },
          { key: 'monthly', label: 'Monthly' },
        ]}
        active={tab}
        onChange={v => setTab(v as any)}
        className="mb-4"
      />

      {tab === 'leaderboard' && (
        standings.length === 0
          ? <EmptyState icon="👥" title="No players yet" description="Add players in Settings." />
          : (
            <>
            <div className="rounded-xl border border-[var(--border)] overflow-hidden mb-5">
              <p className="text-[10px] text-[var(--text-secondary)] px-3 py-2.5 bg-[var(--bg-card)] border-b border-[var(--border)] leading-relaxed">
                <span className="font-semibold text-purple-400">Bonus pts</span> reward Giant Killer wins · <span className="font-semibold text-emerald-400">▲</span>/<span className="font-semibold text-red-400">▼</span> shows movement vs last month · tap a row for details
              </p>
              {/* Column header */}
              <div className="bg-[var(--bg-card)] border-b border-[var(--border)]">
                <div className="grid grid-cols-[32px_1fr_80px_38px_50px] items-center gap-2 px-3 py-2.5">
                  <span className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide text-center">#</span>
                  <span className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Player</span>
                  <span className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide text-center">Form</span>
                  <span className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide text-center">GD</span>
                  <span className="text-[9px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide text-right">Pts</span>
                </div>
              </div>

              {standings.map((entry, idx) => {
                const isMe = entry.player.user_id === myUserId
                const isExpandedPlayer = expanded.has(entry.player.id)
                const medals = ['🥇', '🥈', '🥉']
                const gdColor = entry.gd > 0 ? 'text-emerald-400' : entry.gd < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'
                const ptsColor = idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-orange-400' : 'text-[var(--text-primary)]'

                // Position movement vs last month
                const lastPos = lastMonthPositions.size > 0 ? (lastMonthPositions.get(entry.player.id) ?? null) : null
                const movement = lastPos !== null ? lastPos - (idx + 1) : null

                return (
                  <div
                    key={entry.player.id}
                    className="border-b border-[var(--border)] last:border-0 border-l-2"
                    style={{
                      background: `${entry.player.color}08`,
                      borderLeftColor: `${entry.player.color}${isMe ? '' : '80'}`,
                    }}
                  >
                    <button
                      onClick={() => toggleExpanded(entry.player.id)}
                      className="w-full text-left"
                    >
                      <div className="grid grid-cols-[32px_1fr_80px_38px_50px] items-center gap-2 px-3 py-3 min-h-[52px]">
                        {/* Position with movement arrow */}
                        <div className="flex items-center justify-center gap-0.5 h-full">
                          <div className="flex flex-col items-center leading-none">
                            {idx < 3
                              ? <span className="text-base leading-none">{medals[idx]}</span>
                              : <span className="text-[12px] font-bold text-[var(--text-muted)]">{idx + 1}</span>
                            }
                            <PositionChange movement={movement} />
                          </div>
                        </div>

                        {/* Player */}
                        <Link
                          href={`/players/${entry.player.id}`}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-2 min-w-0"
                        >
                          <Avatar name={entry.player.name} color={entry.player.color} size="sm" />
                          <div className="min-w-0">
                            <span className="font-semibold text-sm text-[var(--text-primary)] truncate block leading-tight hover:text-[var(--accent)] transition-colors">
                              {entry.player.name}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isMe && (
                                <span
                                  className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none"
                                  style={{ backgroundColor: `${entry.player.color}25`, color: entry.player.color }}
                                >
                                  You
                                </span>
                              )}
                              {!hasDraft && <span className="text-[9px] text-[var(--text-muted)]">Draft pending</span>}
                            </div>
                          </div>
                        </Link>

                        {/* Form guide */}
                        <div className="flex justify-center">
                          {hasDraft
                            ? <FormGuide results={entry.form} />
                            : <span className="text-[10px] text-[var(--text-muted)]">—</span>
                          }
                        </div>

                        {/* GD */}
                        <span className={`text-xs font-semibold text-center ${gdColor}`}>
                          {hasDraft ? (entry.gd > 0 ? `+${entry.gd}` : `${entry.gd}`) : '—'}
                        </span>

                        {/* Pts */}
                        <div className="text-right">
                          <span className={`font-display text-lg font-black leading-none ${ptsColor}`}>{entry.totalPoints}</span>
                          {entry.bonusPoints > 0 && (
                            <div className="text-[8px] font-bold text-purple-400 leading-none mt-0.5">+{entry.bonusPoints} bonus</div>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded: W/D/L breakdown + teams */}
                    {isExpandedPlayer && (
                      <div className="px-3 pb-3 border-t border-[var(--border)]/50">
                        {hasDraft && (
                          <div className="flex items-center gap-3 pt-2.5 pb-2">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="font-semibold text-emerald-400">{entry.wins}W</span>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span className="font-semibold text-amber-400">{entry.draws}D</span>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span className="font-semibold text-red-400">{entry.losses}L</span>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span className="text-[var(--text-secondary)]">{entry.played} played</span>
                              {entry.bonusPoints > 0 && (
                                <>
                                  <span className="text-[var(--text-muted)]">·</span>
                                  <span className="font-semibold text-purple-400">+{entry.bonusPoints} bonus</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        {entry.teams.length > 0 && (
                          <div className="space-y-1 mt-1">
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
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <TabBar
              tabs={[
                { key: 'tables', label: 'Team standings' },
                { key: 'charts', label: 'Charts' },
              ]}
              active={insightsTab}
              onChange={v => setInsightsTab(v as any)}
              className="mb-4"
            />

            {insightsTab === 'tables' && (
              <TablesView
                teamScores={teamScores}
                teamCompetitions={teamCompetitions}
                ownerMap={ownerMap}
              />
            )}

            {insightsTab === 'charts' && (
              <ChartsView
                players={players}
                assignments={assignments}
                activityFeed={activityFeed}
                recentMatches={recentMatches}
              />
            )}
            </>
          )
      )}

      {tab === 'monthly' && (
        <MonthlyView groups={monthlyGroups} myUserId={myUserId} league={league} />
      )}
    </AppShell>
  )
}

function MonthlyView({ groups, myUserId, league }: { groups: MonthGroup[]; myUserId: string | null; league: any }) {
  const currentMonth = new Date().toISOString().substring(0, 7)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([currentMonth]))

  if (groups.length === 0) {
    return <EmptyState icon="📅" title="No monthly data yet" description="Monthly breakdowns appear once match results come in." />
  }

  function toggleMonth(month: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  const sortedGroups = [...groups].sort((a, b) => b.month.localeCompare(a.month))

  return (
    <div className="space-y-3">
      {sortedGroups.map(({ month, rows }) => {
        const label = new Date(month + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        const winner = rows[0]
        const last = rows[rows.length - 1]
        const isCurrent = month === currentMonth
        const isExpanded = expandedMonths.has(month)
        return (
          <div key={month} className={`rounded-xl border overflow-hidden ${isCurrent ? 'border-[var(--accent)]/40' : 'border-[var(--border)]'}`}>
            <div
              className={`w-full px-3 py-2.5 min-h-11 border-b flex items-center justify-between gap-2 ${isCurrent ? 'bg-[var(--accent)]/8 border-[var(--accent)]/30' : 'bg-[var(--bg-card)] border-[var(--border)]'}`}
            >
              <button
                onClick={() => toggleMonth(month)}
                className="flex-1 flex items-center gap-2 min-w-0 text-left"
              >
                <svg
                  width="10" height="10" viewBox="0 0 10 10"
                  className={`shrink-0 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                >
                  <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-semibold text-sm text-[var(--text-primary)] truncate">{label}</span>
                {isCurrent && (
                  <span className="text-[9px] font-bold text-[var(--accent)] bg-[var(--accent)]/15 px-1.5 py-0.5 rounded-full shrink-0">Current</span>
                )}
              </button>
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] shrink-0">
                {winner && <span className="text-amber-400 font-medium hidden sm:inline">🥇 {winner.player_name}</span>}
                {last && last.player_id !== winner?.player_id && (
                  <span className="text-red-400 font-medium hidden sm:inline">🪣 {last.player_name}</span>
                )}
                <button
                  onClick={() => shareMonthlyTableToWhatsApp({
                    leagueName: league?.name ?? 'Sweepstake',
                    month,
                    rows,
                    publicUrl: league?.public_readonly ? `${window.location.origin}/watch/${league.id}/standings` : undefined,
                  })}
                  aria-label={`Share ${label} table to WhatsApp`}
                  title="Share to WhatsApp"
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12.04 0C5.446 0 .103 5.343.103 11.938c0 2.105.55 4.163 1.596 5.976L0 24l6.246-1.638a11.9 11.9 0 005.79 1.474h.005c6.593 0 11.937-5.344 11.937-11.938C23.978 5.343 18.635 0 12.04 0zm0 21.845h-.005a9.9 9.9 0 01-5.045-1.382l-.362-.215-3.744.982.999-3.65-.235-.374a9.9 9.9 0 01-1.517-5.278c0-5.462 4.44-9.9 9.906-9.9 2.647 0 5.132 1.03 7.004 2.903a9.85 9.85 0 012.898 6.998c0 5.462-4.44 9.9-9.899 9.9z" />
                  </svg>
                </button>
              </div>
            </div>
            {isExpanded && rows.map((row, idx) => {
              const isMe = row.player_id === myUserId
              return (
                <div
                  key={row.player_id}
                  className="flex items-center gap-2.5 px-3 py-2.5 border-b border-l-2 border-[var(--border)] last:border-b-0 min-h-[44px]"
                  style={{ background: `${row.player_color}08`, borderLeftColor: `${row.player_color}${isMe ? '' : '80'}` }}
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
  teamScores,
  teamCompetitions,
  ownerMap,
}: {
  teamScores: any[]
  teamCompetitions: any[]
  ownerMap: Map<string, any[]>
}) {
  const teams = [...new Map(teamCompetitions.filter(tc => tc.teams).map((tc: any) => [tc.teams.id, tc.teams])).values()]
  if (teams.length === 0) {
    return <EmptyState icon="📊" title="No teams yet" description="Choose the team pool in Settings and run the draft." />
  }

  // Crest with the owner's initials badged in the corner — communicates
  // ownership without needing a dedicated table column.
  function CrestWithOwner({ team, owners }: { team: any; owners: any[] }) {
    const owner = owners[0]
    const initials = owner ? owner.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() : null
    return (
      <div className="relative shrink-0" title={owners.map((o: any) => o.name).join(', ')}>
        <TeamCrest team={team} size="xs" />
        {initials && (
          <span
            className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center text-[6px] font-black border border-[var(--bg-card)] leading-none"
            style={{ backgroundColor: owner.color, color: '#fff' }}
          >
            {initials}
          </span>
        )}
      </div>
    )
  }

  const rows = teams.map((team: any) => {
    const scores = teamScores.filter((ts: any) => ts.team_id === team.id)
    const aggGF = scores.reduce((s: number, ts: any) => s + (ts.goals_for ?? 0), 0)
    const aggGA = scores.reduce((s: number, ts: any) => s + (ts.goals_against ?? 0), 0)
    const aggW = scores.reduce((s: number, ts: any) => s + (ts.wins ?? 0), 0)
    const aggD = scores.reduce((s: number, ts: any) => s + (ts.draws ?? 0), 0)
    const aggL = scores.reduce((s: number, ts: any) => s + (ts.losses ?? 0), 0)
    const aggPts = scores.reduce((s: number, ts: any) => s + (ts.total_points ?? 0), 0)
    const aggP = scores.reduce((s: number, ts: any) => s + (ts.matches_played ?? 0), 0)
    const owners = ownerMap.get(team.id) ?? []
    return {
      team, p: aggP, w: aggW, d: aggD, l: aggL,
      gf: aggGF, ga: aggGA, gd: aggGF - aggGA, pts: aggPts,
      owners,
    }
  }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (a.team.league_position ?? 999) - (b.team.league_position ?? 999))

  const gridCols = '18px 24px 1fr 22px 22px 22px 22px 28px 32px'

  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden mb-5">
      <div className="grid items-center gap-1 px-2.5 py-1.5 bg-[var(--bg-card)] border-b border-[var(--border)]/50" style={{ gridTemplateColumns: gridCols }}>
        <span />
        <span />
        <span className="text-[9px] text-[var(--text-muted)] font-medium">Club</span>
        <span className="text-[9px] text-[var(--text-muted)] text-center">P</span>
        <span className="text-[9px] text-emerald-400 text-center">W</span>
        <span className="text-[9px] text-amber-400 text-center">D</span>
        <span className="text-[9px] text-red-400 text-center">L</span>
        <span className="text-[9px] text-[var(--text-muted)] text-center">GD</span>
        <span className="text-[9px] text-[var(--text-muted)] text-right">Pts</span>
      </div>
      {rows.map((row, idx) => {
        const gdColor = row.gd > 0 ? 'text-emerald-400' : row.gd < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'
        const primaryOwner = row.owners[0]
        return (
          <Link
            key={row.team.id}
            href={`/teams/${row.team.id}`}
            className="grid items-center gap-1 px-2.5 py-2 border-b border-[var(--border)]/40 last:border-0 bg-[var(--bg-card)] min-h-[44px] hover:bg-[var(--bg-card-hover)] transition-colors"
            style={{ gridTemplateColumns: gridCols, borderLeft: primaryOwner ? `3px solid ${primaryOwner.color}` : '3px solid transparent' }}
          >
            <span className="text-[10px] text-[var(--text-muted)] text-center tabular-nums">{idx + 1}</span>
            <CrestWithOwner team={row.team} owners={row.owners} />
            <span className="text-[11px] text-[var(--text-primary)] truncate leading-tight min-w-0">{row.team.short_name || row.team.name}</span>
            <span className="text-[10px] text-[var(--text-secondary)] text-center tabular-nums">{row.p}</span>
            <span className="text-[10px] text-emerald-400 text-center tabular-nums">{row.w}</span>
            <span className="text-[10px] text-amber-400 text-center tabular-nums">{row.d}</span>
            <span className="text-[10px] text-red-400 text-center tabular-nums">{row.l}</span>
            <span className={`text-[10px] text-center font-medium tabular-nums ${gdColor}`}>{row.gd > 0 ? `+${row.gd}` : row.gd}</span>
            <span className="text-[11px] font-bold text-[var(--text-primary)] text-right tabular-nums">{row.pts}</span>
          </Link>
        )
      })}
    </div>
  )
}

// ─── Charts ───────────────────────────────────────────────────────────────────

type PlayerSeries = { player: any; values: number[] }

function LineChart({
  title,
  series,
  invertY = false,
  yLabel,
}: {
  title: string
  series: PlayerSeries[]
  invertY?: boolean
  yLabel?: string
}) {
  const PAD_L = 34, PAD_R = 14, PAD_T = 12, PAD_B = 28
  const W = 320, H = 180
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const maxX = Math.max(...series.map(s => s.values.length), 2)
  const allVals = series.flatMap(s => s.values)
  const rawMin = allVals.length ? Math.min(...allVals) : 0
  const rawMax = allVals.length ? Math.max(...allVals) : 1
  const valMin = invertY ? rawMin : Math.min(rawMin, 0)
  const valMax = invertY ? rawMax : Math.max(rawMax, 1)
  const range = valMax - valMin || 1

  function xCoord(i: number) {
    return PAD_L + (i / (maxX - 1)) * plotW
  }
  function yCoord(v: number) {
    const norm = (v - valMin) / range
    return invertY
      ? PAD_T + norm * plotH
      : PAD_T + (1 - norm) * plotH
  }

  // Y axis grid lines
  const gridCount = 4
  const gridVals = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = valMin + (range * i) / gridCount
    return invertY ? valMax - (v - valMin) : v
  })

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <p className="text-[11px] font-bold text-[var(--text-primary)]">{title}</p>
        {yLabel && <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{yLabel}</p>}
      </div>
      <div className="pb-1" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full h-full"
        >
          {/* Grid lines */}
          {gridVals.map((v, i) => {
            const y = yCoord(invertY ? valMin + (valMax - v) : v)
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--border)" strokeWidth="0.5" />
                <text x={PAD_L - 3} y={y + 3.5} textAnchor="end" fontSize="9" fill="var(--text-secondary)">
                  {invertY ? Math.round(v) : Math.round(v)}
                </text>
              </g>
            )
          })}
          {/* X axis */}
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--border)" strokeWidth="0.5" />
          {/* X tick labels (every 5th game) */}
          {Array.from({ length: maxX }, (_, i) => i).filter(i => i === 0 || (i + 1) % 5 === 0 || i === maxX - 1).map(i => (
            <text key={i} x={xCoord(i)} y={H - PAD_B + 10} textAnchor="middle" fontSize="9" fill="var(--text-secondary)">
              {i + 1}
            </text>
          ))}
          <text x={W / 2} y={H - 2} textAnchor="middle" fontSize="9" fill="var(--text-secondary)">Game</text>
          {/* Series lines — every point gets a small marker (not just the
              endpoint) so two players who finish on the same total, or
              cross paths, stay visually distinguishable rather than one
              line's endpoint hiding behind another's. */}
          {series.map(({ player, values }) => {
            if (values.length < 1) return null
            const pts = values.map((v, i) => `${xCoord(i)},${yCoord(v)}`).join(' ')
            const endX = xCoord(values.length - 1)
            const endY = yCoord(values[values.length - 1])
            const pointLabel = (v: number, i: number) =>
              `${player.name} — Game ${i + 1}: ${invertY ? `#${v}` : `${v} pt${v === 1 ? '' : 's'}`}`
            return (
              <g key={player.id}>
                <polyline points={pts} fill="none" stroke={player.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
                {values.map((v, i) => (
                  <circle key={i} cx={xCoord(i)} cy={yCoord(v)} r="1.5" fill={player.color}>
                    <title>{pointLabel(v, i)}</title>
                  </circle>
                ))}
                <circle cx={endX} cy={endY} r="3.5" fill={player.color} stroke="var(--bg-card)" strokeWidth="1.5">
                  <title>{pointLabel(values[values.length - 1], values.length - 1)}</title>
                </circle>
              </g>
            )
          })}
        </svg>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 pt-1">
        {series.map(({ player }) => (
          <div key={player.id} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: player.color }} />
            <span className="text-[9px] text-[var(--text-muted)]">{player.name.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Win/draw/loss are shape-coded as well as colour-coded — a circle, diamond
// and triangle stay distinguishable for colourblind readers even though the
// dots are too small to carry a text label.
function ResultDot({ result, color }: { result: 'W' | 'D' | 'L'; color: string }) {
  const common = { backgroundColor: color }
  if (result === 'W') {
    return <div className="w-[9px] h-[9px] rounded-full shrink-0" style={common} title="Win" />
  }
  if (result === 'D') {
    return <div className="w-[7px] h-[7px] rotate-45 shrink-0" style={common} title="Draw" />
  }
  return (
    <div
      className="w-[10px] h-[9px] shrink-0"
      style={{ ...common, clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}
      title="Loss"
    />
  )
}

function ResultDotsView({
  players,
  assignments,
  recentMatches,
}: {
  players: any[]
  assignments: any[]
  recentMatches: any[]
}) {
  // Build team → player map
  const teamPlayerMap = new Map<string, any>()
  for (const a of assignments) {
    if (!teamPlayerMap.has(a.team_id)) {
      const player = players.find(p => p.id === a.player_id)
      if (player) teamPlayerMap.set(a.team_id, player)
    }
  }

  // Build player → team ids map
  const playerTeamsMap = new Map<string, Set<string>>()
  for (const a of assignments) {
    if (!playerTeamsMap.has(a.player_id)) playerTeamsMap.set(a.player_id, new Set())
    playerTeamsMap.get(a.player_id)!.add(a.team_id)
  }

  // Compute result per game event per player (recentMatches in ASC order)
  type Dot = 'W' | 'D' | 'L'
  const playerResults = new Map<string, Dot[]>()
  for (const m of recentMatches) {
    const homePlayer = teamPlayerMap.get(m.home_team_id)
    const awayPlayer = teamPlayerMap.get(m.away_team_id)
    const isDraw = m.home_score === m.away_score
    if (homePlayer) {
      const arr = playerResults.get(homePlayer.id) ?? []
      arr.push(isDraw ? 'D' : m.home_score > m.away_score ? 'W' : 'L')
      playerResults.set(homePlayer.id, arr)
    }
    if (awayPlayer) {
      const arr = playerResults.get(awayPlayer.id) ?? []
      arr.push(isDraw ? 'D' : m.away_score > m.home_score ? 'W' : 'L')
      playerResults.set(awayPlayer.id, arr)
    }
  }

  const sortedPlayers = [...players].sort((a, b) => {
    const ra = playerResults.get(a.id) ?? []
    const rb = playerResults.get(b.id) ?? []
    const winsA = ra.filter(r => r === 'W').length
    const winsB = rb.filter(r => r === 'W').length
    return winsB - winsA
  })

  const dotColor: Record<Dot, string> = {
    W: '#10b981',
    D: '#f59e0b',
    L: '#ef4444',
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <p className="text-[11px] font-bold text-[var(--text-primary)]">Result Dots</p>
        <p className="text-[9px] text-[var(--text-muted)] mt-0.5">Each team's match results in order</p>
      </div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 320 }}>
          {sortedPlayers.map(player => {
            const dots = playerResults.get(player.id) ?? []
            if (dots.length === 0) return null
            const w = dots.filter(d => d === 'W').length
            const d = dots.filter(d => d === 'D').length
            const l = dots.filter(d => d === 'L').length
            return (
              <div key={player.id} className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]/40 last:border-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: player.color }} />
                <span className="text-[10px] font-semibold text-[var(--text-primary)] w-20 shrink-0 truncate">
                  {player.name.split(' ')[0]}
                </span>
                <div className="flex flex-wrap gap-[3px] flex-1 min-w-0 items-center">
                  {dots.map((dot, i) => (
                    <ResultDot key={i} result={dot} color={dotColor[dot]} />
                  ))}
                </div>
                <div className="flex gap-1.5 shrink-0 text-[9px] font-mono ml-2">
                  <span className="text-emerald-400">{w}W</span>
                  <span className="text-amber-400">{d}D</span>
                  <span className="text-red-400">{l}L</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ChartsView({
  players,
  assignments,
  activityFeed,
  recentMatches,
}: {
  players: any[]
  assignments: any[]
  activityFeed: any[]
  recentMatches: any[]
}) {
  if (players.length === 0) {
    return <EmptyState icon="📈" title="No data yet" description="Charts will appear once matches have been played." />
  }

  // Build cumulative points per player from activityFeed (already ASC order)
  const cumulMap = new Map<string, number[]>()
  const runningTotals = new Map<string, number>()
  for (const p of players) {
    cumulMap.set(p.id, [])
    runningTotals.set(p.id, 0)
  }

  // Group activity by game round (events close in time = same round)
  // We'll track each player's cumulative points after each activity_feed entry
  for (const ev of activityFeed) {
    const prev = runningTotals.get(ev.player_id) ?? 0
    const next = prev + (ev.points_delta ?? 0)
    runningTotals.set(ev.player_id, next)
    cumulMap.get(ev.player_id)?.push(next)
  }

  // Build position race: after each event, rank players
  // We'll reconstruct step-by-step rank per game number
  const playerOrder = players.filter(p => (cumulMap.get(p.id) ?? []).length > 0)

  // Every player doesn't necessarily have the same number of activity_feed
  // entries yet (postponements, different fixture counts per club, etc.), so
  // pad every series out to the longest one by carrying the last known value
  // forward — otherwise a line stops wherever that player's data runs out
  // instead of reaching the right edge of the chart.
  const maxGames = Math.max(...playerOrder.map(p => (cumulMap.get(p.id) ?? []).length), 1)
  function padded(vals: number[]): number[] {
    if (vals.length === 0 || vals.length >= maxGames) return vals
    const last = vals[vals.length - 1]
    return [...vals, ...Array(maxGames - vals.length).fill(last)]
  }

  // Points race series
  const pointsSeries: PlayerSeries[] = playerOrder.map(p => ({
    player: p,
    values: padded(cumulMap.get(p.id) ?? []),
  }))

  // Position race: at each game index, rank players
  const positionSeries: PlayerSeries[] = playerOrder.map(p => {
    const vals: number[] = []
    const pVals = cumulMap.get(p.id) ?? []
    for (let i = 0; i < maxGames; i++) {
      // Get each player's pts at game i (use last known value if they played fewer games)
      const snapshot = playerOrder.map(other => {
        const ov = cumulMap.get(other.id) ?? []
        return ov[i] ?? (ov[ov.length - 1] ?? 0)
      })
      const myPts = pVals[i] ?? (pVals[pVals.length - 1] ?? 0)
      const rank = snapshot.filter(v => v > myPts).length + 1
      vals.push(rank)
    }
    return { player: p, values: vals }
  })

  const hasData = pointsSeries.some(s => s.values.length > 0)

  // Short insight summary: who's leading now vs one game ago
  let insightLine: string | null = null
  if (hasData) {
    const withValues = pointsSeries.filter(s => s.values.length > 0)
    const leader = withValues.reduce((best, s) => (s.values[s.values.length - 1] > (best?.values[best.values.length - 1] ?? -1) ? s : best), withValues[0])
    const sortedByLatest = [...withValues].sort((a, b) => b.values[b.values.length - 1] - a.values[a.values.length - 1])
    const runnerUp = sortedByLatest[1]
    if (leader && runnerUp) {
      const gap = leader.values[leader.values.length - 1] - runnerUp.values[runnerUp.values.length - 1]
      insightLine = gap === 0
        ? `${leader.player.name.split(' ')[0]} and ${runnerUp.player.name.split(' ')[0]} are tied at the top`
        : `${leader.player.name.split(' ')[0]} leads by ${gap} pt${gap === 1 ? '' : 's'} over ${runnerUp.player.name.split(' ')[0]}`
    }
  }

  return (
    <div className="space-y-4">
      {hasData ? (
        <>
          {insightLine && (
            <p className="text-xs text-[var(--text-secondary)] px-1">💡 {insightLine}</p>
          )}
          <LineChart
            title="Points Race"
            series={pointsSeries}
            yLabel="Cumulative points"
          />
          <LineChart
            title="Position Race"
            series={positionSeries}
            invertY={true}
            yLabel="Position (lower = better)"
          />
        </>
      ) : (
        <EmptyState icon="📈" title="No chart data" description="Points charts will appear once games have been played and recorded." />
      )}
      <ResultDotsView
        players={players}
        assignments={assignments}
        recentMatches={recentMatches}
      />
    </div>
  )
}

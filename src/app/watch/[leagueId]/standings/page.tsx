'use client'
import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PublicShell, PublicNotAvailable } from '@/components/layout/PublicShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { TabBar } from '@/components/ui/TabBar'
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/LoadingSpinner'
import { fetchPublicLeagueData, type PublicLeagueData } from '@/lib/publicLeague'

type MonthGroup = { month: string; rows: any[] }

export default function PublicStandingsPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = use(params)
  const searchParams = useSearchParams()
  const asPlayerId = searchParams.get('as')

  const [data, setData] = useState<PublicLeagueData | null>(null)
  const [monthlyGroups, setMonthlyGroups] = useState<MonthGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'leaderboard' | 'teams' | 'monthly'>('leaderboard')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(false)
    try {
      const result = await fetchPublicLeagueData(leagueId)
      if (result.notAvailable) { setNotAvailable(true); setLoading(false); return }
      setData(result.data)

      const supabase = createClient()
      const { data: monthly } = await supabase.rpc('get_monthly_standings', { p_league_id: leagueId })
      const groups: MonthGroup[] = []
      const seen = new Set<string>()
      for (const row of (monthly ?? []) as any[]) {
        if (!seen.has(row.month)) { seen.add(row.month); groups.push({ month: row.month, rows: [] }) }
        groups.find(g => g.month === row.month)!.rows.push(row)
      }
      setMonthlyGroups(groups)

      setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  if (loading) return <PageLoader />
  if (notAvailable) return <PublicNotAvailable />
  if (error || !data) return <ErrorState onRetry={load} />

  const { league, players, playerScores, assignments, teamScores } = data

  const ownerMap = new Map<string, any[]>()
  for (const a of assignments) {
    if (a.teams && a.players) {
      const arr = ownerMap.get(a.teams.id) ?? []
      if (!arr.find((p: any) => p.id === a.players.id)) arr.push(a.players)
      ownerMap.set(a.teams.id, arr)
    }
  }

  const rows = players.map((p: any) => {
    const score = playerScores.find((s: any) => s.player_id === p.id)
    const teams = assignments.filter((a: any) => a.player_id === p.id && a.teams).map((a: any) => a.teams)
    return {
      player: p,
      totalPoints: score?.total_points ?? 0,
      wins: score?.wins ?? 0,
      draws: score?.draws ?? 0,
      losses: score?.losses ?? 0,
      played: score?.matches_played ?? 0,
      teams: teams.sort((a: any, b: any) => {
        const aPts = teamScores.filter((ts: any) => ts.team_id === a.id).reduce((s: number, ts: any) => s + (ts.total_points ?? 0), 0)
        const bPts = teamScores.filter((ts: any) => ts.team_id === b.id).reduce((s: number, ts: any) => s + (ts.total_points ?? 0), 0)
        return bPts - aPts
      }),
    }
  }).sort((a: any, b: any) => b.totalPoints - a.totalPoints)

  const teamRows = [...new Map(assignments.filter((a: any) => a.teams).map((a: any) => [a.teams.id, a.teams])).values()]
    .map((team: any) => {
      const scores = teamScores.filter((ts: any) => ts.team_id === team.id)
      const p = scores.reduce((s: number, ts: any) => s + (ts.matches_played ?? 0), 0)
      const w = scores.reduce((s: number, ts: any) => s + (ts.wins ?? 0), 0)
      const d = scores.reduce((s: number, ts: any) => s + (ts.draws ?? 0), 0)
      const l = scores.reduce((s: number, ts: any) => s + (ts.losses ?? 0), 0)
      const gf = scores.reduce((s: number, ts: any) => s + (ts.goals_for ?? 0), 0)
      const ga = scores.reduce((s: number, ts: any) => s + (ts.goals_against ?? 0), 0)
      const pts = scores.reduce((s: number, ts: any) => s + (ts.total_points ?? 0), 0)
      return { team, p, w, d, l, gd: gf - ga, pts, owners: ownerMap.get(team.id) ?? [] }
    })
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd)

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <PublicShell leagueId={leagueId} players={players} selectedPlayerId={asPlayerId}>
      <div className="mb-3">
        <h1 className="font-bold text-base text-[var(--text-primary)]">Standings</h1>
        <p className="text-[11px] text-[var(--text-muted)]">{league.season}</p>
      </div>

      <TabBar
        tabs={[{ key: 'leaderboard', label: 'Leaderboard' }, { key: 'teams', label: 'Clubs' }, { key: 'monthly', label: 'Monthly' }]}
        active={tab}
        onChange={v => setTab(v as any)}
        className="mb-4"
      />

      {tab === 'leaderboard' && (
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          {rows.map((entry: any, idx: number) => {
            const isExpanded = expanded.has(entry.player.id)
            const medals = ['🥇', '🥈', '🥉']
            return (
              <div key={entry.player.id} className="border-b border-[var(--border)] last:border-0" style={{ background: `${entry.player.color}08`, borderLeft: `3px solid ${entry.player.color}80` }}>
                <button onClick={() => toggle(entry.player.id)} className="w-full text-left flex items-center gap-2.5 px-3 py-3 min-h-[52px]">
                  <span className="w-6 text-center shrink-0">{idx < 3 ? medals[idx] : <span className="text-xs font-bold text-[var(--text-muted)]">{idx + 1}</span>}</span>
                  <Avatar name={entry.player.name} color={entry.player.color} size="sm" />
                  <span className="flex-1 min-w-0 font-semibold text-sm text-[var(--text-primary)] truncate">{entry.player.name}</span>
                  <span className="font-display text-lg font-black text-[var(--text-primary)]">{entry.totalPoints}</span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-[var(--border)]/50 pt-2 space-y-1">
                    <div className="flex items-center gap-3 text-[11px] mb-2">
                      <span className="text-emerald-400 font-semibold">{entry.wins}W</span>
                      <span className="text-amber-400 font-semibold">{entry.draws}D</span>
                      <span className="text-red-400 font-semibold">{entry.losses}L</span>
                      <span className="text-[var(--text-secondary)]">{entry.played} played</span>
                    </div>
                    {entry.teams.map((team: any) => (
                      <Link key={team.id} href={`/watch/${leagueId}/teams/${team.id}${asPlayerId ? `?as=${asPlayerId}` : ''}`} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-[var(--bg)]/60">
                        <TeamCrest team={team} size="xs" />
                        <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">{team.short_name || team.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'teams' && (
        teamRows.length === 0 ? <EmptyState icon="📊" title="No teams yet" /> : (
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="grid items-center gap-1 px-2.5 py-1.5 bg-[var(--bg-card)] border-b border-[var(--border)]/50" style={{ gridTemplateColumns: '18px 24px 1fr 22px 22px 22px 22px 28px 32px' }}>
              <span /><span />
              <span className="text-[9px] text-[var(--text-muted)] font-medium">Club</span>
              <span className="text-[9px] text-[var(--text-muted)] text-center">P</span>
              <span className="text-[9px] text-emerald-400 text-center">W</span>
              <span className="text-[9px] text-amber-400 text-center">D</span>
              <span className="text-[9px] text-red-400 text-center">L</span>
              <span className="text-[9px] text-[var(--text-muted)] text-center">GD</span>
              <span className="text-[9px] text-[var(--text-muted)] text-right">Pts</span>
            </div>
            {teamRows.map((row, idx) => {
              const gdColor = row.gd > 0 ? 'text-emerald-400' : row.gd < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'
              const primaryOwner = row.owners[0]
              return (
                <Link
                  key={row.team.id}
                  href={`/watch/${leagueId}/teams/${row.team.id}${asPlayerId ? `?as=${asPlayerId}` : ''}`}
                  className="grid items-center gap-1 px-2.5 py-2 border-b border-[var(--border)]/40 last:border-0 bg-[var(--bg-card)] min-h-[44px]"
                  style={{ gridTemplateColumns: '18px 24px 1fr 22px 22px 22px 22px 28px 32px', borderLeft: primaryOwner ? `3px solid ${primaryOwner.color}` : '3px solid transparent' }}
                >
                  <span className="text-[10px] text-[var(--text-muted)] text-center tabular-nums">{idx + 1}</span>
                  <TeamCrest team={row.team} size="xs" />
                  <span className="text-[11px] text-[var(--text-primary)] truncate min-w-0">{row.team.short_name || row.team.name}</span>
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
      )}

      {tab === 'monthly' && (
        monthlyGroups.length === 0 ? <EmptyState icon="📅" title="No monthly data yet" /> : (
          <MonthlyView groups={monthlyGroups} />
        )
      )}
    </PublicShell>
  )
}

function MonthlyView({ groups }: { groups: MonthGroup[] }) {
  const currentMonth = new Date().toISOString().substring(0, 7)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([currentMonth]))
  const sortedGroups = [...groups].sort((a, b) => b.month.localeCompare(a.month))

  function toggleMonth(month: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {sortedGroups.map(({ month, rows }) => {
        const label = new Date(month + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        const isExpanded = expandedMonths.has(month)
        const winner = rows[0]
        return (
          <div key={month} className="rounded-xl border border-[var(--border)] overflow-hidden">
            <button onClick={() => toggleMonth(month)} className="w-full px-3 py-2.5 min-h-11 bg-[var(--bg-card)] flex items-center justify-between gap-2 text-left">
              <span className="font-semibold text-sm text-[var(--text-primary)] truncate">{label}</span>
              {winner && <span className="text-[10px] text-amber-400 font-medium shrink-0">🥇 {winner.player_name}</span>}
            </button>
            {isExpanded && rows.map((row: any, idx: number) => (
              <div key={row.player_id} className="flex items-center gap-2.5 px-3 py-2.5 border-t border-[var(--border)] min-h-[44px]">
                <span className="text-[11px] font-bold w-4 text-center text-[var(--text-muted)]">{idx + 1}</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.player_color }} />
                <span className="flex-1 text-sm text-[var(--text-primary)] font-medium truncate">{row.player_name}</span>
                <span className="text-emerald-400 text-[11px]">{row.monthly_wins}W</span>
                <span className="text-amber-400 text-[11px]">{row.monthly_draws}D</span>
                <span className="text-red-400 text-[11px]">{row.monthly_losses}L</span>
                <span className="font-bold text-[var(--text-primary)] text-[11px] w-6 text-right">{row.monthly_points}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

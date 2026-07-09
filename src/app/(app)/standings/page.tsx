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
  wins: number; draws: number; losses: number; played: number
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
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [league, setLeague] = useState<any>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overall' | 'monthly'>('overall')

  const supabase = createClient()

  useEffect(() => { load() }, [])

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
      { data: players },
      { data: playerScores },
      { data: assignments },
      { data: monthly },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_scores').select('*').eq('league_id', lg.id),
      supabase.from('player_team_assignments').select('*, teams(*)').eq('league_id', lg.id),
      supabase.rpc('get_monthly_standings', { p_league_id: lg.id }),
    ])

    const draftDone = (assignments?.length ?? 0) > 0
    setHasDraft(draftDone)

    const rows: StandingEntry[] = (players ?? []).map((p: any) => {
      const score = (playerScores ?? []).find((s: any) => s.player_id === p.id)
      const teams = (assignments ?? []).filter((a: any) => a.player_id === p.id).map((a: any) => a.teams).filter(Boolean)
      return {
        player: p,
        totalPoints: score?.total_points ?? 0,
        wins: score?.wins ?? 0,
        draws: score?.draws ?? 0,
        losses: score?.losses ?? 0,
        played: score?.matches_played ?? 0,
        teams,
      }
    }).sort((a, b) => b.totalPoints - a.totalPoints)

    setStandings(rows)

    // Group monthly data by month
    const groups: MonthGroup[] = []
    const seen = new Map<string, MonthlyEntry[]>()
    for (const row of (monthly ?? []) as MonthlyEntry[]) {
      const key = row.month
      if (!seen.has(key)) { seen.set(key, []); groups.push({ month: key, rows: [] }) }
      seen.get(key)!.push(row)
      groups.find(g => g.month === key)!.rows.push(row)
    }
    setMonthlyGroups(groups)
    setLoading(false)
  }

  if (loading) return <AppShell title="Standings"><PageLoader /></AppShell>

  if (!league) {
    return (
      <AppShell title="Standings">
        <EmptyState icon="🏆" title="No league yet" description="Set up a league to see standings." />
      </AppShell>
    )
  }

  return (
    <AppShell title="Standings">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
        <Badge variant={league.status === 'active' ? 'success' : 'warning'}>
          {league.status === 'active' ? 'Active' : league.status === 'setup' ? 'Setting up' : league.status}
        </Badge>
      </div>

      <TabBar
        tabs={[{ key: 'overall', label: 'Overall' }, { key: 'monthly', label: 'Monthly' }]}
        active={tab}
        onChange={v => setTab(v as any)}
        className="mb-4"
      />

      {tab === 'overall' ? (
        standings.length === 0 ? (
          <EmptyState icon="👥" title="No players yet" description="Add players in Settings." />
        ) : (
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[28px_1fr_28px_28px_28px_36px] items-center gap-1 px-3 py-2 bg-[var(--bg-card)] border-b border-[var(--border)]">
              <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">#</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium">Player</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">W</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">D</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">L</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium text-right">Pts</span>
            </div>

            {standings.map((entry, idx) => {
              const isMe = entry.player.user_id === myUserId
              const posColor = idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-orange-500' : 'text-[var(--text-muted)]'
              const posBg = idx === 0 ? 'bg-amber-500/10' : idx === 1 ? 'bg-slate-400/10' : idx === 2 ? 'bg-orange-500/10' : ''
              return (
                <div key={entry.player.id} className={['border-b border-[var(--border)] last:border-0', isMe ? 'bg-[var(--accent)]/5' : 'bg-[var(--bg-card)]'].join(' ')}>
                  <div className="grid grid-cols-[28px_1fr_28px_28px_28px_36px] items-center gap-1 px-3 py-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${posBg} ${posColor}`}>{idx + 1}</div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={entry.player.name} color={entry.player.color} size="sm" />
                      <div className="min-w-0">
                        <span className="font-medium text-sm text-[var(--text-primary)] truncate block">
                          {entry.player.name}
                          {isMe && <span className="ml-1 text-[9px] text-[var(--accent)] font-semibold uppercase tracking-wide">You</span>}
                        </span>
                        {!hasDraft && <span className="text-[10px] text-[var(--text-muted)]">Draft pending</span>}
                      </div>
                    </div>
                    <span className="text-xs text-emerald-400 font-medium text-center">{hasDraft ? entry.wins : '—'}</span>
                    <span className="text-xs text-amber-400 font-medium text-center">{hasDraft ? entry.draws : '—'}</span>
                    <span className="text-xs text-red-400 font-medium text-center">{hasDraft ? entry.losses : '—'}</span>
                    <span className="text-sm font-bold text-[var(--text-primary)] text-right">{entry.totalPoints}</span>
                  </div>
                  {entry.teams.length > 0 && (
                    <div className="px-3 pb-2.5 flex gap-1 flex-wrap">
                      {entry.teams.map((team: any) => <TeamCrest key={team.id} team={team} size="xs" />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : (
        <MonthlyView groups={monthlyGroups} myUserId={myUserId} />
      )}
    </AppShell>
  )
}

function MonthlyView({ groups, myUserId }: { groups: MonthGroup[]; myUserId: string | null }) {
  if (groups.length === 0) {
    return <EmptyState icon="📅" title="No monthly data yet" description="Monthly breakdowns appear once match results come in." />
  }

  return (
    <div className="space-y-4">
      {groups.map(({ month, rows }) => {
        const label = new Date(month + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        const winner = rows[0]
        const last = rows[rows.length - 1]
        return (
          <div key={month} className="rounded-xl border border-[var(--border)] overflow-hidden">
            {/* Month header */}
            <div className="px-3 py-2 bg-[var(--bg-card)] border-b border-[var(--border)] flex items-center justify-between">
              <span className="font-semibold text-sm text-[var(--text-primary)]">{label}</span>
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                {winner && (
                  <span className="text-amber-400 font-medium">🥇 {winner.player_name}</span>
                )}
                {last && last.player_id !== winner?.player_id && (
                  <span className="text-red-400 font-medium">🪣 {last.player_name}</span>
                )}
              </div>
            </div>

            {/* Rows */}
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
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: row.player_color }}
                  />
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

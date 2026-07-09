'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'

export default function MyTeamsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: authData } = await supabase.auth.getUser()
    const myUserId = authData?.user?.id

    const [{ data: league }, { data: players }, { data: assignments }, { data: teamScores }, { data: teamCompData }] = await Promise.all([
      supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle(),
      supabase.from('players').select('*').eq('league_id', leagueId).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_team_assignments').select('*, teams(*), players(*)').eq('league_id', leagueId),
      supabase.from('team_scores').select('*').eq('league_id', leagueId),
      supabase.from('team_competitions').select('team_id, competition_id, competitions(id,name,short_name,competition_type)').eq('league_id', leagueId),
    ])

    // First competition per team (for badge display)
    const teamCompMap = new Map<string, any>()
    for (const row of (teamCompData ?? []) as any[]) {
      if (!teamCompMap.has(row.team_id)) {
        teamCompMap.set(row.team_id, row.competitions)
      }
    }

    const playerEntries = (players ?? []).map((player: any) => {
      const playerAssignments = (assignments ?? []).filter((a: any) => a.player_id === player.id)
      const teams = playerAssignments.map((a: any) => {
        const team = a.teams
        const score = (teamScores ?? []).find((ts: any) => ts.team_id === team?.id)
        const competition = team ? teamCompMap.get(team.id) : null
        return { team, score, competition }
      }).filter((x: any) => !!x.team)
      const total = teams.reduce((sum: number, t: any) => sum + (t.score?.total_points ?? 0), 0)
      return { player, teams, total, isMe: player.user_id === myUserId }
    }).sort((a: any, b: any) => b.total - a.total)

    setData({ league, playerEntries })
    setLoading(false)
  }

  if (loading) return <AppShell title="Teams"><PageLoader /></AppShell>

  if (!data?.league) {
    return (
      <AppShell title="Teams">
        <EmptyState icon="⚽" title="No league yet" />
      </AppShell>
    )
  }

  const { playerEntries } = data

  if (playerEntries.every((e: any) => e.teams.length === 0)) {
    return (
      <AppShell title="Teams">
        <EmptyState
          icon="🎯"
          title="Draft pending"
          description="Teams will appear here after the draft is run."
        />
      </AppShell>
    )
  }

  return (
    <AppShell title="Teams">
      <div className="space-y-3">
        {playerEntries.map(({ player, teams, total, isMe }: any) => (
          <div
            key={player.id}
            className="rounded-xl border overflow-hidden"
            style={{
              borderColor: isMe ? `${player.color}40` : 'var(--border)',
              background: isMe ? `${player.color}08` : 'var(--bg-card)',
            }}
          >
            {/* Player header */}
            <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
              <Avatar name={player.name} color={player.color} size="md" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm text-[var(--text-primary)]">
                  {player.name}
                  {isMe && (
                    <span
                      className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${player.color}25`, color: player.color }}
                    >
                      You
                    </span>
                  )}
                </span>
                <p className="text-[10px] text-[var(--text-secondary)]">{teams.length} teams</p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-bold text-base text-[var(--text-primary)]">{total}</span>
                <span className="text-[10px] text-[var(--text-secondary)] ml-1">pts</span>
              </div>
            </div>

            {/* Team list */}
            <div className="px-3 pb-3 space-y-1.5">
              {teams.map(({ team, score, competition }: any) => (
                <div
                  key={team.id}
                  className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2"
                >
                  <TeamCrest team={team} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs text-[var(--text-primary)] truncate">{team.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {competition && (
                        <Badge
                          variant={competition.competition_type === 'european' ? 'purple' : 'muted'}
                          className="text-[9px] px-1 py-0 leading-4"
                        >
                          {competition.short_name}
                        </Badge>
                      )}
                      {score && score.matches_played > 0 && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          <span className="text-emerald-400">{score.wins}W</span>{' '}
                          <span className="text-amber-400">{score.draws}D</span>{' '}
                          <span className="text-red-400">{score.losses}L</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-sm text-[var(--text-primary)]">{score?.total_points ?? 0}</div>
                    <div className="text-[9px] text-[var(--text-secondary)]">pts</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}

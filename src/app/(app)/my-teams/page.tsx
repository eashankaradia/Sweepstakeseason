'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

export default function MyTeamsPage() {
  const [data, setData] = useState<any>(null)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [powerUps, setPowerUps] = useState<any[]>([])
  const [upcomingFixtures, setUpcomingFixtures] = useState<any[]>([])
  const [activating, setActivating] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

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

    const myPlayer = (players ?? []).find((p: any) => p.user_id === myUserId)
    setMyPlayerId(myPlayer?.id ?? null)

    const teamCompMap = new Map<string, any>()
    for (const row of (teamCompData ?? []) as any[]) {
      if (!teamCompMap.has(row.team_id)) teamCompMap.set(row.team_id, row.competitions)
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

    if (myPlayer?.id) {
      const [{ data: pups }, { data: upFix }] = await Promise.all([
        supabase.from('power_up_activations')
          .select('*')
          .eq('league_id', leagueId)
          .eq('player_id', myPlayer.id),
        supabase.from('fixtures')
          .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
          .eq('league_id', leagueId)
          .eq('status', 'scheduled')
          .order('kickoff_time')
          .limit(20),
      ])
      setPowerUps(pups ?? [])
      setUpcomingFixtures((upFix ?? []) as any[])
    }

    setLoading(false)
  }

  async function activateDoubleOrNothing(teamId: string, fixtureId: string) {
    const supabase = createClient()
    const leagueId = getLeagueIdCookie()
    if (!leagueId || !myPlayerId) return
    setActivating(teamId)
    const currentMonth = new Date().toISOString().substring(0, 7)
    const { error } = await supabase.from('power_up_activations').insert({
      league_id: leagueId,
      player_id: myPlayerId,
      power_up_type: 'double_or_nothing',
      fixture_id: fixtureId,
      team_id: teamId,
      season_month: currentMonth,
      status: 'pending',
    })
    setActivating(null)
    if (!error) {
      setSuccessMsg('⚡ Double or Nothing activated!')
      setTimeout(() => setSuccessMsg(''), 3000)
      loadData()
    }
  }

  if (loading) return <AppShell title="My Teams"><PageLoader /></AppShell>

  if (!data?.league) {
    return (
      <AppShell title="My Teams">
        <EmptyState icon="⚽" title="No league yet" />
      </AppShell>
    )
  }

  const { playerEntries } = data

  if (playerEntries.every((e: any) => e.teams.length === 0)) {
    return (
      <AppShell title="My Teams">
        <EmptyState icon="🎯" title="Draft pending" description="Teams will appear here after the draft is run." />
      </AppShell>
    )
  }

  const currentMonth = new Date().toISOString().substring(0, 7)
  const usedThisMonth = powerUps.filter((p: any) => p.season_month === currentMonth && p.power_up_type === 'double_or_nothing').length
  const monthlyLimitUsed = usedThisMonth >= 1
  const usedTeamIds = new Set(powerUps.filter((p: any) => p.power_up_type === 'double_or_nothing' && p.status !== 'cancelled').map((p: any) => p.team_id))

  const teamNextFixture = new Map<string, any>()
  for (const fix of upcomingFixtures) {
    if (!teamNextFixture.has(fix.home_team_id)) teamNextFixture.set(fix.home_team_id, fix)
    if (!teamNextFixture.has(fix.away_team_id)) teamNextFixture.set(fix.away_team_id, fix)
  }

  return (
    <AppShell title="My Teams">
      {successMsg && (
        <div className="mb-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium px-3 py-2.5 rounded-xl">
          {successMsg}
        </div>
      )}

      {myPlayerId && (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">⚡ Double or Nothing</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">1 use per month · each club once per season</p>
            </div>
            <Badge variant={monthlyLimitUsed ? 'muted' : 'success'}>
              {monthlyLimitUsed ? 'Used this month' : 'Available'}
            </Badge>
          </div>
        </div>
      )}

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

            <div className="px-3 pb-3 space-y-1.5">
              {teams.map(({ team, score, competition }: any) => {
                const nextFix = teamNextFixture.get(team.id)
                const alreadyUsed = usedTeamIds.has(team.id)
                const pendingForTeam = powerUps.find((p: any) => p.team_id === team.id && p.status === 'pending')
                const canActivate = isMe && !monthlyLimitUsed && !alreadyUsed && !!nextFix && !pendingForTeam

                return (
                  <div
                    key={team.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <Link href={`/teams/${team.id}`} className="shrink-0">
                        <TeamCrest team={team} size="sm" />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link href={`/teams/${team.id}`}>
                          <p className="font-medium text-xs text-[var(--text-primary)] truncate hover:text-[var(--accent)] transition-colors">{team.name}</p>
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {competition && (
                            <Badge
                              variant={competition.competition_type === 'european' ? 'purple' : 'muted'}
                              className="text-[9px] px-1 py-0 leading-4"
                            >
                              {competition.short_name}
                            </Badge>
                          )}
                          {team.league_position && (
                            <span className="text-[9px] text-[var(--text-muted)]">#{team.league_position}</span>
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

                    {isMe && (
                      <div className="mt-2 pt-2 border-t border-[var(--border)]">
                        {pendingForTeam ? (
                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--accent)]">
                            <span>⚡</span>
                            <span className="font-medium">Double or Nothing active</span>
                            {nextFix && (
                              <span className="text-[var(--text-muted)]">
                                vs {nextFix.home_team_id === team.id ? nextFix.away_team?.name : nextFix.home_team?.name}
                              </span>
                            )}
                          </div>
                        ) : alreadyUsed ? (
                          <span className="text-[10px] text-[var(--text-muted)]">⚡ Already used this season</span>
                        ) : nextFix && canActivate ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-[var(--text-muted)]">
                              Next: {nextFix.home_team_id === team.id ? nextFix.away_team?.name : nextFix.home_team?.name}{' '}
                              · {new Date(nextFix.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                            <button
                              onClick={() => activateDoubleOrNothing(team.id, nextFix.id)}
                              disabled={activating === team.id}
                              className="text-[10px] font-bold text-[var(--accent)] border border-[var(--accent)]/40 px-2 py-0.5 rounded-full hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-40"
                            >
                              {activating === team.id ? '...' : '⚡ D-o-N'}
                            </button>
                          </div>
                        ) : nextFix && monthlyLimitUsed ? (
                          <span className="text-[10px] text-[var(--text-muted)]">Monthly power-up already used</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}

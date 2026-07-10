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
import Link from 'next/link'

export default function MyTeamsPage() {
  const [data, setData] = useState<any>(null)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [powerUps, setPowerUps] = useState<any[]>([])
  const [upcomingFixtures, setUpcomingFixtures] = useState<any[]>([])
  const [activating, setActivating] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'mine' | 'all'>('mine')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id
    setMyUserId(uid ?? null)

    const [{ data: league }, { data: players }, { data: assignments }, { data: teamScores }, { data: teamCompData }] = await Promise.all([
      supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle(),
      supabase.from('players').select('*').eq('league_id', leagueId).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_team_assignments').select('*, teams(*), players(*)').eq('league_id', leagueId),
      supabase.from('team_scores').select('*').eq('league_id', leagueId),
      supabase.from('team_competitions').select('team_id, competition_id, competitions(id,name,short_name,competition_type)').eq('league_id', leagueId),
    ])

    const myPlayer = (players ?? []).find((p: any) => p.user_id === uid)
    setMyPlayerId(myPlayer?.id ?? null)

    // Map teamId → first competition (for display)
    const teamCompMap = new Map<string, any>()
    for (const row of (teamCompData ?? []) as any[]) {
      if (!teamCompMap.has(row.team_id)) teamCompMap.set(row.team_id, row.competitions)
    }

    // Map teamId → array of all competitions (for multi-comp display)
    const teamAllComps = new Map<string, any[]>()
    for (const row of (teamCompData ?? []) as any[]) {
      if (!teamAllComps.has(row.team_id)) teamAllComps.set(row.team_id, [])
      teamAllComps.get(row.team_id)!.push(row.competitions)
    }

    const playerEntries = (players ?? []).map((player: any) => {
      const playerAssignments = (assignments ?? []).filter((a: any) => a.player_id === player.id)
      const teams = playerAssignments.map((a: any) => {
        const team = a.teams
        if (!team) return null
        // Sum scores across all competition_id rows for this team
        const scores = (teamScores ?? []).filter((ts: any) => ts.team_id === team.id)
        const score = scores.length > 0 ? {
          wins: scores.reduce((s: number, ts: any) => s + (ts.wins ?? 0), 0),
          draws: scores.reduce((s: number, ts: any) => s + (ts.draws ?? 0), 0),
          losses: scores.reduce((s: number, ts: any) => s + (ts.losses ?? 0), 0),
          goals_for: scores.reduce((s: number, ts: any) => s + (ts.goals_for ?? 0), 0),
          goals_against: scores.reduce((s: number, ts: any) => s + (ts.goals_against ?? 0), 0),
          total_points: scores.reduce((s: number, ts: any) => s + (ts.total_points ?? 0), 0),
          matches_played: scores.reduce((s: number, ts: any) => s + (ts.matches_played ?? 0), 0),
        } : null
        const competition = teamCompMap.get(team.id)
        const allComps = teamAllComps.get(team.id) ?? []
        return { team, score, competition, allComps }
      }).filter(Boolean)
      const total = teams.reduce((sum: number, t: any) => sum + (t.score?.total_points ?? 0), 0)
      return { player, teams, total, isMe: player.user_id === uid }
    }).sort((a: any, b: any) => b.total - a.total)

    setData({ league, playerEntries })

    if (myPlayer?.id) {
      const [{ data: pups }, { data: upFix }] = await Promise.all([
        supabase.from('power_up_activations').select('*').eq('league_id', leagueId).eq('player_id', myPlayer.id),
        supabase.from('fixtures')
          .select('*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)')
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

  const myEntry = playerEntries.find((e: any) => e.isMe)

  return (
    <AppShell title="My Teams">
      {successMsg && (
        <div className="mb-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium px-3 py-2.5 rounded-xl">
          {successMsg}
        </div>
      )}

      <TabBar
        tabs={[{ key: 'mine', label: 'Mine' }, { key: 'all', label: 'All Players' }]}
        active={tab}
        onChange={v => setTab(v as any)}
        className="mb-4"
      />

      {tab === 'mine' && (
        myEntry ? (
          <MineView
            entry={myEntry}
            powerUps={powerUps}
            monthlyLimitUsed={monthlyLimitUsed}
            usedTeamIds={usedTeamIds}
            teamNextFixture={teamNextFixture}
            activating={activating}
            onActivate={activateDoubleOrNothing}
          />
        ) : (
          <EmptyState icon="👤" title="Not in this league" description="You don't have a player slot in this league yet." />
        )
      )}

      {tab === 'all' && (
        <AllPlayersView playerEntries={playerEntries} myUserId={myUserId} />
      )}
    </AppShell>
  )
}

function MineView({
  entry,
  powerUps,
  monthlyLimitUsed,
  usedTeamIds,
  teamNextFixture,
  activating,
  onActivate,
}: {
  entry: any
  powerUps: any[]
  monthlyLimitUsed: boolean
  usedTeamIds: Set<string>
  teamNextFixture: Map<string, any>
  activating: string | null
  onActivate: (teamId: string, fixtureId: string) => void
}) {
  const { player, teams, total } = entry

  // Summary stats across all my teams
  const totalW = teams.reduce((s: number, t: any) => s + (t.score?.wins ?? 0), 0)
  const totalD = teams.reduce((s: number, t: any) => s + (t.score?.draws ?? 0), 0)
  const totalL = teams.reduce((s: number, t: any) => s + (t.score?.losses ?? 0), 0)
  const totalGF = teams.reduce((s: number, t: any) => s + (t.score?.goals_for ?? 0), 0)
  const totalGA = teams.reduce((s: number, t: any) => s + (t.score?.goals_against ?? 0), 0)
  const totalGD = totalGF - totalGA

  return (
    <div className="space-y-3">
      {/* My summary card */}
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: `${player.color}40`, backgroundColor: `${player.color}08` }}
      >
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={player.name} color={player.color} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base text-[var(--text-primary)]">{player.name}</p>
            <p className="text-xs text-[var(--text-secondary)]">{teams.length} teams</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-2xl text-[var(--text-primary)]">{total}</p>
            <p className="text-xs text-[var(--text-secondary)]">pts</p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            { label: 'W', value: totalW, color: 'text-emerald-400' },
            { label: 'D', value: totalD, color: 'text-amber-400' },
            { label: 'L', value: totalL, color: 'text-red-400' },
            { label: 'GD', value: totalGD >= 0 ? `+${totalGD}` : totalGD, color: totalGD > 0 ? 'text-emerald-400' : totalGD < 0 ? 'text-red-400' : 'text-[var(--text-muted)]' },
            { label: 'GF', value: totalGF, color: 'text-[var(--text-secondary)]' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-[var(--bg-card)]/60 py-2">
              <p className={`font-bold text-sm ${color}`}>{value}</p>
              <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Power-up status */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
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

      {/* Teams list */}
      <div className="space-y-2">
        {teams.map(({ team, score, competition, allComps }: any) => {
          const nextFix = teamNextFixture.get(team.id)
          const alreadyUsed = usedTeamIds.has(team.id)
          const pendingForTeam = powerUps.find((p: any) => p.team_id === team.id && p.status === 'pending')
          const canActivate = !monthlyLimitUsed && !alreadyUsed && !!nextFix && !pendingForTeam
          const gf = score?.goals_for ?? 0
          const ga = score?.goals_against ?? 0
          const gd = gf - ga
          const hasStats = score && (score.matches_played ?? 0) > 0

          return (
            <div key={team.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div className="flex items-center gap-3 px-3 pt-3 pb-2.5">
                <Link href={`/teams/${team.id}`} className="shrink-0">
                  <TeamCrest team={team} size="md" />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/teams/${team.id}`}>
                    <p className="font-semibold text-sm text-[var(--text-primary)] truncate hover:text-[var(--accent)] transition-colors">{team.name}</p>
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {allComps.filter(Boolean).map((comp: any) => (
                      <Badge
                        key={comp.id}
                        variant={comp.competition_type === 'european' ? 'purple' : comp.competition_type === 'domestic_cup' ? 'warning' : 'muted'}
                        className="text-[9px] px-1 py-0 leading-4"
                      >
                        {comp.short_name}
                      </Badge>
                    ))}
                    {team.league_position && (
                      <span className="text-[9px] text-[var(--text-muted)]">#{team.league_position} in league</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-lg text-[var(--text-primary)]">{score?.total_points ?? 0}</div>
                  <div className="text-[9px] text-[var(--text-secondary)]">pts</div>
                </div>
              </div>

              {hasStats && (
                <div className="grid grid-cols-5 gap-1 px-3 pb-2.5 text-center">
                  {[
                    { label: 'W', value: score.wins, color: 'text-emerald-400' },
                    { label: 'D', value: score.draws, color: 'text-amber-400' },
                    { label: 'L', value: score.losses, color: 'text-red-400' },
                    { label: 'GD', value: gd >= 0 ? `+${gd}` : gd, color: gd > 0 ? 'text-emerald-400' : gd < 0 ? 'text-red-400' : 'text-[var(--text-muted)]' },
                    { label: 'GF', value: gf, color: 'text-[var(--text-secondary)]' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-md bg-[var(--bg)] py-1.5">
                      <p className={`font-semibold text-xs ${color}`}>{value}</p>
                      <p className="text-[9px] text-[var(--text-muted)]">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-[var(--border)] px-3 py-2">
                {pendingForTeam ? (
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--accent)]">
                    <span>⚡</span>
                    <span className="font-medium">Double or Nothing active</span>
                    {nextFix && (
                      <span className="text-[var(--text-muted)]">
                        · vs {nextFix.home_team_id === team.id ? nextFix.away_team?.name : nextFix.home_team?.name}
                      </span>
                    )}
                  </div>
                ) : alreadyUsed ? (
                  <span className="text-[10px] text-[var(--text-muted)]">⚡ Power-up already used this season</span>
                ) : nextFix && canActivate ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Next: {nextFix.home_team_id === team.id ? nextFix.away_team?.name : nextFix.home_team?.name}
                      {' · '}
                      {new Date(nextFix.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                    <button
                      onClick={() => onActivate(team.id, nextFix.id)}
                      disabled={activating === team.id}
                      className="text-[10px] font-bold text-[var(--accent)] border border-[var(--accent)]/40 px-2.5 py-1 rounded-full hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-40"
                    >
                      {activating === team.id ? '...' : '⚡ D-o-N'}
                    </button>
                  </div>
                ) : monthlyLimitUsed && nextFix ? (
                  <span className="text-[10px] text-[var(--text-muted)]">Monthly power-up already used</span>
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]">No upcoming fixtures</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Wildcard explanation */}
      <WildcardExplainer />
    </div>
  )
}

function WildcardExplainer() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🃏</span>
          <span className="font-semibold text-sm text-[var(--text-primary)]">How power-ups work</span>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-3 py-3 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">⚡</span>
              <p className="font-semibold text-sm text-[var(--text-primary)]">Double or Nothing</p>
              <Badge variant="success" className="text-[9px] ml-auto">1× per month</Badge>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Pick a specific upcoming match for one of your clubs. If they <span className="text-emerald-400 font-medium">win</span>, you score double points for that game. If they <span className="text-red-400 font-medium">lose</span>, you score zero. Draws are unaffected.
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              Each club can only be used once per season. You get one activation per calendar month.
            </p>
          </div>

          <div className="border-t border-[var(--border)]/50 pt-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔄</span>
              <p className="font-semibold text-sm text-[var(--text-primary)]">Reverse</p>
              <Badge variant="purple" className="text-[9px] ml-auto">1× per season</Badge>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              At the end of any month, flip your single worst result. A <span className="text-red-400 font-medium">loss</span> becomes a <span className="text-emerald-400 font-medium">win</span> — the points swing works both ways.
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              One use for the entire season. Choose your moment wisely.
            </p>
          </div>

          <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)]/50 px-2.5 py-2">
            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
              💡 <span className="text-[var(--text-secondary)]">Tip:</span> Save Reverse for a month where one bad result cost you heavily. D-o-N is best used when your team has a favourable fixture at home against a weaker side.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function AllPlayersView({ playerEntries, myUserId }: { playerEntries: any[]; myUserId: string | null }) {
  return (
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

          <div className="px-3 pb-3 space-y-1">
            {teams.map(({ team, score, competition }: any) => {
              const gf = score?.goals_for ?? 0
              const ga = score?.goals_against ?? 0
              const gd = gf - ga
              return (
                <div key={team.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2">
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
                            variant={competition.competition_type === 'european' ? 'purple' : competition.competition_type === 'domestic_cup' ? 'warning' : 'muted'}
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
                            {' · '}
                            <span className={gd >= 0 ? 'text-emerald-400' : 'text-red-400'}>{gd >= 0 ? `+${gd}` : gd}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-sm text-[var(--text-primary)]">{score?.total_points ?? 0}</div>
                      <div className="text-[9px] text-[var(--text-secondary)]">pts</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

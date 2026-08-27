'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { TabBar } from '@/components/ui/TabBar'
import { PageLoader, EmptyState, ErrorState } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

function formatMonth(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function posOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

function formatCountdown(kickoff: string): string {
  const diff = new Date(kickoff).getTime() - Date.now()
  if (diff <= 0) return 'Starting soon'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function MyTeamsPage() {
  const [data, setData] = useState<any>(null)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [powerUps, setPowerUps] = useState<any[]>([])
  const [upcomingFixtures, setUpcomingFixtures] = useState<any[]>([])
  const [activating, setActivating] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<'mine' | 'all' | 'calendar'>('mine')
  const [donTeamId, setDonTeamId] = useState<string | null>(null)
  const [donMonth, setDonMonth] = useState<string>('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(false)
    const supabase = createClient()
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    try {

    const { data: authData } = await supabase.auth.getUser()
    const uid = authData?.user?.id
    setMyUserId(uid ?? null)

    const [{ data: league }, { data: players }, { data: assignments }, { data: teamScores }] = await Promise.all([
      supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle(),
      supabase.from('players').select('*').eq('league_id', leagueId).order('position', { ascending: true, nullsFirst: false }),
      supabase.from('player_team_assignments').select('*, teams(*), players(*)').eq('league_id', leagueId),
      supabase.from('team_scores').select('*').eq('league_id', leagueId),
    ])

    const myPlayer = (players ?? []).find((p: any) => p.user_id === uid)
    setMyPlayerId(myPlayer?.id ?? null)

    const playerEntries = (players ?? []).map((player: any) => {
      const playerAssignments = (assignments ?? []).filter((a: any) => a.player_id === player.id)
      const teams = playerAssignments.map((a: any) => {
        const team = a.teams
        if (!team) return null
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
        return { team, score }
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
          .limit(300),
      ])
      setPowerUps(pups ?? [])
      setUpcomingFixtures((upFix ?? []) as any[])
    }

    setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function cancelDoubleOrNothing(teamId: string, month: string) {
    const supabase = createClient()
    const leagueId = getLeagueIdCookie()
    if (!leagueId || !myPlayerId) return
    setActivating(teamId)
    await supabase
      .from('power_up_activations')
      .delete()
      .eq('league_id', leagueId)
      .eq('player_id', myPlayerId)
      .eq('team_id', teamId)
      .eq('season_month', month)
      .eq('status', 'pending')
    vibrate(5)
    setActivating(null)
    setSuccessMsg('D-o-N cancelled.')
    setTimeout(() => setSuccessMsg(''), 3000)
    loadData()
  }

  async function activateDoubleOrNothing(teamId: string, fixtureIds: string[], month: string) {
    const supabase = createClient()
    const leagueId = getLeagueIdCookie()
    if (!leagueId || !myPlayerId || fixtureIds.length === 0) return
    setActivating(teamId)
    const rows = fixtureIds.map(fid => ({
      league_id: leagueId,
      player_id: myPlayerId,
      power_up_type: 'double_or_nothing',
      fixture_id: fid,
      team_id: teamId,
      season_month: month,
      status: 'pending',
    }))
    const { error } = await supabase.from('power_up_activations').insert(rows)
    setActivating(null)
    if (!error) {
      vibrate([10, 50, 10])
      setSuccessMsg(`⚡ Double or Nothing locked in for ${formatMonth(month)}! ${fixtureIds.length} game${fixtureIds.length !== 1 ? 's' : ''} covered.`)
      setTimeout(() => setSuccessMsg(''), 4000)
      setDonTeamId(null)
      loadData()
    } else {
      setErrorMsg('Could not activate — check constraints.')
      setTimeout(() => setErrorMsg(''), 4000)
    }
  }

  async function activateReverse(targetPlayerId: string, teamId: string, fixtureId: string, month: string) {
    const supabase = createClient()
    const leagueId = getLeagueIdCookie()
    if (!leagueId || !myPlayerId) return
    setActivating(`reverse-${fixtureId}`)
    const { error } = await supabase.from('power_up_activations').insert({
      league_id: leagueId,
      player_id: myPlayerId,
      power_up_type: 'reverse',
      fixture_id: fixtureId,
      team_id: teamId,
      target_player_id: targetPlayerId,
      season_month: month,
      status: 'pending',
    })
    setActivating(null)
    if (!error) {
      vibrate([20, 40, 20])
      setSuccessMsg('🔄 Reverse activated! Ownership swaps for that match.')
      setTimeout(() => setSuccessMsg(''), 4000)
      loadData()
    } else {
      setErrorMsg(error.code === '23505' ? 'You have already targeted this player this season.' : 'Could not activate Reverse.')
      setTimeout(() => setErrorMsg(''), 4000)
    }
  }

  if (loading) return <AppShell title="My Teams"><PageLoader /></AppShell>

  if (error) return <AppShell title="My Teams"><ErrorState onRetry={loadData} /></AppShell>

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

  const usedMonths = new Set(
    powerUps
      .filter((p: any) => p.power_up_type === 'double_or_nothing' && p.status !== 'cancelled')
      .map((p: any) => p.season_month)
  )
  const usedTeamIds = new Set(
    powerUps
      .filter((p: any) => p.power_up_type === 'double_or_nothing' && p.status !== 'cancelled')
      .map((p: any) => p.team_id)
  )
  const reversesUsed = powerUps.filter((p: any) => p.power_up_type === 'reverse' && p.status !== 'cancelled')
  const reversedTargetIds = new Set(reversesUsed.map((p: any) => p.target_player_id).filter(Boolean))

  const myEntry = playerEntries.find((e: any) => e.isMe)
  const myPosition = myEntry ? playerEntries.indexOf(myEntry) + 1 : null
  const myTeamIds = new Set<string>((myEntry?.teams ?? []).map((t: any) => t.team.id))

  return (
    <AppShell title="My Teams">
      {successMsg && (
        <div className="mb-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium px-3 py-2.5 rounded-xl">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium px-3 py-2.5 rounded-xl">
          {errorMsg}
        </div>
      )}

      <TabBar
        tabs={[{ key: 'mine', label: 'Mine' }, { key: 'all', label: 'All Players' }, { key: 'calendar', label: 'Calendar' }]}
        active={tab}
        onChange={v => setTab(v as any)}
        className="mb-4"
      />

      {tab === 'mine' && (
        myEntry ? (
          <MineView
            entry={myEntry}
            position={myPosition}
            totalPlayers={playerEntries.length}
            powerUps={powerUps}
            usedMonths={usedMonths}
            usedTeamIds={usedTeamIds}
            reversedTargetIds={reversedTargetIds}
            upcomingFixtures={upcomingFixtures}
            myTeamIds={myTeamIds}
            activating={activating}
            donTeamId={donTeamId}
            setDonTeamId={setDonTeamId}
            donMonth={donMonth}
            setDonMonth={setDonMonth}
            onActivate={activateDoubleOrNothing}
            onCancel={cancelDoubleOrNothing}
            onActivateReverse={activateReverse}
            allPlayerEntries={playerEntries}
          />
        ) : (
          <EmptyState icon="👤" title="Not in this league" description="You don't have a player slot in this league yet." />
        )
      )}

      {tab === 'all' && (
        <AllPlayersView playerEntries={playerEntries} myUserId={myUserId} />
      )}

      {tab === 'calendar' && (
        <MyTeamsCalendarView
          upcomingFixtures={upcomingFixtures}
          myTeamIds={myTeamIds}
          powerUps={powerUps}
          usedMonths={usedMonths}
        />
      )}
    </AppShell>
  )
}

function MineView({
  entry,
  position,
  totalPlayers,
  powerUps,
  usedMonths,
  usedTeamIds,
  reversedTargetIds,
  upcomingFixtures,
  myTeamIds,
  activating,
  donTeamId,
  setDonTeamId,
  donMonth,
  setDonMonth,
  onActivate,
  onCancel,
  onActivateReverse,
  allPlayerEntries,
}: {
  entry: any
  position: number | null
  totalPlayers: number
  powerUps: any[]
  usedMonths: Set<string>
  usedTeamIds: Set<string>
  reversedTargetIds: Set<string>
  upcomingFixtures: any[]
  myTeamIds: Set<string>
  activating: string | null
  donTeamId: string | null
  setDonTeamId: (id: string | null) => void
  donMonth: string
  setDonMonth: (m: string) => void
  onActivate: (teamId: string, fixtureIds: string[], month: string) => void
  onCancel: (teamId: string, month: string) => void
  onActivateReverse: (targetPlayerId: string, teamId: string, fixtureId: string, month: string) => void
  allPlayerEntries: any[]
}) {
  const { player, teams, total } = entry
  const medals = ['🥇', '🥈', '🥉']

  const totalW = teams.reduce((s: number, t: any) => s + (t.score?.wins ?? 0), 0)
  const totalD = teams.reduce((s: number, t: any) => s + (t.score?.draws ?? 0), 0)
  const totalL = teams.reduce((s: number, t: any) => s + (t.score?.losses ?? 0), 0)
  const totalGF = teams.reduce((s: number, t: any) => s + (t.score?.goals_for ?? 0), 0)
  const totalGA = teams.reduce((s: number, t: any) => s + (t.score?.goals_against ?? 0), 0)
  const totalGD = totalGF - totalGA

  const [statsExpanded, setStatsExpanded] = useState(false)

  const now = new Date()
  const availableMonths = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return d.toISOString().substring(0, 7)
  })

  const currentMonth = now.toISOString().substring(0, 7)
  const donAvailableThisMonth = !usedMonths.has(currentMonth)

  // Next upcoming fixture involving any of my teams
  const myNextFixture = upcomingFixtures.find(f =>
    myTeamIds.has(f.home_team_id) || myTeamIds.has(f.away_team_id)
  )

  function getTeamFixturesInMonth(teamId: string, month: string) {
    return upcomingFixtures.filter(f => {
      const fixMonth = (f.kickoff_time as string).substring(0, 7)
      return fixMonth === month && (f.home_team_id === teamId || f.away_team_id === teamId)
    })
  }

  function openDon(teamId: string) {
    setDonTeamId(teamId)
    const firstMonth = availableMonths.find(m => !usedMonths.has(m) && getTeamFixturesInMonth(teamId, m).length > 0)
    setDonMonth(firstMonth ?? availableMonths[0])
  }

  return (
    <div className="space-y-3">
      {/* Control Centre panel */}
      <ControlCentre
        player={player}
        position={position}
        totalPlayers={totalPlayers}
        nextFixture={myNextFixture}
        myTeamIds={myTeamIds}
        donAvailableThisMonth={donAvailableThisMonth}
        reversedTargetIds={reversedTargetIds}
        total={total}
        medals={medals}
      />

      {/* Aggregate stats — collapsible */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px]"
          onClick={() => setStatsExpanded(v => !v)}
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Season stats</span>
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-200 ${statsExpanded ? '' : '-rotate-90'}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {statsExpanded && (
          <div className="grid grid-cols-5 gap-2 px-3 pb-3">
            {[
              { label: 'W', value: totalW, color: 'text-emerald-400' },
              { label: 'D', value: totalD, color: 'text-amber-400' },
              { label: 'L', value: totalL, color: 'text-red-400' },
              { label: 'GD', value: totalGD >= 0 ? `+${totalGD}` : totalGD, color: totalGD > 0 ? 'text-emerald-400' : totalGD < 0 ? 'text-red-400' : 'text-[var(--text-muted)]' },
              { label: 'GF', value: totalGF, color: 'text-[var(--text-secondary)]' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl bg-[var(--bg)]/70 py-2 text-center">
                <p className={`font-bold text-sm ${color}`}>{value}</p>
                <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Power-up tiles */}
      <PowerUpTiles
        usedMonths={usedMonths}
        powerUps={powerUps}
        activating={activating}
        reversedTargetIds={reversedTargetIds}
        upcomingFixtures={upcomingFixtures}
        myTeamIds={myTeamIds}
        myPlayerId={entry.player.id}
        allPlayerEntries={allPlayerEntries}
        onActivateReverse={onActivateReverse}
      />

      {/* Teams list */}
      <div className="space-y-2">
        {teams.map(({ team, score }: any) => {
          const alreadyUsed = usedTeamIds.has(team.id)
          const pendingForTeam = powerUps.filter((p: any) => p.team_id === team.id && p.power_up_type === 'double_or_nothing' && p.status === 'pending')
          const canActivate = !alreadyUsed && !pendingForTeam.length
          const gf = score?.goals_for ?? 0
          const ga = score?.goals_against ?? 0
          const gd = gf - ga
          const hasStats = score && (score.matches_played ?? 0) > 0
          const isOpen = donTeamId === team.id

          const monthFixturesByMonth = new Map<string, any[]>(
            isOpen ? availableMonths.map(m => [m, getTeamFixturesInMonth(team.id, m)]) : []
          )
          const teamNextFixture = upcomingFixtures.find(f => f.home_team_id === team.id || f.away_team_id === team.id)

          return (
            <TeamCard
              key={team.id}
              team={team}
              score={score}
              gf={gf}
              ga={ga}
              gd={gd}
              hasStats={hasStats}
              pendingForTeam={pendingForTeam}
              alreadyUsed={alreadyUsed}
              canActivate={canActivate}
              isOpen={isOpen}
              donMonth={donMonth}
              setDonMonth={setDonMonth}
              monthFixturesByMonth={monthFixturesByMonth}
              availableMonths={availableMonths}
              usedMonths={usedMonths}
              activating={activating}
              onActivate={onActivate}
              onCancel={onCancel}
              openDon={openDon}
              closeDon={() => setDonTeamId(null)}
              nextFixture={teamNextFixture}
            />
          )
        })}
      </div>
    </div>
  )
}

function ControlCentre({
  player,
  position,
  totalPlayers,
  nextFixture,
  myTeamIds,
  donAvailableThisMonth,
  reversedTargetIds,
  total,
  medals,
}: {
  player: any
  position: number | null
  totalPlayers: number
  nextFixture: any
  myTeamIds: Set<string>
  donAvailableThisMonth: boolean
  reversedTargetIds: Set<string>
  total: number
  medals: string[]
}) {
  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{ borderColor: `${player.color}40`, backgroundColor: `${player.color}08` }}
    >
      {/* Player header */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar name={player.name} color={player.color} size="lg" />
          {position != null && position <= 3 && (
            <span className="absolute -top-1 -right-1 text-base leading-none">{medals[position - 1]}</span>
          )}
          {position != null && position > 3 && (
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-[var(--bg)]"
              style={{ backgroundColor: player.color, color: '#fff' }}
            >
              {position}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base text-[var(--text-primary)]">{player.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {position != null && (
              <span className="text-xs text-[var(--text-secondary)]">
                {position}{posOrdinal(position)} of {totalPlayers}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-black text-3xl" style={{ color: player.color }}>{total}</p>
          <p className="text-xs text-[var(--text-secondary)] -mt-0.5">points</p>
        </div>
      </div>

      {/* Next fixture deadline */}
      {nextFixture && (() => {
        const isHome = myTeamIds.has(nextFixture.home_team_id)
        const myTeam = isHome ? nextFixture.home_team : nextFixture.away_team
        const opp = isHome ? nextFixture.away_team : nextFixture.home_team
        const kickoff = new Date(nextFixture.kickoff_time)
        return (
          <div className="rounded-xl bg-[var(--bg-card)]/70 border border-[var(--border)] px-3 py-2.5 flex items-center gap-3">
            <div className="shrink-0">
              <TeamCrest team={myTeam} size="sm" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Next deadline</p>
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {isHome ? 'vs' : '@'} {opp?.short_name || opp?.name}
              </p>
              <p className="text-[10px] text-[var(--text-secondary)]">
                {kickoff.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-bold text-[var(--accent)]">{formatCountdown(nextFixture.kickoff_time)}</p>
              <p className="text-[9px] text-[var(--text-muted)]">to kickoff</p>
            </div>
          </div>
        )
      })()}

      {/* Power-up availability chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[10px] font-semibold ${donAvailableThisMonth ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]'}`}>
          <span>⚡</span>
          <span>D-o-N {donAvailableThisMonth ? 'available' : 'used this month'}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-400 text-[10px] font-semibold">
          <span>🔄</span>
          <span>Reverse · {reversedTargetIds.size} used</span>
        </div>
      </div>
    </div>
  )
}

function TeamCard({
  team, score, gf, ga, gd, hasStats, pendingForTeam,
  alreadyUsed, canActivate, isOpen, donMonth, setDonMonth, monthFixturesByMonth,
  availableMonths, usedMonths, activating, onActivate, onCancel, openDon, closeDon,
  nextFixture,
}: any) {
  const [statsOpen, setStatsOpen] = useState(false)
  const donActiveForFixture = nextFixture && pendingForTeam.some((p: any) => p.fixture_id === nextFixture.id)

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="flex items-center gap-3 px-3 pt-3 pb-2.5">
        <Link href={`/teams/${team.id}`} className="shrink-0">
          <TeamCrest team={team} size="md" />
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/teams/${team.id}`}>
            <p className="font-semibold text-sm text-[var(--text-primary)] truncate hover:text-[var(--accent)] transition-colors">{team.name}</p>
          </Link>
          {team.league_position && (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[9px] text-[var(--text-muted)]">#{team.league_position}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="font-bold text-xl text-[var(--text-primary)]">{score?.total_points ?? 0}</div>
            <div className="text-[9px] text-[var(--text-secondary)]">pts</div>
          </div>
          {hasStats && (
            <button
              onClick={() => setStatsOpen(v => !v)}
              aria-label={statsOpen ? 'Hide season stats' : 'Show season stats'}
              title={statsOpen ? 'Hide season stats' : 'Show season stats'}
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg hover:bg-[var(--bg)] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-200 ${statsOpen ? '' : '-rotate-90'}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Next fixture — the match consequence for this club, shown before season stats */}
      {nextFixture && (() => {
        const isHome = nextFixture.home_team_id === team.id
        const opp = isHome ? nextFixture.away_team : nextFixture.home_team
        const winPts = donActiveForFixture ? 6 : 3
        return (
          <Link href={`/fixtures/${nextFixture.id}`} className="block border-t border-[var(--border)] px-3 py-2.5 hover:bg-[var(--bg-card-hover)] transition-colors">
            <div className="flex items-center gap-2">
              <TeamCrest team={opp} size="xs" />
              <span className="text-xs text-[var(--text-primary)] flex-1 truncate">
                {isHome ? 'vs' : '@'} {opp?.short_name || opp?.name}
                <span className="text-[var(--text-muted)]"> · {formatCountdown(nextFixture.kickoff_time)}</span>
              </span>
              <span className={`text-[10px] font-bold shrink-0 ${donActiveForFixture ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                {donActiveForFixture && '⚡ '}Win: +{winPts}
              </span>
            </div>
          </Link>
        )
      })()}

      {hasStats && statsOpen && (
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

      {/* D-o-N footer */}
      <div className="border-t border-[var(--border)]">
        {pendingForTeam.length > 0 ? (
          <div className="px-3 py-2 space-y-1.5">
            {[...new Set(pendingForTeam.map((p: any) => p.season_month))].map((month: any) => (
              <div key={month} className="flex items-center gap-2">
                <span>⚡</span>
                <span className="text-[10px] font-semibold text-[var(--accent)] flex-1">D-o-N active · {formatMonth(month)}</span>
                <button
                  onClick={() => onCancel(team.id, month)}
                  disabled={activating === team.id}
                  className="text-[9px] text-red-400 border border-red-400/30 px-2 py-0.5 rounded-full hover:bg-red-400/10 transition-colors disabled:opacity-40 min-h-[28px]"
                >
                  {activating === team.id ? '…' : 'Cancel'}
                </button>
              </div>
            ))}
          </div>
        ) : alreadyUsed ? (
          <div className="px-3 py-2">
            <span className="text-[10px] text-[var(--text-muted)]">⚡ D-o-N used this season for this club</span>
          </div>
        ) : isOpen ? (
          <DonMatrix
            team={team}
            availableMonths={availableMonths}
            usedMonths={usedMonths}
            donMonth={donMonth}
            setDonMonth={setDonMonth}
            monthFixturesByMonth={monthFixturesByMonth}
            activating={activating}
            onConfirm={() => onActivate(team.id, (monthFixturesByMonth.get(donMonth) ?? []).map((f: any) => f.id), donMonth)}
            onCancel={closeDon}
          />
        ) : canActivate ? (
          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-[var(--text-muted)]">⚡ Double or Nothing available</span>
            <button
              onClick={() => openDon(team.id)}
              className="text-[10px] font-bold text-[var(--accent)] border border-[var(--accent)]/40 px-2.5 py-1 rounded-full hover:bg-[var(--accent)]/10 transition-colors min-h-[30px]"
            >
              Activate
            </button>
          </div>
        ) : (
          <div className="px-3 py-2">
            <span className="text-[10px] text-[var(--text-muted)]">No upcoming fixtures</span>
          </div>
        )}
      </div>
    </div>
  )
}

function DonMatrix({
  team, availableMonths, usedMonths, donMonth, setDonMonth,
  monthFixturesByMonth, activating, onConfirm, onCancel,
}: {
  team: any
  availableMonths: string[]
  usedMonths: Set<string>
  donMonth: string
  setDonMonth: (m: string) => void
  monthFixturesByMonth: Map<string, any[]>
  activating: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const selectedFixtures = monthFixturesByMonth.get(donMonth) ?? []
  return (
    <div className="bg-[var(--accent)]/5 border-t border-[var(--accent)]/20 px-3 py-3 space-y-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">⚡</span>
        <p className="text-xs font-bold text-[var(--accent)]">Double or Nothing — pick a month</p>
      </div>

      {/* Matrix: one column per available month, fixtures shown as logos only */}
      <div className="grid grid-cols-4 gap-1.5">
        {availableMonths.map(m => {
          const alreadyUsed = usedMonths.has(m)
          const isSelected = donMonth === m
          const label = new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short' })
          const fixtures = monthFixturesByMonth.get(m) ?? []
          return (
            <button
              key={m}
              onClick={() => !alreadyUsed && fixtures.length > 0 && setDonMonth(m)}
              disabled={alreadyUsed || fixtures.length === 0}
              className={`rounded-lg border p-1.5 flex flex-col items-center gap-1 min-h-[76px] transition-all ${
                alreadyUsed || fixtures.length === 0
                  ? 'opacity-30 cursor-not-allowed bg-[var(--bg)] border-[var(--border)]'
                  : isSelected
                    ? 'bg-[var(--accent)]/15 border-[var(--accent)]'
                    : 'bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--accent)]/50'
              }`}
            >
              <span className={`text-[10px] font-bold ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                {label}{alreadyUsed && ' ✓'}
              </span>
              <div className="flex flex-wrap items-center justify-center gap-0.5">
                {fixtures.length > 0 ? fixtures.map((f: any) => {
                  const opp = f.home_team_id === team.id ? f.away_team : f.home_team
                  return <TeamCrest key={f.id} team={opp} size="xs" />
                }) : (
                  <span className="text-[8px] text-[var(--text-muted)]">—</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {selectedFixtures.length > 0 && (
        <p className="text-[10px] text-[var(--text-muted)]">
          {selectedFixtures.length} game{selectedFixtures.length !== 1 ? 's' : ''} covered in {formatMonth(donMonth)}. You can cancel anytime before a covered match kicks off — once a match starts, that result is locked in for good.
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={activating === team.id || selectedFixtures.length === 0}
          className="flex-1 text-xs font-bold bg-[var(--accent)] text-white py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 min-h-[44px]"
        >
          {activating === team.id ? 'Locking in…' : `⚡ Lock in ${formatMonth(donMonth)}`}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2.5 text-xs text-[var(--text-secondary)] rounded-xl hover:bg-[var(--bg)] transition-colors min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function PowerUpTiles({
  usedMonths,
  powerUps,
  activating,
  reversedTargetIds,
  upcomingFixtures,
  myTeamIds,
  myPlayerId,
  allPlayerEntries,
  onActivateReverse,
}: {
  usedMonths: Set<string>
  powerUps: any[]
  activating: string | null
  reversedTargetIds: Set<string>
  upcomingFixtures: any[]
  myTeamIds: Set<string>
  myPlayerId: string
  allPlayerEntries: any[]
  onActivateReverse: (targetPlayerId: string, teamId: string, fixtureId: string, month: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reverseStep, setReverseStep] = useState<'pick-opponent' | 'pick-fixture'>('pick-opponent')
  const [reverseTarget, setReverseTarget] = useState<any>(null)
  const [reverseFixtureId, setReverseFixtureId] = useState<string | null>(null)

  // team_id -> owning player entry, so the fixture picker can label exactly
  // whose club is whose (mine, the target's, or a third player's/unowned).
  const teamOwnerMap = new Map<string, any>()
  for (const e of allPlayerEntries) {
    for (const t of e.teams) teamOwnerMap.set(t.team.id, e)
  }

  const toggle = (id: string) => {
    setExpanded(prev => (prev === id ? null : id))
    setReverseStep('pick-opponent')
    setReverseTarget(null)
    setReverseFixtureId(null)
  }

  const now = new Date()
  const currentMonth = now.toISOString().substring(0, 7)
  const monthlyLimitUsed = usedMonths.has(currentMonth)

  const tiles = [
    {
      id: 'don',
      icon: '⚡',
      name: 'Double or Nothing',
      available: !monthlyLimitUsed,
      status: monthlyLimitUsed ? 'Used this month' : 'Available',
      statusColor: monthlyLimitUsed ? 'text-[var(--text-muted)]' : 'text-emerald-400',
    },
    {
      id: 'reverse',
      icon: '🔄',
      name: 'Reverse',
      available: true,
      status: `${reversedTargetIds.size} used`,
      statusColor: 'text-purple-400',
    },
    {
      id: 'gk',
      icon: '⚔️',
      name: 'Giant Killer',
      available: true,
      status: 'Auto-awarded',
      statusColor: 'text-amber-400',
    },
  ]

  // Opponents for Reverse: all players except me, not already targeted
  const opponents = allPlayerEntries.filter((e: any) => e.player.id !== myPlayerId && !reversedTargetIds.has(e.player.id))

  // Upcoming fixtures for selected opponent's teams
  const targetTeamIds = reverseTarget ? new Set<string>(reverseTarget.teams.map((t: any) => t.team.id) as string[]) : new Set<string>()
  const targetFixtures = reverseTarget
    ? upcomingFixtures.filter(f => targetTeamIds.has(f.home_team_id) || targetTeamIds.has(f.away_team_id)).slice(0, 10)
    : []

  function confirmReverse() {
    if (!reverseTarget || !reverseFixtureId) return
    const fixture = upcomingFixtures.find(f => f.id === reverseFixtureId)
    if (!fixture) return
    const teamId = targetTeamIds.has(fixture.home_team_id) ? fixture.home_team_id : fixture.away_team_id
    const month = (fixture.kickoff_time as string).substring(0, 7)
    onActivateReverse(reverseTarget.player.id, teamId, reverseFixtureId, month)
    setExpanded(null)
    setReverseStep('pick-opponent')
    setReverseTarget(null)
    setReverseFixtureId(null)
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-3 pt-3 pb-2">Power-ups</p>

      <div className="grid grid-cols-3 gap-2 px-3 pb-3">
        {tiles.map(tile => (
          <button
            key={tile.id}
            onClick={() => toggle(tile.id)}
            className={`rounded-xl border p-2.5 text-left transition-all min-h-[80px] ${
              !tile.available
                ? 'opacity-40 border-[var(--border)] bg-[var(--bg)]'
                : expanded === tile.id
                  ? 'border-[var(--accent)]/60 bg-[var(--accent)]/8'
                  : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/30'
            }`}
          >
            <div className="text-lg mb-1.5">{tile.icon}</div>
            <div className="text-[10px] font-semibold text-[var(--text-primary)] leading-tight">{tile.name}</div>
            <div className={`text-[9px] mt-1 font-medium ${tile.statusColor}`}>{tile.status}</div>
            <div className="mt-1.5 flex justify-end">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-200 ${expanded === tile.id ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* D-o-N info */}
      {expanded === 'don' && (
        <div className="border-t border-[var(--border)] px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">⚡</span>
            <p className="font-semibold text-sm text-[var(--text-primary)]">Double or Nothing</p>
            <Badge variant="success" className="text-[9px] ml-auto">1× per month</Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Pick a calendar month and lock in one of your clubs. Every result that month is amplified:
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-2 text-center">
              <p className="text-[10px] font-bold text-emerald-400">Win</p>
              <p className="text-[13px] font-black text-emerald-400">×2 pts</p>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-2 text-center">
              <p className="text-[10px] font-bold text-amber-400">Draw</p>
              <p className="text-[13px] font-black text-amber-400">−1 pt</p>
            </div>
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-2 py-2 text-center">
              <p className="text-[10px] font-bold text-red-400">Loss</p>
              <p className="text-[13px] font-black text-red-400">−3 pts</p>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">Activate on a team card below. Each club can only be boosted once per season.</p>
        </div>
      )}

      {/* Reverse UI */}
      {expanded === 'reverse' && (
        <div className="border-t border-[var(--border)] px-3 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">🔄</span>
            <p className="font-semibold text-sm text-[var(--text-primary)]">Reverse</p>
            <Badge variant="purple" className="text-[9px] ml-auto">once per opponent</Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Target an opponent's club in an upcoming fixture. For that match, ownership swaps — you get their points, they get yours.
          </p>

          {opponents.length === 0 ? (
            <p className="text-[10px] text-amber-400 font-medium">You've targeted all opponents this season.</p>
          ) : reverseStep === 'pick-opponent' ? (
            <div className="space-y-1.5">
              <p className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Pick opponent to target</p>
              {opponents.map((opp: any) => (
                <button
                  key={opp.player.id}
                  onClick={() => { setReverseTarget(opp); setReverseStep('pick-fixture'); setReverseFixtureId(null) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] hover:border-purple-500/40 hover:bg-purple-500/5 transition-all text-left min-h-[48px]"
                >
                  <Avatar name={opp.player.name} color={opp.player.color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{opp.player.name}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">{opp.teams.length} team{opp.teams.length !== 1 ? 's' : ''}</p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-[var(--text-muted)] shrink-0">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setReverseStep('pick-opponent'); setReverseTarget(null); setReverseFixtureId(null) }}
                  className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 min-h-[32px]"
                >
                  ← Back
                </button>
                <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex-1">
                  Pick a fixture — <span style={{ color: reverseTarget.player.color }}>{reverseTarget.player.name}</span>
                </p>
              </div>

              {targetFixtures.length === 0 ? (
                <p className="text-[10px] text-[var(--text-muted)] italic">No upcoming fixtures for this player's clubs.</p>
              ) : (
                <div className="space-y-1.5">
                  {targetFixtures.map((f: any) => {
                    const tId = targetTeamIds.has(f.home_team_id) ? f.home_team_id : f.away_team_id
                    const tTeam = tId === f.home_team_id ? f.home_team : f.away_team
                    const oppTeam = tId === f.home_team_id ? f.away_team : f.home_team
                    const oppOwnerEntry = teamOwnerMap.get(oppTeam?.id)
                    const oppLabel = !oppOwnerEntry ? 'Unowned' : oppOwnerEntry.player.id === myPlayerId ? 'You' : oppOwnerEntry.player.name.split(' ')[0]
                    const isSelected = reverseFixtureId === f.id
                    return (
                      <button
                        key={f.id}
                        onClick={() => setReverseFixtureId(f.id)}
                        className={`w-full px-2.5 py-2 rounded-lg border transition-all text-left min-h-[56px] ${
                          isSelected
                            ? 'border-purple-500/60 bg-purple-500/10'
                            : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-purple-500/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <TeamCrest team={tTeam} size="xs" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{tTeam?.short_name || tTeam?.name}</p>
                              <p className="text-[8px] font-bold uppercase tracking-wide" style={{ color: reverseTarget.player.color }}>
                                {reverseTarget.player.name.split(' ')[0]}&apos;s club — being targeted
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] text-[var(--text-muted)] shrink-0">vs</span>
                          <div className="flex-1 min-w-0 flex items-center gap-1.5 justify-end text-right">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{oppTeam?.short_name || oppTeam?.name}</p>
                              <p className="text-[8px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{oppLabel}&apos;s club</p>
                            </div>
                            <TeamCrest team={oppTeam} size="xs" />
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-[var(--border)]'}`} />
                        </div>
                        <p className="text-[9px] text-[var(--text-secondary)] mt-1.5">
                          {new Date(f.kickoff_time).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}

              {reverseFixtureId && (
                <>
                  <p className="text-[10px] text-amber-400">
                    ⚠️ This cannot be undone once confirmed — ownership swaps with {reverseTarget.player.name.split(' ')[0]} for this match, permanently.
                  </p>
                  <button
                    onClick={confirmReverse}
                    disabled={!!activating}
                    className="w-full mt-1 py-2.5 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {activating ? 'Activating…' : '🔄 Confirm Reverse'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Giant Killer info */}
      {expanded === 'gk' && (
        <div className="border-t border-[var(--border)] px-3 py-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">⚔️</span>
            <p className="font-semibold text-sm text-[var(--text-primary)]">Giant Killer Bonus</p>
            <Badge variant="warning" className="text-[9px] ml-auto">Auto-awarded</Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            If one of your clubs is in the <span className="font-semibold text-[var(--text-primary)]">bottom 6</span> of the table and beats a club in the <span className="font-semibold text-[var(--text-primary)]">top 6</span> — both as it stood before kickoff — you automatically earn a Giant Killer bonus.
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">No activation needed. Only kicks in once every club has played 5+ matches.</p>
        </div>
      )}
    </div>
  )
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function MyTeamsCalendarView({
  upcomingFixtures,
  myTeamIds,
  powerUps,
  usedMonths,
}: {
  upcomingFixtures: any[]
  myTeamIds: Set<string>
  powerUps: any[]
  usedMonths: Set<string>
}) {
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const fixtureMap = new Map<string, any[]>()
  for (const f of upcomingFixtures) {
    if (!f.kickoff_time) continue
    const key = toDateKey(new Date(f.kickoff_time))
    const arr = fixtureMap.get(key) ?? []
    arr.push(f)
    fixtureMap.set(key, arr)
  }

  const today = new Date()
  const todayKey = toDateKey(today)
  const displayDay = selectedDay ?? todayKey
  const displayFixtures = fixtureMap.get(displayDay) ?? []

  const year = calMonth.getFullYear()
  const month = calMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const monthYM = `${year}-${String(month + 1).padStart(2, '0')}`
  const isDonUsed = usedMonths.has(monthYM)
  const isDonActive = powerUps.some(p => p.power_up_type === 'double_or_nothing' && p.season_month === monthYM && p.status === 'pending')

  const monthLabel = calMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const prevMonth = () => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d })
  const nextMonth = () => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d })

  const displayDayLabel = (() => {
    const d = new Date(displayDay + 'T12:00:00')
    if (displayDay === todayKey) return 'Today'
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  })()

  return (
    <div>
      {/* Month header + D-o-N status */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} title="Previous month" className="w-11 h-11 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg transition-colors" aria-label="Previous month">‹</button>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{monthLabel}</span>
          {isDonActive ? (
            <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">⚡ D-o-N active</span>
          ) : isDonUsed ? (
            <span className="text-[9px] text-[var(--text-muted)] bg-[var(--bg)] px-2 py-0.5 rounded-full border border-[var(--border)]">⚡ D-o-N used</span>
          ) : (
            <span className="text-[9px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">⚡ D-o-N available</span>
          )}
        </div>
        <button onClick={nextMonth} title="Next month" className="w-11 h-11 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg transition-colors" aria-label="Next month">›</button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-[var(--text-muted)] font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 gap-0.5 mb-4">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayFixtures = fixtureMap.get(key) ?? []
          const myFixtures = dayFixtures.filter(f => myTeamIds.has(f.home_team_id) || myTeamIds.has(f.away_team_id))
          const isToday = key === todayKey
          const isSelected = key === displayDay
          const hasMine = myFixtures.length > 0
          const hasAny = dayFixtures.length > 0

          return (
            <button
              key={key}
              onClick={() => setSelectedDay(key === displayDay ? null : key)}
              className={`w-full aspect-square flex flex-col items-center justify-start pt-0.5 rounded-lg text-[11px] font-semibold transition-all relative ${
                isSelected
                  ? 'bg-[var(--accent)] text-white'
                  : isToday
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40'
                    : hasAny
                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)]/50'
              }`}
            >
              <span>{day}</span>
              {(hasMine || hasAny) && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center px-0.5">
                  {hasMine && Array.from({ length: Math.min(myFixtures.length, 3) }).map((_, di) => (
                    <div key={di} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-[var(--accent)]'}`} />
                  ))}
                  {dayFixtures.length > myFixtures.length && !hasMine && (
                    <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/60' : 'bg-[var(--border)]'}`} />
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day fixtures */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">{displayDayLabel}</p>
        {displayFixtures.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">No fixtures</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {displayFixtures.map((f: any, i: number) => {
              const isMine = myTeamIds.has(f.home_team_id) || myTeamIds.has(f.away_team_id)
              return (
                <Link key={f.id} href={`/fixtures/${f.id}`}>
                  <div className={[
                    'flex items-center gap-3 px-3 py-2.5 min-h-[52px] transition-colors hover:bg-[var(--bg-card-hover)]',
                    i > 0 ? 'border-t border-[var(--border)]' : '',
                    isMine ? 'border-l-2 border-l-[var(--accent)]' : '',
                  ].join(' ')}>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <TeamCrest team={f.home_team} size="xs" />
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                        {f.kickoff_time ? new Date(f.kickoff_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'TBC'}
                      </span>
                      <TeamCrest team={f.away_team} size="xs" />
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] shrink-0 truncate text-right max-w-[90px]">
                      {f.home_team?.short_name || f.home_team?.name} v {f.away_team?.short_name || f.away_team?.name}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function AllPlayersView({ playerEntries, myUserId }: { playerEntries: any[]; myUserId: string | null }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="space-y-3">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setCollapsed(v => !v)}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] flex-1">
          {playerEntries.length} players
        </p>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {!collapsed && playerEntries.map(({ player, teams, total, isMe }: any) => (
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
            {teams.map(({ team, score }: any) => {
              const gf = score?.goals_for ?? 0
              const ga = score?.goals_against ?? 0
              const gd = gf - ga
              return (
                <div key={team.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 min-h-[44px]">
                  <div className="flex items-center gap-2.5">
                    <Link href={`/teams/${team.id}`} className="shrink-0">
                      <TeamCrest team={team} size="sm" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/teams/${team.id}`}>
                        <p className="font-medium text-xs text-[var(--text-primary)] truncate hover:text-[var(--accent)] transition-colors">{team.name}</p>
                      </Link>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
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

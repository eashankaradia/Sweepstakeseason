'use client'
import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { PageLoader, EmptyState, ErrorState } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [team, setTeam] = useState<any>(null)
  const [owners, setOwners] = useState<any[]>([])
  const [teamScore, setTeamScore] = useState<any>(null)
  const [fixtures, setFixtures] = useState<any[]>([])
  const [insights, setInsights] = useState<{ standing: any; elo: any } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const supabase = createClient()

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    setError(false)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    try {

    const { data: t } = await supabase.from('teams').select('*').eq('id', id).maybeSingle()
    if (!t) { setLoading(false); return }
    setTeam(t)

    const [{ data: assignments }, { data: score }, { data: fix }] = await Promise.all([
      supabase.from('player_team_assignments')
        .select('players(id,name,color,user_id)')
        .eq('league_id', leagueId)
        .eq('team_id', id),
      supabase.from('team_scores')
        .select('*')
        .eq('league_id', leagueId)
        .eq('team_id', id)
        .maybeSingle(),
      supabase.from('fixtures')
        .select(`*, home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', leagueId)
        .or(`home_team_id.eq.${id},away_team_id.eq.${id}`)
        .order('kickoff_time', { ascending: false })
        .limit(80),
    ])

    setOwners(((assignments ?? []) as any[]).map((a: any) => a.players).filter(Boolean))
    setTeamScore(score)
    setFixtures((fix ?? []) as any[])

    fetchInsights(id)

    setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  async function fetchInsights(teamId: string) {
    try {
      const res = await fetch(`/api/teams/${teamId}/insights`)
      if (res.ok) setInsights(await res.json())
    } catch { /* ignore */ }
  }

  if (loading) return <AppShell title="Team" backHref="/teams"><PageLoader /></AppShell>
  if (error) return <AppShell title="Team" backHref="/teams"><ErrorState onRetry={load} /></AppShell>
  if (!team) return <AppShell title="Team" backHref="/teams"><EmptyState icon="⚽" title="Team not found" /></AppShell>

  const recentResults = fixtures.filter(f => f.status === 'completed').slice(0, 5)
  const form = recentResults.map(f => {
    const isHome = f.home_team_id === id
    const myScore = isHome ? f.home_score : f.away_score
    const oppScore = isHome ? f.away_score : f.home_score
    if (myScore > oppScore) return 'W'
    if (myScore === oppScore) return 'D'
    return 'L'
  }).reverse()

  return (
    <AppShell title={team.short_name || team.name} backHref="/teams">
      {/* Team hero */}
      <div
        className="rounded-2xl p-4 mb-3 border flex items-center gap-4"
        style={{ borderColor: `${team.primary_color}30`, background: `${team.primary_color}10` }}
      >
        <TeamCrest team={team} size="xl" />
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-[var(--text-primary)] truncate">{team.name}</h2>
          <p className="text-xs text-[var(--text-secondary)]">{team.country}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {team.league_position && (
              <Badge variant="muted" className="text-[9px]">
                #{team.league_position}
              </Badge>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-black text-[var(--text-primary)]">{teamScore?.total_points ?? 0}</p>
          <p className="text-[10px] text-[var(--text-secondary)]">pts</p>
        </div>
      </div>

      {/* Owners */}
      {owners.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide font-medium">
              Sweepstake Owner{owners.length > 1 ? 's' : ''}
            </p>
            {teamScore && teamScore.matches_played > 0 && (
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-emerald-400 font-medium">{teamScore.wins}W</span>
                <span className="text-amber-400 font-medium">{teamScore.draws}D</span>
                <span className="text-red-400 font-medium">{teamScore.losses}L</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {owners.map((o: any) => (
              <Link key={o.id} href={`/players/${o.id}`} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                <Avatar name={o.name} color={o.color} size="sm" />
                <span className="font-semibold text-sm text-[var(--text-primary)]">{o.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {form.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-3">
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Form</p>
          <div className="flex items-center gap-1.5">
            {form.map((r, i) => (
              <div
                key={i}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  r === 'W' ? 'bg-emerald-500/20 text-emerald-400' :
                  r === 'D' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400'
                }`}
              >
                {r}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Season stats */}
      {teamScore && (
        <div className="mb-3">
          <div className="grid grid-cols-4 gap-2 mb-2">
            {[
              { label: 'Pts', value: teamScore.total_points, color: 'text-[var(--text-primary)]' },
              { label: 'W', value: teamScore.wins, color: 'text-emerald-400' },
              { label: 'D', value: teamScore.draws, color: 'text-amber-400' },
              { label: 'L', value: teamScore.losses, color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-center py-3">
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {/* GF / GA / GD row */}
          {(teamScore.goals_for > 0 || teamScore.goals_against > 0) && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'GF', value: teamScore.goals_for ?? 0, color: 'text-[var(--text-secondary)]' },
                { label: 'GA', value: teamScore.goals_against ?? 0, color: 'text-[var(--text-secondary)]' },
                {
                  label: 'GD',
                  value: (teamScore.goals_for ?? 0) - (teamScore.goals_against ?? 0),
                  color: (teamScore.goals_for ?? 0) - (teamScore.goals_against ?? 0) > 0 ? 'text-emerald-400' : (teamScore.goals_for ?? 0) - (teamScore.goals_against ?? 0) < 0 ? 'text-red-400' : 'text-[var(--text-muted)]',
                },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-center py-2.5">
                  <p className={`text-base font-bold ${s.color}`}>{s.value > 0 ? `+${s.value}` : s.value}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live league standing + form strength (BigBallsData) */}
      {(insights?.standing || insights?.elo) && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-3">
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">League form</p>
          <div className="grid grid-cols-3 gap-2">
            {insights.standing && (
              <>
                <div className="text-center">
                  <p className="text-lg font-black text-[var(--text-primary)]">
                    {insights.standing.rank}<span className="text-[10px] text-[var(--text-muted)]">/{insights.standing.total_teams}</span>
                  </p>
                  <p className="text-[9px] text-[var(--text-muted)] mt-0.5">League rank</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-black text-[var(--text-primary)]">
                    {insights.standing.points_for ?? 0}<span className="text-xs text-[var(--text-muted)]">–</span>{insights.standing.points_against ?? 0}
                  </p>
                  <p className="text-[9px] text-[var(--text-muted)] mt-0.5">GF–GA</p>
                </div>
              </>
            )}
            {insights.elo && (
              <div className="text-center">
                <p className="text-lg font-black text-[var(--accent)]">{Math.round(insights.elo.rating)}</p>
                <p className="text-[9px] text-[var(--text-muted)] mt-0.5">Elo rating</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calendar */}
      {fixtures.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Calendar</p>
          <TeamCalendar fixtures={fixtures} teamId={id} />
        </div>
      )}

      {/* All fixtures — every game and result this season */}
      {fixtures.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">All fixtures</p>
          <TeamFixtureMonths fixtures={fixtures} teamId={id} />
        </div>
      )}

    </AppShell>
  )
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function TeamCalendar({ fixtures, teamId }: { fixtures: any[]; teamId: string }) {
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const fixtureMap = new Map<string, any[]>()
  for (const f of fixtures) {
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

  const monthLabel = calMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const prevMonth = () => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d })
  const nextMonth = () => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d })

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} title="Previous month" aria-label="Previous month" className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg transition-colors">‹</button>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{monthLabel}</span>
        <button onClick={nextMonth} title="Next month" aria-label="Next month" className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg transition-colors">›</button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-[var(--text-muted)] font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-3">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayFixtures = fixtureMap.get(key) ?? []
          const isToday = key === todayKey
          const isSelected = key === displayDay
          const f = dayFixtures[0]
          let dotColor = ''
          if (f?.status === 'completed') {
            const isHome = f.home_team_id === teamId
            const myScore = isHome ? f.home_score : f.away_score
            const oppScore = isHome ? f.away_score : f.home_score
            dotColor = myScore > oppScore ? 'bg-emerald-400' : myScore === oppScore ? 'bg-amber-400' : 'bg-red-400'
          } else if (f) {
            dotColor = isSelected ? 'bg-white' : 'bg-[var(--accent)]'
          }

          return (
            <button
              key={i}
              onClick={() => setSelectedDay(key === displayDay ? null : key)}
              className={`w-full aspect-square flex flex-col items-center justify-center rounded-lg transition-colors ${
                isSelected
                  ? 'bg-[var(--accent)] text-white'
                  : isToday
                    ? 'border border-[var(--accent)] text-[var(--accent)]'
                    : 'text-[var(--text-primary)] hover:bg-[var(--border)]/40'
              }`}
            >
              <span className="text-[11px] leading-none">{day}</span>
              {dayFixtures.length > 0 && <span className={`w-1 h-1 rounded-full mt-0.5 ${dotColor}`} />}
            </button>
          )
        })}
      </div>

      {displayFixtures.length > 0 && (
        <div className="space-y-2">
          {displayFixtures.map(f => <FixtureRow key={f.id} fixture={f} teamId={teamId} />)}
        </div>
      )}
    </div>
  )
}

function TeamFixtureMonths({ fixtures, teamId }: { fixtures: any[]; teamId: string }) {
  const currentMonth = new Date().toISOString().substring(0, 7)
  const [expanded, setExpanded] = useState<Set<string>>(new Set([currentMonth]))

  const groups = new Map<string, any[]>()
  for (const f of fixtures) {
    if (!f.kickoff_time) continue
    const ym = f.kickoff_time.substring(0, 7)
    const arr = groups.get(ym) ?? []
    arr.push(f)
    groups.set(ym, arr)
  }
  const sortedMonths = [...groups.keys()].sort((a, b) => b.localeCompare(a))

  function toggle(ym: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(ym)) next.delete(ym)
      else next.add(ym)
      return next
    })
  }

  return (
    <div className="space-y-2">
      {sortedMonths.map(ym => {
        const isExpanded = expanded.has(ym)
        const monthFixtures = (groups.get(ym) ?? []).sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime())
        const label = new Date(ym + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        return (
          <div key={ym} className="rounded-xl border border-[var(--border)] overflow-hidden">
            <button
              onClick={() => toggle(ym)}
              className="w-full px-3 py-2.5 min-h-11 bg-[var(--bg-card)] flex items-center justify-between gap-2 text-left"
            >
              <span className="font-semibold text-sm text-[var(--text-primary)]">{label}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" className={`shrink-0 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isExpanded && (
              <div className="px-2 pb-2 pt-1 space-y-2 bg-[var(--bg)]">
                {monthFixtures.map(f => <FixtureRow key={f.id} fixture={f} teamId={teamId} />)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FixtureRow({ fixture, teamId }: { fixture: any; teamId: string }) {
  const isHome = fixture.home_team_id === teamId
  const myTeam = isHome ? fixture.home_team : fixture.away_team
  const oppTeam = isHome ? fixture.away_team : fixture.home_team
  const myScore = isHome ? fixture.home_score : fixture.away_score
  const oppScore = isHome ? fixture.away_score : fixture.home_score
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'

  let resultColor = ''
  if (isCompleted && myScore != null && oppScore != null) {
    resultColor = myScore > oppScore ? 'text-emerald-400' : myScore === oppScore ? 'text-amber-400' : 'text-red-400'
  }

  return (
    <Link href={`/fixtures/${fixture.id}`}>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 flex items-center gap-2 hover:border-[var(--accent)]/40 transition-colors">
        <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">
          {isHome ? 'vs' : '@'} {oppTeam?.name}
        </span>
        {isLive && <Badge variant="danger" className="text-[9px]">LIVE</Badge>}
        {isCompleted && myScore != null ? (
          <span className={`text-xs font-bold shrink-0 ${resultColor}`}>
            {myScore}–{oppScore}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] shrink-0">
            {fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
          </span>
        )}
      </div>
    </Link>
  )
}

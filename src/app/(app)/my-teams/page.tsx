'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import type { League, Player, Team, TeamScore } from '@/lib/supabase/types'

type AssignmentRow = {
  id: string
  player_id: string
  team_id: string
  player: Player | null
  team: Team | null
}

type TeamEntry = {
  team: Team
  score: TeamScore | null
}

type PlayerEntry = {
  player: Player
  teams: TeamEntry[]
  total: number
  played: number
  wins: number
  draws: number
  losses: number
}

export default function MyTeamsPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [teamScores, setTeamScores] = useState<TeamScore[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState('all')
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: lg } = await supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle()
    setLeague(lg)
    if (!lg) { setLoading(false); return }

    const [{ data: playerData }, { data: assignmentData }, { data: scoreData }, { data: authData }] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position'),
      supabase.from('player_team_assignments').select('*, player:players(*), team:teams(*)').eq('league_id', lg.id),
      supabase.from('team_scores').select('*').eq('league_id', lg.id),
      supabase.auth.getUser(),
    ])

    const loadedPlayers = playerData ?? []
    setPlayers(loadedPlayers)
    setAssignments((assignmentData ?? []) as AssignmentRow[])
    setTeamScores(scoreData ?? [])

    const userId = authData?.user?.id
    const ownPlayer = userId ? loadedPlayers.find(player => player.user_id === userId) : null
    if (ownPlayer) setSelectedPlayerId(ownPlayer.id)
    else setSelectedPlayerId('all')

    setLoading(false)
  }

  const playerEntries = useMemo<PlayerEntry[]>(() => {
    return players.map(player => {
      const teams = assignments
        .filter(assignment => assignment.player_id === player.id && assignment.team)
        .map(assignment => {
          const team = assignment.team!
          const score = teamScores.find(ts => ts.team_id === team.id) ?? null
          return { team, score }
        })
        .sort((a, b) => (b.score?.total_points ?? 0) - (a.score?.total_points ?? 0) || a.team.name.localeCompare(b.team.name))

      return {
        player,
        teams,
        total: teams.reduce((sum, entry) => sum + (entry.score?.total_points ?? 0), 0),
        played: teams.reduce((sum, entry) => sum + (entry.score?.matches_played ?? 0), 0),
        wins: teams.reduce((sum, entry) => sum + (entry.score?.wins ?? 0), 0),
        draws: teams.reduce((sum, entry) => sum + (entry.score?.draws ?? 0), 0),
        losses: teams.reduce((sum, entry) => sum + (entry.score?.losses ?? 0), 0),
      }
    }).sort((a, b) => b.total - a.total || a.player.position - b.player.position)
  }, [assignments, players, teamScores])

  const visibleEntries = selectedPlayerId === 'all'
    ? playerEntries
    : playerEntries.filter(entry => entry.player.id === selectedPlayerId)

  const selectedEntry = selectedPlayerId !== 'all'
    ? playerEntries.find(entry => entry.player.id === selectedPlayerId)
    : null

  if (loading) return <AppShell title="My Teams"><PageLoader /></AppShell>

  if (!league) {
    return (
      <AppShell title="My Teams">
        <EmptyState icon="⚽" title="No league yet" />
      </AppShell>
    )
  }

  if (assignments.length === 0) {
    return (
      <AppShell title="My Teams">
        <EmptyState
          icon="🎯"
          title="Draft pending"
          description="Teams will appear here after the draft is run."
        />
      </AppShell>
    )
  }

  return (
    <AppShell title="My Teams">
      <div className="space-y-4">
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
          <FilterChip active={selectedPlayerId === 'all'} onClick={() => setSelectedPlayerId('all')}>
            All
          </FilterChip>
          {playerEntries.map(({ player }) => (
            <FilterChip key={player.id} active={selectedPlayerId === player.id} onClick={() => setSelectedPlayerId(player.id)}>
              {player.name}
            </FilterChip>
          ))}
        </div>

        {selectedEntry && (
          <Card className="!p-3">
            <div className="flex items-center gap-3">
              <Avatar name={selectedEntry.player.name} color={selectedEntry.player.color} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{selectedEntry.player.name}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{selectedEntry.teams.length} teams · {selectedEntry.played} matches</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold leading-none text-[var(--text-primary)]">{selectedEntry.total}</p>
                <p className="text-[10px] text-[var(--text-secondary)]">points</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <Stat label="W" value={selectedEntry.wins} className="text-emerald-400" />
              <Stat label="D" value={selectedEntry.draws} className="text-amber-400" />
              <Stat label="L" value={selectedEntry.losses} className="text-red-400" />
            </div>
          </Card>
        )}

        <div className="space-y-3">
          {visibleEntries.map(entry => (
            <section key={entry.player.id}>
              {selectedPlayerId === 'all' && (
                <div className="mb-2 flex items-center gap-2">
                  <Avatar name={entry.player.name} color={entry.player.color} size="sm" />
                  <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">{entry.player.name}</span>
                  <Badge variant="muted" className="text-[10px]">{entry.total} pts</Badge>
                </div>
              )}

              <div className="space-y-1.5">
                {entry.teams.map(({ team, score }) => (
                  <Card key={team.id} className="!p-2.5">
                    <div className="flex items-center gap-2.5">
                      <TeamCrest team={team} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{team.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{team.country}</p>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center text-[10px] text-[var(--text-secondary)]">
                        <Metric label="P" value={score?.matches_played ?? 0} />
                        <Metric label="W" value={score?.wins ?? 0} className="text-emerald-400" />
                        <Metric label="D" value={score?.draws ?? 0} className="text-amber-400" />
                        <Metric label="Pts" value={score?.total_points ?? 0} strong />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
          : 'border-[var(--border)] text-[var(--text-secondary)]'
      }`}
    >
      {children}
    </button>
  )
}

function Stat({ label, value, className = '' }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] py-2">
      <p className={`font-bold ${className}`}>{value}</p>
      <p className="text-[9px] text-[var(--text-muted)]">{label}</p>
    </div>
  )
}

function Metric({ label, value, className = '', strong = false }: { label: string; value: number; className?: string; strong?: boolean }) {
  return (
    <div className="min-w-[22px]">
      <p className={`${strong ? 'text-sm font-bold text-[var(--text-primary)]' : className || 'text-[var(--text-primary)]'}`}>{value}</p>
      <p className="text-[8px] uppercase text-[var(--text-muted)]">{label}</p>
    </div>
  )
}

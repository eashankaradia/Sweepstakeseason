'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { runDraft, validateDraft, type DraftAllocation } from '@/lib/draft'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/lib/utils'
import { isAdminUser } from '@/lib/admin'
import type { League, Player, Team, Competition, DraftRun } from '@/lib/supabase/types'

const TEAMS_PER_PLAYER = 5

export default function DraftPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [compTeamMap, setCompTeamMap] = useState<Map<string, Team[]>>(new Map())
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [expandedCompIds, setExpandedCompIds] = useState<Set<string>>(new Set())
  const [allocations, setAllocations] = useState<DraftAllocation[]>([])
  const [draftRuns, setDraftRuns] = useState<DraftRun[]>([])
  const [currentAssignments, setCurrentAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const initialized = useRef(false)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const { filteredTeams, filteredEuIds } = useMemo(() => {
    const seen = new Set<string>()
    const teams: Team[] = []
    const euIds = new Set<string>()
    for (const comp of competitions) {
      const isEu = comp.competition_type === 'european'
      for (const team of compTeamMap.get(comp.id) ?? []) {
        if (selectedTeamIds.has(team.id)) {
          if (!seen.has(team.id)) { seen.add(team.id); teams.push(team) }
          if (isEu) euIds.add(team.id)
        }
      }
    }
    return { filteredTeams: teams, filteredEuIds: euIds }
  }, [selectedTeamIds, compTeamMap, competitions])

  const allEuIds = useMemo(() => {
    const ids = new Set<string>()
    for (const comp of competitions) {
      if (comp.competition_type === 'european') {
        for (const team of compTeamMap.get(comp.id) ?? []) ids.add(team.id)
      }
    }
    return ids
  }, [competitions, compTeamMap])

  const tpp = players.length > 0 && filteredTeams.length >= players.length * TEAMS_PER_PLAYER ? TEAMS_PER_PLAYER : 0
  const unusedTeams = players.length > 0 ? filteredTeams.length - players.length * tpp : 0

  async function loadData() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: lg } = await supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle()
    setLeague(lg)
    if (!lg) { setLoading(false); return }

    const [
      { data: playersData },
      { data: tcData },
      { data: draftRunsData },
      { data: assignmentsData },
      { data: compsData },
      { data: authData },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position'),
      supabase
        .from('team_competitions')
        .select('team_id, competition_id, teams(*), competitions!inner(competition_type,enabled)')
        .eq('league_id', lg.id)
        .eq('competitions.competition_type', 'domestic_league')
        .eq('competitions.enabled', true),
      supabase.from('draft_runs').select('*').eq('league_id', lg.id).order('run_number', { ascending: false }),
      supabase.from('player_team_assignments').select('*, teams(*), players(*)').eq('league_id', lg.id),
      supabase.from('competitions').select('*').eq('league_id', lg.id).eq('enabled', true).eq('competition_type', 'domestic_league').order('display_order'),
      supabase.auth.getUser(),
    ])

    const user = authData?.user ?? null
    const { data: profile } = user
      ? await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
      : { data: null }

    setPlayers(playersData ?? [])
    setDraftRuns(draftRunsData ?? [])
    setCurrentAssignments(assignmentsData ?? [])
    setCompetitions(compsData ?? [])
    setIsAdmin(isAdminUser(user, profile))

    const map = new Map<string, Team[]>()
    for (const row of (tcData ?? []) as any[]) {
      if (row.teams) {
        if (!map.has(row.competition_id)) map.set(row.competition_id, [])
        const list = map.get(row.competition_id)!
        if (!list.find((t: Team) => t.id === row.teams.id)) list.push(row.teams as Team)
      }
    }
    setCompTeamMap(map)

    if (!initialized.current) {
      const all = new Set<string>()
      for (const [, teams] of map) teams.forEach(t => all.add(t.id))
      setSelectedTeamIds(all)
      initialized.current = true
    }
    setLoading(false)
  }

  function getCompSelectionState(compId: string): 'all' | 'some' | 'none' {
    const teams = compTeamMap.get(compId) ?? []
    if (teams.length === 0) return 'none'
    const count = teams.filter(t => selectedTeamIds.has(t.id)).length
    if (count === 0) return 'none'
    if (count === teams.length) return 'all'
    return 'some'
  }

  function toggleComp(compId: string) {
    if (!isAdmin) return
    const teams = compTeamMap.get(compId) ?? []
    const allSelected = teams.every(t => selectedTeamIds.has(t.id))
    setSelectedTeamIds(prev => {
      const next = new Set(prev)
      if (allSelected) teams.forEach(t => next.delete(t.id))
      else teams.forEach(t => next.add(t.id))
      return next
    })
    setAllocations([])
  }

  function toggleTeam(teamId: string) {
    if (!isAdmin) return
    setSelectedTeamIds(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
    setAllocations([])
  }

  function toggleExpanded(compId: string) {
    setExpandedCompIds(prev => {
      const next = new Set(prev)
      if (next.has(compId)) next.delete(compId)
      else next.add(compId)
      return next
    })
  }

  function selectAll() {
    if (!isAdmin) return
    const all = new Set<string>()
    for (const [, teams] of compTeamMap) teams.forEach(t => all.add(t.id))
    setSelectedTeamIds(all)
    setAllocations([])
  }

  function deselectAll() {
    if (!isAdmin) return
    setSelectedTeamIds(new Set())
    setAllocations([])
  }

  async function handleGenerate() {
    if (!isAdmin) return
    setError('')
    setGenerating(true)
    try {
      if (players.length < 2) throw new Error('Need at least 2 players')
      if (selectedTeamIds.size === 0) throw new Error('Select at least one team')
      if (tpp < 1) throw new Error(`Need ${players.length * TEAMS_PER_PLAYER} teams for ${players.length} players to get ${TEAMS_PER_PLAYER} each (have ${filteredTeams.length})`)
      const leagueSizeMap = new Map<string, number>()
      for (const comp of competitions) {
        if (comp.competition_type !== 'european') {
          const teams = compTeamMap.get(comp.id) ?? []
          for (const team of teams) leagueSizeMap.set(team.id, teams.length)
        }
      }
      const result = runDraft(
        players.map(p => ({ id: p.id, name: p.name, color: p.color })),
        filteredTeams,
        filteredEuIds,
        leagueSizeMap,
      )
      setAllocations(result)
    } catch (e: any) {
      setError(e.message)
    }
    setGenerating(false)
  }

  async function handleSave() {
    if (!isAdmin) return
    if (!league || allocations.length === 0) return
    setSaving(true)
    setError('')
    const runNumber = (draftRuns[0]?.run_number ?? 0) + 1
    const snapshot = allocations.map(a => ({ playerId: a.playerId, playerName: a.playerName, teams: a.teams.map(t => ({ id: t.id, name: t.name })) }))
    const { data: run, error: runErr } = await supabase.from('draft_runs').insert({ league_id: league.id, run_number: runNumber, generated_by: null, allocation_snapshot: snapshot as any }).select().maybeSingle()
    if (runErr) { setError(runErr.message); setSaving(false); return }
    await supabase.from('player_team_assignments').delete().eq('league_id', league.id)
    const toInsert = allocations.flatMap(a => a.teams.map(t => ({ league_id: league.id, player_id: a.playerId, team_id: t.id, draft_run_id: run?.id })))
    const { error: insertErr } = await supabase.from('player_team_assignments').insert(toInsert)
    if (insertErr) { setError(insertErr.message); setSaving(false); return }
    setSaving(false)
    loadData()
  }

  async function handleLock() {
    if (!isAdmin) return
    if (!league) return
    setLocking(true)
    const latestRun = draftRuns[0]
    if (latestRun) await supabase.from('draft_runs').update({ locked: true, locked_at: new Date().toISOString(), locked_by: null }).eq('id', latestRun.id)
    await supabase.from('sweepstake_leagues').update({ draft_locked: true, draft_locked_at: new Date().toISOString(), status: 'active' }).eq('id', league.id)
    setLocking(false)
    loadData()
  }

  async function handleUnlock() {
    if (!isAdmin) return
    if (!league) return
    await supabase.from('sweepstake_leagues').update({ draft_locked: false, draft_locked_at: null }).eq('id', league.id)
    loadData()
  }

  const currentTpp = allocations[0]?.teams.length ?? tpp
  const validation = allocations.length > 0 ? validateDraft(allocations, currentTpp) : null

  if (loading) return <AppShell title="Draft Room"><PageLoader /></AppShell>
  if (!league) return <AppShell title="Draft Room"><EmptyState icon="🎯" title="No league set up" description="Create a league first in Settings." /></AppShell>

  const hasDraft = currentAssignments.length > 0
  const isLocked = league.draft_locked
  const currentAlloc = players.map(p => {
    const teams = currentAssignments.filter(a => a.player_id === p.id).map((a: any) => a.teams)
    return { player: p, teams: teams.filter(Boolean), euCount: teams.filter((t: any) => t && allEuIds.has(t.id)).length }
  })

  const totalTeams = Array.from(compTeamMap.values()).reduce((s, t) => s + t.length, 0)

  return (
    <AppShell title="Draft Room">
      <div className="flex items-center gap-2 mb-4">
        <Badge variant={isLocked ? 'success' : hasDraft ? 'warning' : 'muted'}>
          {isLocked ? '🔒 Locked' : hasDraft ? '⚠️ Unlocked' : '⏳ No draft'}
        </Badge>
        <span className="text-xs text-[var(--text-secondary)]">{draftRuns.length > 0 ? `Run #${draftRuns[0].run_number}` : 'No runs yet'}</span>
        {draftRuns.length > 0 && <span className="text-xs text-[var(--text-muted)]">· {formatDate(draftRuns[0].generated_at)}</span>}
        {!isAdmin && <Badge variant="muted" className="ml-auto text-[9px]">View only</Badge>}
      </div>

      {competitions.length > 0 && (
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">Teams to draft from</h3>
            <div className="flex gap-2">
              <button onClick={selectAll} disabled={isLocked || !isAdmin} className="text-[10px] text-[var(--accent)] disabled:opacity-40">All</button>
              <span className="text-[10px] text-[var(--text-muted)]">/</span>
              <button onClick={deselectAll} disabled={isLocked || !isAdmin} className="text-[10px] text-[var(--text-muted)] disabled:opacity-40">None</button>
            </div>
          </div>

          <div className="space-y-1">
            {competitions.map(comp => {
              const teams = compTeamMap.get(comp.id) ?? []
              const state = getCompSelectionState(comp.id)
              const isExpanded = expandedCompIds.has(comp.id)
              const selectedCount = teams.filter(t => selectedTeamIds.has(t.id)).length
              const isEu = comp.competition_type === 'european'

              return (
                <div key={comp.id} className="rounded-lg overflow-hidden">
                  {/* Competition header */}
                  <div className="flex items-center gap-2 py-1.5">
                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleExpanded(comp.id)}
                      className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)] shrink-0"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {/* Competition-level checkbox */}
                    <button
                      onClick={() => { if (!isLocked && isAdmin) toggleComp(comp.id) }}
                      disabled={isLocked || !isAdmin}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        state === 'all' ? 'bg-[var(--accent)] border-[var(--accent)]'
                        : state === 'some' ? 'bg-[var(--accent)]/30 border-[var(--accent)]'
                        : 'border-[var(--border)] bg-transparent'
                      } disabled:opacity-40`}
                    >
                      {state === 'all' && (
                        <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                      {state === 'some' && (
                        <svg width="8" height="2" viewBox="0 0 8 2"><line x1="1" y1="1" x2="7" y2="1" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" /></svg>
                      )}
                    </button>

                    {/* Badge + name */}
                    <button onClick={() => toggleExpanded(comp.id)} className="flex items-center gap-2 flex-1 text-left">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
                        isEu ? 'bg-purple-500/20 text-purple-400' : 'bg-[var(--accent)]/20 text-[var(--accent)]'
                      }`}>
                        {comp.short_name}
                      </div>
                      <span className="text-sm text-[var(--text-primary)] flex-1">{comp.name}</span>
                    </button>

                    <span className={`text-[10px] shrink-0 ${
                      state === 'none' ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
                    }`}>
                      {selectedCount}/{teams.length}
                    </span>
                  </div>

                  {/* Expanded team list */}
                  {isExpanded && teams.length > 0 && (
                    <div className="ml-7 mb-2 space-y-0.5">
                      {teams.sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || a.name.localeCompare(b.name)).map(team => {
                        const checked = selectedTeamIds.has(team.id)
                        return (
                          <label key={team.id} className="flex items-center gap-2 py-1 cursor-pointer">
                            <div
                              onClick={() => { if (!isLocked && isAdmin) toggleTeam(team.id) }}
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                checked ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)] bg-transparent'
                              } ${isLocked || !isAdmin ? 'opacity-40 cursor-default' : ''}`}
                            >
                              {checked && (
                                <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              )}
                            </div>
                            <TeamCrest team={team} size="xs" />
                            <span className={`text-xs flex-1 ${checked ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                              {team.name}
                            </span>
                            {(team as any).league_position != null && (
                              <span className="text-[9px] text-[var(--text-muted)]">#{(team as any).league_position}</span>
                            )}
                            {team.tier === 1 && <span className="text-[9px] text-amber-400">★</span>}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {players.length > 0 && filteredTeams.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              {selectedTeamIds.size} of {totalTeams} teams selected · {players.length} players →{' '}
              <strong className="text-[var(--text-primary)]">{TEAMS_PER_PLAYER} each</strong>
              {unusedTeams > 0 && <span className="text-[var(--text-muted)]"> ({unusedTeams} unused)</span>}
            </div>
          )}
        </Card>
      )}

      <Card className="mb-4">
        <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">Requirements</h3>
        <div className="space-y-1.5">
          <Req ok={players.length >= 2} label={`Players: ${players.length}`} />
          <Req ok={selectedTeamIds.size > 0} label={`Teams selected: ${selectedTeamIds.size}`} />
          <Req
            ok={tpp >= 1}
            label={tpp >= 1
              ? `${TEAMS_PER_PLAYER} teams per player (${filteredTeams.length} total)`
              : `Need ${players.length * TEAMS_PER_PLAYER} teams for ${TEAMS_PER_PLAYER} each (have ${filteredTeams.length})`
            }
          />
          <Req ok={filteredEuIds.size > 0} label={`European teams: ${filteredEuIds.size}`} />
          <Req ok={isAdmin} label={isAdmin ? 'Admin controls enabled' : 'Only the admin can control the draft'} />
          <Req ok={!isLocked} label={isLocked ? 'Draft locked — unlock to regenerate' : 'Draft unlocked'} />
        </div>
      </Card>

      {!isAdmin ? (
        <Card className="mb-4 !p-3 text-center text-sm text-[var(--text-secondary)]">
          The draft room is view-only for players. Eashan can generate, save, and lock the draw.
        </Card>
      ) : !isLocked ? (
        <div className="space-y-2 mb-4">
          <Button onClick={handleGenerate} loading={generating} className="w-full" variant="secondary">🎲 Generate new draft</Button>
          {allocations.length > 0 && <Button onClick={handleSave} loading={saving} className="w-full">💾 Save this allocation</Button>}
          {hasDraft && <Button onClick={handleLock} loading={locking} className="w-full" variant="success">🔒 Lock draft</Button>}
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          <div className="text-center py-3 text-sm text-[var(--text-secondary)]">Draft is locked. Teams are assigned.</div>
          <Button onClick={handleUnlock} variant="danger" className="w-full">🔓 Unlock draft</Button>
        </div>
      )}

      {error && <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

      {validation && (
        <Card className="mb-4">
          <span className={`font-semibold text-sm ${validation.valid ? 'text-emerald-400' : 'text-red-400'}`}>
            {validation.valid ? '✓ Valid draft' : '✗ Issues found'}
          </span>
          {validation.errors.map((e, i) => <p key={i} className="text-xs text-red-400 mb-1">✗ {e}</p>)}
          {validation.warnings.map((w, i) => <p key={i} className="text-xs text-amber-400 mb-1">⚠ {w}</p>)}
          <p className="text-xs text-[var(--text-secondary)] mt-1">EU teams: min {validation.europeanDistribution.min}, max {validation.europeanDistribution.max} per player</p>
        </Card>
      )}

      {(allocations.length > 0 || hasDraft) && (
        <div>
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">{allocations.length > 0 ? 'Preview' : 'Current allocation'}</h3>
          <div className="space-y-2">
            {(allocations.length > 0
              ? allocations.map(a => ({ name: a.playerName, color: players.find(p => p.id === a.playerId)?.color ?? '#6366f1', teams: a.teams, euCount: a.europeanCount, avgPosition: a.avgPosition }))
              : currentAlloc.map(({ player, teams, euCount }) => ({ name: player.name, color: player.color, teams, euCount, avgPosition: null as number | null }))
            ).map((entry, i) => (
              <Card key={i}>
                <div className="flex items-center gap-2 mb-2">
                  <Avatar name={entry.name} color={entry.color} size="sm" />
                  <span className="font-medium text-sm text-[var(--text-primary)] flex-1">{entry.name}</span>
                  {entry.avgPosition != null && <span className="text-[10px] text-[var(--text-muted)]">avg pos {entry.avgPosition}</span>}
                  <span className="text-xs text-[var(--text-muted)]">{entry.teams.length} teams</span>
                  {entry.euCount > 0 && <Badge variant="purple" className="text-[9px]">{entry.euCount} EU</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {entry.teams.map((team: any) => team && (
                    <div key={team.id} className="flex items-center gap-1">
                      <TeamCrest team={team} size="xs" />
                      <span className="text-[10px] text-[var(--text-secondary)]">{team.short_name || team.name.split(' ')[0]}</span>
                      {allEuIds.has(team.id) && <span className="text-[8px] text-purple-400">★</span>}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {draftRuns.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">Draft history</h3>
          <div className="space-y-1.5">
            {draftRuns.map(run => (
              <Card key={run.id} className="!p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">Run #{run.run_number}</span>
                    <span className="text-xs text-[var(--text-secondary)] ml-2">{formatDate(run.generated_at)}</span>
                  </div>
                  <Badge variant={run.locked ? 'success' : 'muted'}>{run.locked ? 'Locked' : 'Draft'}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  )
}

function Req({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
      <span className={ok ? 'text-[var(--text-secondary)]' : 'text-red-400'}>{label}</span>
    </div>
  )
}

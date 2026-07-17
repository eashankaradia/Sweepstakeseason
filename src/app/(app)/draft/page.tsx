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
  const [teamSearch, setTeamSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const initialized = useRef(false)
  // Shared-team ownership: { teamId, playerIds[] } saved separately from the main draft
  const [sharedEntries, setSharedEntries] = useState<{ teamId: string; playerIds: string[] }[]>([])
  const [sharedPickTeamId, setSharedPickTeamId] = useState('')
  const [sharedPickPlayerIds, setSharedPickPlayerIds] = useState<string[]>([])
  const [sharedSearch, setSharedSearch] = useState('')
  const [savingShared, setSavingShared] = useState(false)

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

  // All domestic-league teams that also play in a European competition
  const domesticTeamsInEurope = useMemo(() => {
    const ids = new Set<string>()
    for (const comp of competitions) {
      if (comp.competition_type === 'domestic_league') {
        for (const team of compTeamMap.get(comp.id) ?? []) {
          if (allEuIds.has(team.id)) ids.add(team.id)
        }
      }
    }
    return ids
  }, [competitions, compTeamMap, allEuIds])

  const tpp = players.length > 0 ? Math.floor(filteredTeams.length / players.length) : 0
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
        .eq('competitions.enabled', true),
      supabase.from('draft_runs').select('*').eq('league_id', lg.id).order('run_number', { ascending: false }),
      supabase.from('player_team_assignments').select('*, teams(*), players(*)').eq('league_id', lg.id),
      supabase.from('competitions').select('*').eq('league_id', lg.id).eq('enabled', true).order('display_order'),
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

    // Rebuild shared entries: teams that appear for >1 player
    const teamPlayerIds = new Map<string, string[]>()
    for (const a of (assignmentsData ?? []) as any[]) {
      if (!teamPlayerIds.has(a.team_id)) teamPlayerIds.set(a.team_id, [])
      if (!teamPlayerIds.get(a.team_id)!.includes(a.player_id)) teamPlayerIds.get(a.team_id)!.push(a.player_id)
    }
    const shared: { teamId: string; playerIds: string[] }[] = []
    for (const [teamId, pids] of teamPlayerIds) {
      if (pids.length > 1) shared.push({ teamId, playerIds: pids })
    }
    setSharedEntries(shared)

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
      // By default, select all domestic_league teams only (EU comps are supplemental)
      const all = new Set<string>()
      for (const comp of (compsData ?? [])) {
        if (comp.competition_type === 'domestic_league') {
          for (const t of map.get(comp.id) ?? []) all.add(t.id)
        }
      }
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
      if (tpp < 1) throw new Error(`Need at least ${players.length} teams to draft (have ${filteredTeams.length})`)
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

  async function handleSaveSharedTeam() {
    if (!isAdmin || !league) return
    if (!sharedPickTeamId) { setError('Pick a team to share'); return }
    if (sharedPickPlayerIds.length < 2) { setError('Select at least 2 players to share this team'); return }
    if (sharedPickPlayerIds.length > 3) { setError('Maximum 3 players can share one team'); return }
    setSavingShared(true)
    setError('')
    // Remove any existing assignments for this team+players combo then re-insert
    await supabase.from('player_team_assignments')
      .delete()
      .eq('league_id', league.id)
      .eq('team_id', sharedPickTeamId)
      .in('player_id', sharedPickPlayerIds)
    const rows = sharedPickPlayerIds.map(pid => ({ league_id: league.id, player_id: pid, team_id: sharedPickTeamId, draft_run_id: draftRuns[0]?.id ?? null }))
    const { error: err } = await supabase.from('player_team_assignments').insert(rows)
    if (err) { setError(err.message); setSavingShared(false); return }
    setSharedPickTeamId('')
    setSharedPickPlayerIds([])
    setSavingShared(false)
    loadData()
  }

  async function handleRemoveSharedTeam(teamId: string) {
    if (!isAdmin || !league) return
    // Only delete the extra rows (keep one assignment, or delete all if desired)
    await supabase.from('player_team_assignments')
      .delete()
      .eq('league_id', league.id)
      .eq('team_id', teamId)
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

  // Separate competitions by type for display ordering
  const typeOrder: Record<string, number> = { domestic_league: 0, european: 1, domestic_cup: 2 }
  const sortedComps = [...competitions].sort((a, b) =>
    (typeOrder[a.competition_type] ?? 9) - (typeOrder[b.competition_type] ?? 9) || a.display_order - b.display_order
  )

  const searchLower = teamSearch.toLowerCase().trim()

  // Flat deduplicated team list for shared-team picker
  const allTeamsList: Team[] = []
  const seenT = new Set<string>()
  for (const teams of compTeamMap.values()) {
    for (const t of teams) {
      if (!seenT.has(t.id)) { seenT.add(t.id); allTeamsList.push(t) }
    }
  }
  allTeamsList.sort((a, b) => a.name.localeCompare(b.name))
  const sharedSearchLower = sharedSearch.toLowerCase()
  const filteredSharedTeams = sharedSearchLower
    ? allTeamsList.filter(t => t.name.toLowerCase().includes(sharedSearchLower) || (t.short_name ?? '').toLowerCase().includes(sharedSearchLower))
    : allTeamsList

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

          {/* Team search */}
          <div className="relative mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={teamSearch}
              onChange={e => setTeamSearch(e.target.value)}
              placeholder="Search teams…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/60"
            />
            {teamSearch && (
              <button onClick={() => setTeamSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="space-y-1">
            {sortedComps.map(comp => {
              const teams = compTeamMap.get(comp.id) ?? []
              const state = getCompSelectionState(comp.id)
              const isExpanded = expandedCompIds.has(comp.id)
              const selectedCount = teams.filter(t => selectedTeamIds.has(t.id)).length
              const isEu = comp.competition_type === 'european'
              const isCup = comp.competition_type === 'domestic_cup'

              const visibleTeams = searchLower
                ? teams.filter(t => t.name.toLowerCase().includes(searchLower) || (t.short_name ?? '').toLowerCase().includes(searchLower))
                : teams

              if (searchLower && visibleTeams.length === 0) return null

              const showExpanded = isExpanded || !!searchLower

              return (
                <div key={comp.id} className="rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 py-1.5">
                    <button
                      onClick={() => toggleExpanded(comp.id)}
                      className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)] shrink-0"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${showExpanded ? 'rotate-90' : ''}`}>
                        <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

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

                    <button onClick={() => toggleExpanded(comp.id)} className="flex items-center gap-2 flex-1 text-left">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
                        isEu ? 'bg-purple-500/20 text-purple-400' : isCup ? 'bg-amber-500/20 text-amber-400' : 'bg-[var(--accent)]/20 text-[var(--accent)]'
                      }`}>
                        {comp.short_name}
                      </div>
                      <div className="flex-1 flex items-center gap-1.5 min-w-0">
                        <span className="text-sm text-[var(--text-primary)] truncate">{comp.name}</span>
                        {isEu && <Badge variant="purple" className="text-[8px] px-1 py-0 shrink-0">European</Badge>}
                        {isCup && <Badge variant="warning" className="text-[8px] px-1 py-0 shrink-0">Cup</Badge>}
                      </div>
                    </button>

                    <span className={`text-[10px] shrink-0 ${state === 'none' ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}`}>
                      {selectedCount}/{teams.length}
                    </span>
                  </div>

                  {showExpanded && visibleTeams.length > 0 && (
                    <div className="ml-7 mb-2 space-y-0.5">
                      {visibleTeams.sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || a.name.localeCompare(b.name)).map(team => {
                        const checked = selectedTeamIds.has(team.id)
                        const inEurope = !isEu && domesticTeamsInEurope.has(team.id)
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
                            <div className="flex items-center gap-1 shrink-0">
                              {inEurope && (
                                <span className="text-[9px] text-purple-400 font-medium">★ EU</span>
                              )}
                              {team.league_position != null && (
                                <span className="text-[9px] text-[var(--text-muted)]">#{team.league_position}</span>
                              )}
                              {team.tier === 1 && !inEurope && <span className="text-[9px] text-amber-400">★</span>}
                            </div>
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
              <strong className="text-[var(--text-primary)]">{tpp > 0 ? `${tpp} each` : 'not enough teams'}</strong>
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
              ? `${tpp} teams per player (${filteredTeams.length} total, ${unusedTeams} unused)`
              : `Need at least ${players.length} teams (have ${filteredTeams.length})`
            }
          />
          <Req ok={filteredEuIds.size > 0} label={`European teams in pool: ${filteredEuIds.size}`} />
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
                <div className="flex items-center gap-2 mb-2.5">
                  <Avatar name={entry.name} color={entry.color} size="sm" />
                  <span className="font-medium text-sm text-[var(--text-primary)] flex-1">{entry.name}</span>
                  {entry.avgPosition != null && <span className="text-[10px] text-[var(--text-muted)]">avg pos {entry.avgPosition}</span>}
                  <span className="text-xs text-[var(--text-muted)]">{entry.teams.length} teams</span>
                  {entry.euCount > 0 && <Badge variant="purple" className="text-[9px]">{entry.euCount} EU</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.teams.map((team: any) => team && (
                    <div key={team.id} className="flex items-center gap-1.5">
                      <TeamCrest team={team} size="xs" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-[var(--text-secondary)] leading-none">{team.short_name || team.name.split(' ')[0]}</p>
                        {allEuIds.has(team.id) && (
                          <p className="text-[8px] text-purple-400 leading-none mt-0.5">★ EU</p>
                        )}
                        {sharedEntries.some(s => s.teamId === team.id) && (
                          <p className="text-[8px] text-amber-400 leading-none mt-0.5">shared</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Shared team ownership */}
      {hasDraft && (
        <div className="mt-6">
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">Shared team ownership</h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">Assign one club to 2–3 players who all own it together.</p>

          {sharedEntries.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {sharedEntries.map(entry => {
                const team = allTeamsList.find(t => t.id === entry.teamId)
                const entryPlayers = entry.playerIds.map(pid => players.find(p => p.id === pid)).filter(Boolean)
                return (
                  <Card key={entry.teamId} className="!p-3">
                    <div className="flex items-center gap-2">
                      {team && <TeamCrest team={team} size="xs" />}
                      <span className="text-sm font-medium text-[var(--text-primary)] flex-1">{team?.short_name || team?.name || entry.teamId}</span>
                      <div className="flex items-center gap-1">
                        {entryPlayers.map(p => p && (
                          <div key={p.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: `${p.color}25`, color: p.color }}>
                            {p.name.split(' ')[0]}
                          </div>
                        ))}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleRemoveSharedTeam(entry.teamId)}
                          className="ml-1 text-red-400 hover:text-red-300 text-[10px] shrink-0"
                          title="Remove all assignments for this team"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {isAdmin && (
            <Card>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-3">Add shared team</p>

              {/* Team picker */}
              <div className="mb-3">
                <label className="text-[10px] text-[var(--text-muted)] mb-1 block">Club</label>
                <input
                  type="text"
                  value={sharedSearch}
                  onChange={e => { setSharedSearch(e.target.value); setSharedPickTeamId('') }}
                  placeholder="Search for a team…"
                  className="w-full px-3 py-1.5 text-xs bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/60 mb-1"
                />
                {sharedSearch && !sharedPickTeamId && (
                  <div className="rounded-lg border border-[var(--border)] overflow-hidden max-h-40 overflow-y-auto">
                    {filteredSharedTeams.slice(0, 12).map(team => (
                      <button
                        key={team.id}
                        onClick={() => { setSharedPickTeamId(team.id); setSharedSearch(team.short_name || team.name) }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-[var(--bg-card-hover)] text-left border-b border-[var(--border)]/40 last:border-0"
                      >
                        <TeamCrest team={team} size="xs" />
                        <span className="text-xs text-[var(--text-primary)]">{team.name}</span>
                      </button>
                    ))}
                    {filteredSharedTeams.length === 0 && (
                      <p className="px-3 py-2 text-xs text-[var(--text-muted)]">No teams found</p>
                    )}
                  </div>
                )}
                {sharedPickTeamId && (() => {
                  const t = allTeamsList.find(x => x.id === sharedPickTeamId)
                  return t ? (
                    <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30">
                      <TeamCrest team={t} size="xs" />
                      <span className="text-xs font-medium text-[var(--accent)]">{t.name}</span>
                      <button onClick={() => { setSharedPickTeamId(''); setSharedSearch('') }} className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[10px]">✕</button>
                    </div>
                  ) : null
                })()}
              </div>

              {/* Player multi-select */}
              <div className="mb-3">
                <label className="text-[10px] text-[var(--text-muted)] mb-1.5 block">Co-owners (2–3 players)</label>
                <div className="space-y-1">
                  {players.map(p => {
                    const selected = sharedPickPlayerIds.includes(p.id)
                    const maxReached = sharedPickPlayerIds.length >= 3 && !selected
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (maxReached) return
                          setSharedPickPlayerIds(prev =>
                            prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                          )
                        }}
                        disabled={maxReached}
                        className={[
                          'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg border transition-colors text-left',
                          selected
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                            : maxReached
                            ? 'border-[var(--border)] opacity-40 cursor-not-allowed'
                            : 'border-[var(--border)] hover:border-[var(--accent)]/50',
                        ].join(' ')}
                      >
                        <Avatar name={p.name} color={p.color} size="xs" />
                        <span className="text-xs text-[var(--text-primary)] flex-1">{p.name}</span>
                        {selected && <span className="text-[10px] font-bold" style={{ color: p.color }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Button
                onClick={handleSaveSharedTeam}
                loading={savingShared}
                disabled={!sharedPickTeamId || sharedPickPlayerIds.length < 2}
                className="w-full"
                variant="secondary"
              >
                💾 Save shared team
              </Button>
            </Card>
          )}
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

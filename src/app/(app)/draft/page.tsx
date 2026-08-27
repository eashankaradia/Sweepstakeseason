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
import { PageLoader, EmptyState, ErrorState } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/lib/utils'
import { isAdminUser } from '@/lib/admin'
import type { League, Player, Team, Competition, DraftRun } from '@/lib/supabase/types'

type DraftLifecycleState = 'not_started' | 'in_progress' | 'completed' | 'archived'

function getDraftLifecycleState(hasDraft: boolean, isLocked: boolean, seasonStarted: boolean): DraftLifecycleState {
  if (!hasDraft) return 'not_started'
  if (!isLocked) return 'in_progress'
  if (seasonStarted) return 'archived'
  return 'completed'
}

const LIFECYCLE_COPY: Record<DraftLifecycleState, { label: string; badge: 'muted' | 'warning' | 'success' | 'info'; icon: string; description: string }> = {
  not_started: { label: 'Not started', badge: 'muted', icon: '⏳', description: 'No draft has been generated yet.' },
  in_progress: { label: 'In progress', badge: 'warning', icon: '⚠️', description: 'A draft has been saved but is not locked — it can still be regenerated or changed.' },
  completed: { label: 'Completed', badge: 'success', icon: '🔒', description: 'The draft is locked. Teams are assigned for the season.' },
  archived: { label: 'Archived', badge: 'info', icon: '📁', description: 'The season is underway — this draft is now history. Unlocking it would wipe every team assignment the season\'s scores depend on.' },
}

function DraftStatusBanner({ state, runDate }: { state: DraftLifecycleState; runDate?: string | null }) {
  const c = LIFECYCLE_COPY[state]
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <Badge variant={c.badge}>{c.icon} {c.label}</Badge>
      {runDate && <span className="text-xs text-[var(--text-muted)]">{formatDate(runDate)}</span>}
      <p className="w-full text-xs text-[var(--text-secondary)] mt-0.5">{c.description}</p>
    </div>
  )
}

export default function DraftPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [compTeamMap, setCompTeamMap] = useState<Map<string, Team[]>>(new Map())
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set())
  const [allocations, setAllocations] = useState<DraftAllocation[]>([])
  const [draftRuns, setDraftRuns] = useState<DraftRun[]>([])
  const [currentAssignments, setCurrentAssignments] = useState<any[]>([])
  const [teamSearch, setTeamSearch] = useState('')
  const [ownersPerTeam, setOwnersPerTeam] = useState(3)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const initialized = useRef(false)
  const [sharedEntries, setSharedEntries] = useState<{ teamId: string; playerIds: string[] }[]>([])
  const [sharedPickTeamId, setSharedPickTeamId] = useState('')
  const [sharedPickPlayerIds, setSharedPickPlayerIds] = useState<string[]>([])
  const [sharedSearch, setSharedSearch] = useState('')
  const [savingShared, setSavingShared] = useState(false)
  const [seasonStarted, setSeasonStarted] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

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

  const tpp = players.length > 0 ? Math.floor(filteredTeams.length * ownersPerTeam / players.length) : 0
  const unusedTeams = players.length > 0 ? filteredTeams.length - players.length * tpp / ownersPerTeam : 0

  async function loadData() {
    setLoading(true)
    setLoadError(false)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    try {

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
      { count: completedFixtureCount },
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
      supabase.from('fixtures').select('id', { count: 'exact', head: true }).eq('league_id', lg.id).eq('status', 'completed'),
    ])
    setSeasonStarted((completedFixtureCount ?? 0) > 0)

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
    } catch {
      setLoadError(true)
      setLoading(false)
    }
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
      if (ownersPerTeam > 1 && players.length % ownersPerTeam !== 0)
        throw new Error(`${players.length} players can't be split into groups of ${ownersPerTeam} co-owners`)
      if (tpp < 1) throw new Error(`Need at least ${Math.ceil(players.length / ownersPerTeam)} teams (have ${filteredTeams.length})`)
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
        undefined,
        ownersPerTeam,
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
    const warning = seasonStarted
      ? 'The season has already started — matches have been played against the current team assignments.\n\nUnlocking lets you regenerate the draft, which would DELETE every team assignment and replace it with a new one. Points and history already recorded stay attached to the old assignments and will no longer make sense.\n\nAre you absolutely sure you want to unlock?'
      : 'Unlock the draft? This allows the allocation to be regenerated or changed.'
    if (!confirm(warning)) return
    await supabase.from('sweepstake_leagues').update({ draft_locked: false, draft_locked_at: null }).eq('id', league.id)
    loadData()
  }

  const currentTpp = allocations[0]?.teams.length ?? tpp
  const validation = allocations.length > 0 ? validateDraft(allocations, currentTpp, ownersPerTeam) : null

  if (loading) return <AppShell title="Draft Room"><PageLoader /></AppShell>
  if (loadError) return <AppShell title="Draft Room"><ErrorState onRetry={loadData} /></AppShell>
  if (!league) return <AppShell title="Draft Room"><EmptyState icon="🎯" title="No league set up" description="Create a league first in Settings." /></AppShell>

  const hasDraft = currentAssignments.length > 0
  const isLocked = league.draft_locked
  const currentAlloc = players.map(p => {
    const teams = currentAssignments.filter(a => a.player_id === p.id).map((a: any) => a.teams)
    return { player: p, teams: teams.filter(Boolean), euCount: teams.filter((t: any) => t && allEuIds.has(t.id)).length }
  })

  // Map: teamId → Player[] (all co-owners of each team)
  const ownerMap = new Map<string, Player[]>()
  for (const a of currentAssignments as any[]) {
    const p = players.find(pl => pl.id === a.player_id)
    if (p && a.team_id) {
      if (!ownerMap.has(a.team_id)) ownerMap.set(a.team_id, [])
      if (!ownerMap.get(a.team_id)!.find(pl => pl.id === p.id)) ownerMap.get(a.team_id)!.push(p)
    }
  }

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

  // ── Non-admin view ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    const state = getDraftLifecycleState(hasDraft, isLocked, seasonStarted)
    return (
      <AppShell title="Draft Room">
        <DraftStatusBanner state={state} runDate={draftRuns[0]?.generated_at} />

        {!hasDraft ? (
          <EmptyState icon="🎯" title="Draft not yet run" description="The admin hasn't set up the draw yet. Check back soon." />
        ) : (
          <>
            <div className="space-y-2">
              {currentAlloc.map(({ player, teams, euCount }, i) => (
                <Card key={i}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Avatar name={player.name} color={player.color} size="sm" />
                    <span className="font-medium text-sm text-[var(--text-primary)] flex-1">{player.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">{teams.length} teams</span>
                    {euCount > 0 && <Badge variant="purple" className="text-[9px]">{euCount} EU</Badge>}
                  </div>
                  <div className="space-y-1.5">
                    {teams.map((team: any) => {
                      if (!team) return null
                      const coOwners = (ownerMap.get(team.id) ?? []).filter(p2 => p2.id !== player.id)
                      return (
                        <div key={team.id} className="flex items-center gap-2">
                          <TeamCrest team={team} size="xs" />
                          <span className="text-xs text-[var(--text-primary)] flex-1">{team.short_name || team.name}</span>
                          {coOwners.length > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-[var(--text-muted)]">with</span>
                              {coOwners.map(co => (
                                <span key={co.id} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${co.color}25`, color: co.color }}>
                                  {co.name.split(' ')[0]}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </AppShell>
    )
  }

  // ── Admin view ──────────────────────────────────────────────────────────────
  const adminState = getDraftLifecycleState(hasDraft, isLocked, seasonStarted)
  const setupCollapsed = adminState === 'archived' && !showSetup

  return (
    <AppShell title="Draft Room">
      <DraftStatusBanner state={adminState} runDate={draftRuns[0]?.generated_at} />
      {draftRuns.length > 0 && (
        <p className="text-xs text-[var(--text-muted)] -mt-3 mb-4">Run #{draftRuns[0].run_number}</p>
      )}

      {setupCollapsed ? (
        <Card className="mb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">Draft setup is hidden</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">The season is underway, so the draft is treated as history. Only open this if you specifically need to change it.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setShowSetup(true)} className="shrink-0">Show</Button>
          </div>
        </Card>
      ) : (
      <>
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

          <div className="space-y-0.5">
            {(() => {
              const allTeams = [...new Map(sortedComps.flatMap(comp => compTeamMap.get(comp.id) ?? []).map(t => [t.id, t])).values()]
              const visibleTeams = (searchLower
                ? allTeams.filter(t => t.name.toLowerCase().includes(searchLower) || (t.short_name ?? '').toLowerCase().includes(searchLower))
                : allTeams
              ).sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || a.name.localeCompare(b.name))

              return visibleTeams.map(team => {
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
                    <div className="flex items-center gap-1 shrink-0">
                      {team.league_position != null && (
                        <span className="text-[9px] text-[var(--text-muted)]">#{team.league_position}</span>
                      )}
                      {team.tier === 1 && <span className="text-[9px] text-amber-400">★</span>}
                    </div>
                  </label>
                )
              })
            })()}
          </div>

          {players.length > 0 && filteredTeams.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--text-secondary)]">
                {selectedTeamIds.size} teams × {ownersPerTeam} owners ÷ {players.length} players ={' '}
                <strong className="text-[var(--text-primary)]">{tpp > 0 ? `${tpp} teams each` : 'not enough teams'}</strong>
                {unusedTeams > 0 && <span className="text-[var(--text-muted)]"> ({Math.floor(unusedTeams)} unused)</span>}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-[var(--text-muted)]">Co-owners per team:</span>
                {[1, 2, 3].map(k => (
                  <button
                    key={k}
                    onClick={() => { setOwnersPerTeam(k); setAllocations([]) }}
                    disabled={isLocked}
                    className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                      ownersPerTeam === k
                        ? 'bg-[var(--accent)] border-[var(--accent)] text-white font-semibold'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/50'
                    } disabled:opacity-40`}
                  >
                    {k}
                  </button>
                ))}
              </div>
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
            ok={tpp >= 1 && (ownersPerTeam === 1 || players.length % ownersPerTeam === 0)}
            label={
              ownersPerTeam > 1 && players.length % ownersPerTeam !== 0
                ? `${players.length} players not divisible by ${ownersPerTeam} owners — try a different co-owner setting`
                : tpp >= 1
                ? `${filteredTeams.length} teams × ${ownersPerTeam} owners ÷ ${players.length} players = ${tpp} each`
                : `Need at least ${Math.ceil(players.length / ownersPerTeam)} teams (have ${filteredTeams.length})`
            }
          />
          <Req ok={!isLocked} label={isLocked ? 'Draft locked — unlock to regenerate' : 'Draft unlocked'} />
        </div>
      </Card>

      {!isLocked ? (
        <div className="space-y-2 mb-4">
          <Button onClick={handleGenerate} loading={generating} className="w-full" variant="secondary">🎲 Generate new draft</Button>
          {allocations.length > 0 && <Button onClick={handleSave} loading={saving} className="w-full">💾 Save this allocation</Button>}
          {hasDraft && <Button onClick={handleLock} loading={locking} className="w-full" variant="success">🔒 Lock draft</Button>}
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          <div className="text-center py-3 text-sm text-[var(--text-secondary)]">Draft is locked. Teams are assigned.</div>
          <Button onClick={handleUnlock} variant="danger" className="w-full">🔓 Unlock draft</Button>
          {adminState === 'archived' && (
            <button onClick={() => setShowSetup(false)} className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] py-1">
              Hide draft setup
            </button>
          )}
        </div>
      )}
      </>
      )}

      {error && <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}

      {validation && (
        <Card className="mb-4">
          <span className={`font-semibold text-sm ${validation.valid ? 'text-emerald-400' : 'text-red-400'}`}>
            {validation.valid ? '✓ Valid draft' : '✗ Issues found'}
          </span>
          {validation.errors.map((e, i) => <p key={i} className="text-xs text-red-400 mb-1">✗ {e}</p>)}
          {validation.warnings.map((w, i) => <p key={i} className="text-xs text-amber-400 mb-1">⚠ {w}</p>)}
        </Card>
      )}

      {(allocations.length > 0 || hasDraft) && (() => {
        // For preview: build co-owner map from allocations
        const previewOwnerMap = new Map<string, string[]>()
        if (allocations.length > 0) {
          for (const a of allocations) {
            for (const t of a.teams) {
              if (!previewOwnerMap.has(t.id)) previewOwnerMap.set(t.id, [])
              previewOwnerMap.get(t.id)!.push(a.playerName)
            }
          }
        }

        const rows = allocations.length > 0
          ? allocations.map(a => ({ id: a.playerId, name: a.playerName, color: players.find(p => p.id === a.playerId)?.color ?? '#6366f1', teams: a.teams, euCount: a.europeanCount, avgPosition: a.avgPosition, isPreview: true }))
          : currentAlloc.map(({ player, teams, euCount }) => ({ id: player.id, name: player.name, color: player.color, teams, euCount, avgPosition: null as number | null, isPreview: false }))

        return (
          <div>
            <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">{allocations.length > 0 ? 'Preview' : 'Current allocation'}</h3>
            <div className="space-y-2">
              {rows.map((entry, i) => (
                <Card key={i}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Avatar name={entry.name} color={entry.color} size="sm" />
                    <span className="font-medium text-sm text-[var(--text-primary)] flex-1">{entry.name}</span>
                    {entry.avgPosition != null && <span className="text-[10px] text-[var(--text-muted)]">avg pos {entry.avgPosition}</span>}
                    <span className="text-xs text-[var(--text-muted)]">{entry.teams.length} teams</span>
                    {entry.euCount > 0 && <Badge variant="purple" className="text-[9px]">{entry.euCount} EU</Badge>}
                  </div>
                  <div className="space-y-1.5">
                    {entry.teams.map((team: any) => {
                      if (!team) return null
                      const coOwnerNames = entry.isPreview
                        ? (previewOwnerMap.get(team.id) ?? []).filter(n => n !== entry.name)
                        : (ownerMap.get(team.id) ?? []).filter(p2 => p2.id !== entry.id).map(p2 => p2.name)
                      return (
                        <div key={team.id} className="flex items-center gap-2">
                          <TeamCrest team={team} size="xs" />
                          <span className="text-xs text-[var(--text-primary)] flex-1">{team.short_name || team.name}</span>
                          {coOwnerNames.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap justify-end">
                              <span className="text-[9px] text-[var(--text-muted)]">with</span>
                              {coOwnerNames.map((n: string) => {
                                const co = players.find(p => p.name === n)
                                return (
                                  <span key={n} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: co ? `${co.color}25` : 'var(--border)', color: co?.color ?? 'var(--text-muted)' }}>
                                    {n.split(' ')[0]}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Shared team ownership */}
      {hasDraft && (
        <div className="mt-6">
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">Shared team ownership</h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">Manually override co-ownership for a specific club (e.g. to fix or add a shared entry after the draft).</p>

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

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
import type { League, Player, Team, Competition, DraftRun } from '@/lib/supabase/types'

export default function DraftPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [compTeamMap, setCompTeamMap] = useState<Map<string, Team[]>>(new Map())
  const [selectedCompIds, setSelectedCompIds] = useState<string[]>([])
  const [allocations, setAllocations] = useState<DraftAllocation[]>([])
  const [draftRuns, setDraftRuns] = useState<DraftRun[]>([])
  const [currentAssignments, setCurrentAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [error, setError] = useState('')
  const initialized = useRef(false)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const { filteredTeams, filteredEuIds } = useMemo(() => {
    const seen = new Set<string>()
    const teams: Team[] = []
    const euIds = new Set<string>()
    for (const compId of selectedCompIds) {
      const comp = competitions.find(c => c.id === compId)
      for (const team of compTeamMap.get(compId) ?? []) {
        if (!seen.has(team.id)) { seen.add(team.id); teams.push(team) }
        if (comp?.competition_type === 'european') euIds.add(team.id)
      }
    }
    return { filteredTeams: teams, filteredEuIds: euIds }
  }, [selectedCompIds, compTeamMap, competitions])

  const allEuIds = useMemo(() => {
    const ids = new Set<string>()
    for (const comp of competitions) {
      if (comp.competition_type === 'european') {
        for (const team of compTeamMap.get(comp.id) ?? []) ids.add(team.id)
      }
    }
    return ids
  }, [competitions, compTeamMap])

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
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position'),
      supabase.from('team_competitions').select('team_id, competition_id, teams(*)').eq('league_id', lg.id),
      supabase.from('draft_runs').select('*').eq('league_id', lg.id).order('run_number', { ascending: false }),
      supabase.from('player_team_assignments').select('*, teams(*), players(*)').eq('league_id', lg.id),
      supabase.from('competitions').select('*').eq('league_id', lg.id).order('display_order'),
    ])

    setPlayers(playersData ?? [])
    setDraftRuns(draftRunsData ?? [])
    setCurrentAssignments(assignmentsData ?? [])
    setCompetitions(compsData ?? [])

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
      setSelectedCompIds(Array.from(map.keys()))
      initialized.current = true
    }
    setLoading(false)
  }

  function toggleComp(id: string) {
    setSelectedCompIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
    setAllocations([])
  }

  async function handleGenerate() {
    setError('')
    setGenerating(true)
    try {
      if (players.length < 2) throw new Error('Need at least 2 players')
      if (selectedCompIds.length === 0) throw new Error('Select at least one competition')
      if (tpp < 1) throw new Error(`Not enough teams — select more competitions (have ${filteredTeams.length} for ${players.length} players)`)
      const result = runDraft(
        players.map(p => ({ id: p.id, name: p.name, color: p.color })),
        filteredTeams,
        filteredEuIds,
      )
      setAllocations(result)
    } catch (e: any) {
      setError(e.message)
    }
    setGenerating(false)
  }

  async function handleSave() {
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
    if (!league) return
    setLocking(true)
    const latestRun = draftRuns[0]
    if (latestRun) await supabase.from('draft_runs').update({ locked: true, locked_at: new Date().toISOString(), locked_by: null }).eq('id', latestRun.id)
    await supabase.from('sweepstake_leagues').update({ draft_locked: true, draft_locked_at: new Date().toISOString(), status: 'active' }).eq('id', league.id)
    setLocking(false)
    loadData()
  }

  async function handleUnlock() {
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

  return (
    <AppShell title="Draft Room">
      <div className="flex items-center gap-2 mb-4">
        <Badge variant={isLocked ? 'success' : hasDraft ? 'warning' : 'muted'}>
          {isLocked ? '🔒 Locked' : hasDraft ? '⚠️ Unlocked' : '⏳ No draft'}
        </Badge>
        <span className="text-xs text-[var(--text-secondary)]">{draftRuns.length > 0 ? `Run #${draftRuns[0].run_number}` : 'No runs yet'}</span>
        {draftRuns.length > 0 && <span className="text-xs text-[var(--text-muted)]">· {formatDate(draftRuns[0].generated_at)}</span>}
      </div>

      {competitions.length > 0 && (
        <Card className="mb-4">
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3">Competitions to draft from</h3>
          <div className="space-y-2.5">
            {competitions.map(comp => {
              const teamCount = compTeamMap.get(comp.id)?.length ?? 0
              const checked = selectedCompIds.includes(comp.id)
              return (
                <label key={comp.id} className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleComp(comp.id)}
                    disabled={isLocked}
                    className="w-4 h-4 rounded accent-[var(--accent)] shrink-0"
                  />
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    comp.competition_type === 'european' ? 'bg-purple-500/20 text-purple-400' : 'bg-[var(--accent)]/20 text-[var(--accent)]'
                  }`}>
                    {comp.short_name}
                  </div>
                  <span className={`text-sm flex-1 ${checked ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{comp.name}</span>
                  <span className="text-xs text-[var(--text-muted)] shrink-0">{teamCount} teams</span>
                </label>
              )
            })}
          </div>
          {players.length > 0 && filteredTeams.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-secondary)]">
              {filteredTeams.length} teams · {players.length} players →{' '}
              <strong className="text-[var(--text-primary)]">{tpp} teams each</strong>
              {unusedTeams > 0 && <span className="text-[var(--text-muted)]"> ({unusedTeams} unused)</span>}
            </div>
          )}
        </Card>
      )}

      <Card className="mb-4">
        <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">Requirements</h3>
        <div className="space-y-1.5">
          <Req ok={players.length >= 2} label={`Players: ${players.length}`} />
          <Req ok={selectedCompIds.length > 0} label={`Competitions: ${selectedCompIds.length} selected`} />
          <Req
            ok={tpp >= 1}
            label={tpp >= 1
              ? `${tpp} teams per player (${filteredTeams.length} total)`
              : `Not enough teams — need at least ${players.length} (have ${filteredTeams.length})`
            }
          />
          <Req ok={filteredEuIds.size > 0} label={`European teams: ${filteredEuIds.size}`} />
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
              ? allocations.map(a => ({ name: a.playerName, color: players.find(p => p.id === a.playerId)?.color ?? '#6366f1', teams: a.teams, euCount: a.europeanCount }))
              : currentAlloc.map(({ player, teams, euCount }) => ({ name: player.name, color: player.color, teams, euCount }))
            ).map((entry, i) => (
              <Card key={i}>
                <div className="flex items-center gap-2 mb-2">
                  <Avatar name={entry.name} color={entry.color} size="sm" />
                  <span className="font-medium text-sm text-[var(--text-primary)] flex-1">{entry.name}</span>
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

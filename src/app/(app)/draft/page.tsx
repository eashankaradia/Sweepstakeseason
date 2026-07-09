'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { runDraft, validateDraft, type DraftAllocation } from '@/lib/draft'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/lib/utils'
import type { Profile, League, Player, Team, DraftRun } from '@/lib/supabase/types'

export default function DraftPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [league, setLeague] = useState<League | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [draftTeams, setDraftTeams] = useState<Team[]>([])
  const [europeanIds, setEuropeanIds] = useState<Set<string>>(new Set())
  const [allocations, setAllocations] = useState<DraftAllocation[]>([])
  const [draftRuns, setDraftRuns] = useState<DraftRun[]>([])
  const [currentAssignments, setCurrentAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [{ data: prof }, { data: leagues }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('sweepstake_leagues').select('*').order('created_at', { ascending: false }).limit(1),
    ])

    setProfile(prof)
    const lg = leagues?.[0] ?? null
    setLeague(lg)
    if (!lg) { setLoading(false); return }

    const [
      { data: playersData },
      { data: tcData },
      { data: draftRunsData },
      { data: assignmentsData },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('league_id', lg.id).order('position'),
      supabase.from('team_competitions')
        .select('team_id, competition_id, teams(*), competitions(competition_type)')
        .eq('league_id', lg.id),
      supabase.from('draft_runs').select('*').eq('league_id', lg.id).order('run_number', { ascending: false }),
      supabase.from('player_team_assignments').select('*, teams(*), players(*)').eq('league_id', lg.id),
    ])

    setPlayers(playersData ?? [])
    setDraftRuns(draftRunsData ?? [])
    setCurrentAssignments(assignmentsData ?? [])

    const teamMap = new Map<string, Team>()
    const euIds = new Set<string>()
    for (const row of (tcData ?? []) as any[]) {
      if (row.teams) teamMap.set(row.teams.id, row.teams)
      if (row.competitions?.competition_type === 'european') euIds.add(row.team_id)
    }
    setDraftTeams(Array.from(teamMap.values()))
    setEuropeanIds(euIds)
    setLoading(false)
  }

  async function handleGenerate() {
    setError('')
    setGenerating(true)
    try {
      if (players.length < 2) throw new Error('Need at least 2 players')
      if (draftTeams.length < players.length * 5) {
        throw new Error(`Need at least ${players.length * 5} teams (have ${draftTeams.length}). Add more teams to competitions.`)
      }
      const draftPlayers = players.map(p => ({ id: p.id, name: p.name, color: p.color }))
      const result = runDraft(draftPlayers, draftTeams, europeanIds)
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

    const { data: { user } } = await supabase.auth.getUser()

    const runNumber = (draftRuns[0]?.run_number ?? 0) + 1
    const snapshot = allocations.map(a => ({
      playerId: a.playerId,
      playerName: a.playerName,
      teams: a.teams.map(t => ({ id: t.id, name: t.name })),
    }))

    const { data: run, error: runErr } = await supabase.from('draft_runs').insert({
      league_id: league.id,
      run_number: runNumber,
      generated_by: user?.id,
      allocation_snapshot: snapshot as any,
    }).select().maybeSingle()

    if (runErr) { setError(runErr.message); setSaving(false); return }

    await supabase.from('player_team_assignments').delete().eq('league_id', league.id)

    const toInsert = allocations.flatMap(a =>
      a.teams.map(t => ({
        league_id: league.id,
        player_id: a.playerId,
        team_id: t.id,
        draft_run_id: run?.id,
      }))
    )

    const { error: insertErr } = await supabase.from('player_team_assignments').insert(toInsert)
    if (insertErr) { setError(insertErr.message); setSaving(false); return }

    setSaving(false)
    loadData()
  }

  async function handleLock() {
    if (!league) return
    setLocking(true)
    const { data: { user } } = await supabase.auth.getUser()
    const latestRun = draftRuns[0]
    if (latestRun) {
      await supabase.from('draft_runs').update({
        locked: true,
        locked_at: new Date().toISOString(),
        locked_by: user?.id,
      }).eq('id', latestRun.id)
    }
    await supabase.from('sweepstake_leagues').update({
      draft_locked: true,
      draft_locked_at: new Date().toISOString(),
      status: 'active',
    }).eq('id', league.id)
    setLocking(false)
    loadData()
  }

  async function handleUnlock() {
    if (!league) return
    await supabase.from('sweepstake_leagues').update({ draft_locked: false, draft_locked_at: null }).eq('id', league.id)
    loadData()
  }

  const validation = allocations.length > 0 ? validateDraft(allocations) : null

  if (loading) return (
    <AppShell profile={null} title="Draft Room">
      <PageLoader />
    </AppShell>
  )

  if (!league) return (
    <AppShell profile={profile} title="Draft Room">
      <EmptyState icon="🎯" title="No league set up" description="Create a league first in Settings." />
    </AppShell>
  )

  if (!profile?.is_admin) return (
    <AppShell profile={profile} title="Draft Room">
      <EmptyState icon="🔒" title="Admin only" description="Only admins can access the draft room." />
    </AppShell>
  )

  const hasDraft = currentAssignments.length > 0
  const isLocked = league.draft_locked

  const currentAlloc = players.map(p => {
    const teams = currentAssignments.filter(a => a.player_id === p.id).map((a: any) => a.teams)
    const euCount = teams.filter((t: any) => t && europeanIds.has(t.id)).length
    return { player: p, teams: teams.filter(Boolean), euCount }
  })

  return (
    <AppShell profile={profile} title="Draft Room">
      <div className="flex items-center gap-2 mb-4">
        <Badge variant={isLocked ? 'success' : hasDraft ? 'warning' : 'muted'}>
          {isLocked ? '🔒 Locked' : hasDraft ? '⚠️ Unlocked' : '⏳ No draft'}
        </Badge>
        <span className="text-xs text-[var(--text-secondary)]">
          {draftRuns.length > 0 ? `Run #${draftRuns[0].run_number}` : 'No runs yet'}
        </span>
        {draftRuns.length > 0 && (
          <span className="text-xs text-[var(--text-muted)]">
            · {formatDate(draftRuns[0].generated_at)}
          </span>
        )}
      </div>

      <Card className="mb-4">
        <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">Requirements</h3>
        <div className="space-y-1.5">
          <Requirement ok={players.length === 12} label={`Players: ${players.length}/12`} />
          <Requirement ok={draftTeams.length >= players.length * 5} label={`Teams: ${draftTeams.length} (need ${players.length * 5})`} />
          <Requirement ok={europeanIds.size > 0} label={`European teams: ${europeanIds.size}`} />
          <Requirement ok={!isLocked} label={isLocked ? 'Draft locked — unlock to regenerate' : 'Draft unlocked'} />
        </div>
      </Card>

      {!isLocked ? (
        <div className="space-y-2 mb-4">
          <Button onClick={handleGenerate} loading={generating} className="w-full" variant="secondary">
            🎲 Generate new draft
          </Button>
          {allocations.length > 0 && (
            <Button onClick={handleSave} loading={saving} className="w-full">
              💾 Save this allocation
            </Button>
          )}
          {hasDraft && (
            <Button onClick={handleLock} loading={locking} className="w-full" variant="success">
              🔒 Lock draft
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          <div className="text-center py-3 text-sm text-[var(--text-secondary)]">
            Draft is locked. Teams are assigned.
          </div>
          <Button onClick={handleUnlock} variant="danger" className="w-full">
            🔓 Unlock draft
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {validation && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`font-semibold text-sm ${validation.valid ? 'text-emerald-400' : 'text-red-400'}`}>
              {validation.valid ? '✓ Valid draft' : '✗ Issues found'}
            </span>
          </div>
          {validation.errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400 mb-1">✗ {e}</p>
          ))}
          {validation.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-400 mb-1">⚠ {w}</p>
          ))}
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            European teams: min {validation.europeanDistribution.min}, max {validation.europeanDistribution.max} per player
          </p>
        </Card>
      )}

      {(allocations.length > 0 || hasDraft) && (
        <div>
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-2">
            {allocations.length > 0 ? 'Preview' : 'Current allocation'}
          </h3>
          <div className="space-y-2">
            {(allocations.length > 0 ? allocations.map(a => ({
              name: a.playerName,
              color: players.find(p => p.id === a.playerId)?.color ?? '#6366f1',
              teams: a.teams,
              euCount: a.europeanCount,
            })) : currentAlloc.map(({ player, teams, euCount }) => ({
              name: player.name,
              color: player.color,
              teams,
              euCount,
            }))).map((entry, i) => (
              <Card key={i}>
                <div className="flex items-center gap-2 mb-2">
                  <Avatar name={entry.name} color={entry.color} size="sm" />
                  <span className="font-medium text-sm text-[var(--text-primary)] flex-1">{entry.name}</span>
                  {entry.euCount > 0 && (
                    <Badge variant="purple" className="text-[9px]">{entry.euCount} EU</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {entry.teams.map((team: any) => team && (
                    <div key={team.id} className="flex items-center gap-1">
                      <TeamCrest team={team} size="xs" />
                      <span className="text-[10px] text-[var(--text-secondary)]">{team.short_name || team.name.split(' ')[0]}</span>
                      {europeanIds.has(team.id) && (
                        <span className="text-[8px] text-purple-400">★</span>
                      )}
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
                  <Badge variant={run.locked ? 'success' : 'muted'}>
                    {run.locked ? 'Locked' : 'Draft'}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  )
}

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
      <span className={ok ? 'text-[var(--text-secondary)]' : 'text-red-400'}>{label}</span>
    </div>
  )
}

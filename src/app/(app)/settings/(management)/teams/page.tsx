'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import type { League, Competition, Team } from '@/lib/supabase/types'

export default function TeamsSettingsPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [allTeams, setAllTeams] = useState<Team[]>([])
  const [assignedTeamIds, setAssignedTeamIds] = useState<Set<string>>(new Set())
  const [draftedTeamIds, setDraftedTeamIds] = useState<Set<string>>(new Set())
  const [scoredTeamIds, setScoredTeamIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }
    const { data: lg } = await supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle()
    setLeague(lg)
    if (!lg) { setLoading(false); return }
    const { data: comp } = await supabase.from('competitions').select('*').eq('league_id', lg.id).eq('enabled', true).order('display_order').limit(1).maybeSingle()
    setCompetition(comp)
    if (!comp) { setLoading(false); return }
    const [{ data: teams }, { data: tc }, { data: assignments }, { data: scores }] = await Promise.all([
      supabase.from('teams').select('*').order('name'),
      supabase.from('team_competitions').select('team_id').eq('league_id', lg.id).eq('competition_id', comp.id),
      supabase.from('player_team_assignments').select('team_id').eq('league_id', lg.id),
      supabase.from('team_scores').select('team_id').eq('league_id', lg.id).gt('matches_played', 0),
    ])
    setAllTeams(teams ?? [])
    setDraftedTeamIds(new Set((assignments ?? []).map((a: { team_id: string }) => a.team_id)))
    setScoredTeamIds(new Set((scores ?? []).map((s: { team_id: string }) => s.team_id)))
    const assigned = new Set((tc ?? []).map((row: { team_id: string }) => row.team_id))
    setAssignedTeamIds(assigned)
    setSelectedTeams(new Set(assigned))
    setLoading(false)
  }

  function setsEqual(a: Set<string>, b: Set<string>) {
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }

  const hasUnsavedChanges = !setsEqual(selectedTeams, assignedTeamIds)

  function toggleTeam(teamId: string) {
    setSelectedTeams(prev => { const next = new Set(prev); if (next.has(teamId)) next.delete(teamId); else next.add(teamId); return next })
  }

  function selectAll() {
    setSelectedTeams(prev => { const next = new Set(prev); for (const t of filteredTeams) next.add(t.id); return next })
  }

  function clearSelection() {
    setSelectedTeams(prev => { const next = new Set(prev); for (const t of filteredTeams) next.delete(t.id); return next })
  }

  async function saveAssignments() {
    if (!league || !competition) return
    const removed = [...assignedTeamIds].filter(id => !selectedTeams.has(id))
    const removedAtRisk = removed.filter(id => draftedTeamIds.has(id) || scoredTeamIds.has(id))
    if (removedAtRisk.length > 0) {
      const names = removedAtRisk.map(id => allTeams.find(t => t.id === id)?.name ?? id).join(', ')
      if (!confirm(
        `${removedAtRisk.length} team(s) you're removing already have drafted owners or recorded results: ${names}.\n\nRemoving them stops future results counting, but existing points and assignments stay on record. Continue?`
      )) return
    }
    setSaving(true)
    await supabase.from('team_competitions').delete().eq('league_id', league.id).eq('competition_id', competition.id)
    if (selectedTeams.size > 0) {
      await supabase.from('team_competitions').insert(Array.from(selectedTeams).map(teamId => ({ league_id: league.id, team_id: teamId, competition_id: competition.id })))
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    loadData()
  }

  const filteredTeams = allTeams.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.country.toLowerCase().includes(search.toLowerCase()))
  const teamsByCountry = filteredTeams.reduce((acc, team) => { if (!acc[team.country]) acc[team.country] = []; acc[team.country].push(team); return acc }, {} as Record<string, Team[]>)

  if (loading) return <AppShell title="Team Pool" backHref="/settings"><PageLoader /></AppShell>

  return (
    <AppShell title="Team Pool" backHref="/settings">
      {!league ? (
        <EmptyState icon="🏆" title="Create a league first" />
      ) : !competition ? (
        <EmptyState icon="⚽" title="No competition set up" description="Create a league to set up the Premier League team pool." />
      ) : (
        <>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Select which Premier League clubs are in play. The draft will only use teams selected here.
          </p>
          <div className="sticky top-0 z-10 -mx-4 px-4 pt-1 pb-2 bg-[var(--bg)]/95 backdrop-blur-sm border-b border-[var(--border)] mb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{selectedTeams.size} teams selected</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {hasUnsavedChanges && <span className="text-amber-400">Unsaved changes</span>}
                  {saved && <span className="text-emerald-400">✓ Saved</span>}
                </p>
              </div>
              <Button size="sm" loading={saving} onClick={saveAssignments} disabled={!hasUnsavedChanges}>Save</Button>
            </div>
          </div>
          <div className="mb-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams..." />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={selectAll} className="text-xs px-2.5 py-1 rounded-md bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              Select all{search ? ' (matching)' : ''}
            </button>
            <button onClick={clearSelection} className="text-xs px-2.5 py-1 rounded-md bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              Clear{search ? ' (matching)' : ''}
            </button>
          </div>
          <div className="space-y-4">
            {Object.entries(teamsByCountry).map(([country, teams]) => (
              <div key={country}>
                <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">{country}</p>
                <div className="space-y-1.5">
                  {teams.map(team => {
                    const isSelected = selectedTeams.has(team.id)
                    const wasAssigned = assignedTeamIds.has(team.id)
                    const atRisk = wasAssigned && !isSelected && (draftedTeamIds.has(team.id) || scoredTeamIds.has(team.id))
                    return (
                      <button
                        key={team.id}
                        onClick={() => toggleTeam(team.id)}
                        className={`w-full min-h-11 text-left rounded-xl border p-3 transition-colors ${atRisk ? 'border-amber-500/60 bg-amber-500/10' : isSelected ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <TeamCrest team={team} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm truncate ${isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{team.name}</p>
                            {atRisk && <p className="text-[10px] text-amber-400">Drafted or has results — removing needs confirmation</p>}
                          </div>
                          <TierBadge tier={team.tier} />
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border)]'}`}>
                            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  )
}

function TierBadge({ tier }: { tier: number }) {
  const labels = ['', 'Elite', 'Top', 'Mid', 'Lower']
  const variants = ['', 'warning', 'info', 'success', 'muted'] as const
  return <Badge variant={variants[tier] || 'muted'} className="text-[9px] px-1 py-0 shrink-0">{labels[tier] || 'T' + tier}</Badge>
}

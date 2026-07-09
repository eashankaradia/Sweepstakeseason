'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TabBar } from '@/components/ui/TabBar'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/lib/utils'
import type { Profile, League, Competition, Team, Fixture } from '@/lib/supabase/types'

type FixtureWithRelations = Fixture & {
  competition: Competition
  home_team: Team
  away_team: Team
}

export default function FixturesPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [league, setLeague] = useState<League | null>(null)
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [fixtures, setFixtures] = useState<FixtureWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'results'>('upcoming')
  const [activeCompetition, setActiveCompetition] = useState<string>('all')
  const [adding, setAdding] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])

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

    const [{ data: comps }, { data: fix }, { data: teamData }] = await Promise.all([
      supabase.from('competitions').select('*').eq('league_id', lg.id).eq('enabled', true).order('display_order'),
      supabase.from('fixtures')
        .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', lg.id)
        .order('kickoff_time', { ascending: true }),
      supabase.from('team_competitions')
        .select('teams(*)')
        .eq('league_id', lg.id),
    ])

    setCompetitions(comps ?? [])
    setFixtures((fix ?? []) as any[])

    const uniqueTeams: Team[] = []
    const seen = new Set<string>()
    for (const row of (teamData ?? []) as any[]) {
      if (row.teams && !seen.has(row.teams.id)) {
        seen.add(row.teams.id)
        uniqueTeams.push(row.teams)
      }
    }
    setTeams(uniqueTeams.sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }

  const filteredFixtures = fixtures.filter(f => {
    const statusMatch = activeTab === 'upcoming'
      ? (f.status === 'scheduled' || f.status === 'live')
      : f.status === 'completed'
    const compMatch = activeCompetition === 'all' || f.competition_id === activeCompetition
    return statusMatch && compMatch
  })

  if (loading) return (
    <AppShell profile={null} title="Fixtures">
      <PageLoader />
    </AppShell>
  )

  return (
    <AppShell profile={profile} title="Fixtures"
      action={profile?.is_admin ? (
        <Button size="sm" onClick={() => setAdding(true)}>+ Add</Button>
      ) : undefined}
    >
      <TabBar
        tabs={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'results', label: 'Results' }]}
        active={activeTab}
        onChange={v => setActiveTab(v as any)}
        className="mb-3"
      />

      {competitions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-4 px-4 scrollbar-none">
          <button
            onClick={() => setActiveCompetition('all')}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeCompetition === 'all'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
            }`}
          >
            All
          </button>
          {competitions.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCompetition(c.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeCompetition === c.id
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
              }`}
            >
              {c.short_name}
            </button>
          ))}
        </div>
      )}

      {filteredFixtures.length === 0 ? (
        <EmptyState
          icon={activeTab === 'upcoming' ? '📅' : '📊'}
          title={activeTab === 'upcoming' ? 'No upcoming fixtures' : 'No results yet'}
          description={activeTab === 'upcoming' ? 'Check back after the season starts.' : 'Results will appear here once matches are completed.'}
        />
      ) : (
        <div className="space-y-2">
          {filteredFixtures.map(f => (
            <FixtureCard key={f.id} fixture={f} isAdmin={profile?.is_admin ?? false} onUpdate={loadData} />
          ))}
        </div>
      )}

      {adding && league && (
        <AddFixtureModal
          leagueId={league.id}
          competitions={competitions}
          teams={teams}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); loadData() }}
        />
      )}
    </AppShell>
  )
}

function FixtureCard({ fixture, isAdmin, onUpdate }: { fixture: FixtureWithRelations; isAdmin: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [homeScore, setHomeScore] = useState(fixture.home_score?.toString() ?? '')
  const [awayScore, setAwayScore] = useState(fixture.away_score?.toString() ?? '')
  const [saving, setSaving] = useState(false)

  async function saveResult() {
    setSaving(true)
    const supabase = createClient()
    const h = parseInt(homeScore)
    const a = parseInt(awayScore)
    if (isNaN(h) || isNaN(a)) { setSaving(false); return }

    await supabase.from('fixtures').update({
      home_score: h,
      away_score: a,
      status: 'completed',
    }).eq('id', fixture.id)

    await updateTeamScores(fixture.league_id, { ...fixture, home_score: h, away_score: a })
    setSaving(false)
    setEditing(false)
    onUpdate()
  }

  return (
    <Card className="!p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] mb-1.5">
        <Badge variant={fixture.competition?.competition_type === 'european' ? 'purple' : 'default'} className="text-[9px]">
          {fixture.competition?.short_name}
        </Badge>
        {fixture.round && <span>{fixture.round}</span>}
        {fixture.matchday && <span>MD{fixture.matchday}</span>}
        <span className="ml-auto">{fixture.kickoff_time ? formatDateTime(fixture.kickoff_time) : '—'}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <TeamCrest team={fixture.home_team} size="xs" />
          <span className="text-xs font-medium text-[var(--text-primary)] truncate">{fixture.home_team?.name}</span>
        </div>

        <div className="shrink-0 text-center min-w-[56px]">
          {fixture.status === 'completed' ? (
            <span className="font-bold text-sm text-[var(--text-primary)]">
              {fixture.home_score} – {fixture.away_score}
            </span>
          ) : fixture.status === 'live' ? (
            <Badge variant="danger" className="text-[9px]">LIVE</Badge>
          ) : (
            <span className="text-xs text-[var(--text-muted)] font-medium">vs</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <span className="text-xs font-medium text-[var(--text-primary)] truncate text-right">{fixture.away_team?.name}</span>
          <TeamCrest team={fixture.away_team} size="xs" />
        </div>
      </div>

      {isAdmin && fixture.status !== 'completed' && (
        <div className="mt-2">
          {editing ? (
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="99" value={homeScore} onChange={e => setHomeScore(e.target.value)} className="!w-14 text-center !py-1" placeholder="0" />
              <span className="text-[var(--text-muted)]">–</span>
              <input type="number" min="0" max="99" value={awayScore} onChange={e => setAwayScore(e.target.value)} className="!w-14 text-center !py-1" placeholder="0" />
              <Button size="sm" loading={saving} onClick={saveResult}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="text-[10px]">
              Enter result
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

async function updateTeamScores(leagueId: string, fixture: any) {
  const supabase = createClient()
  const h = fixture.home_score
  const a = fixture.away_score

  async function upsertScore(teamId: string, isHome: boolean) {
    const { data: existing } = await supabase
      .from('team_scores')
      .select('*')
      .eq('league_id', leagueId)
      .eq('team_id', teamId)
      .maybeSingle()

    const myScore = isHome ? h : a
    const oppScore = isHome ? a : h
    const win = myScore > oppScore ? 1 : 0
    const draw = myScore === oppScore ? 1 : 0
    const loss = myScore < oppScore ? 1 : 0
    const pts = win ? 3 : draw ? 1 : 0

    if (existing) {
      await supabase.from('team_scores').update({
        total_points: (existing.total_points ?? 0) + pts,
        wins: (existing.wins ?? 0) + win,
        draws: (existing.draws ?? 0) + draw,
        losses: (existing.losses ?? 0) + loss,
        goals_for: (existing.goals_for ?? 0) + myScore,
        goals_against: (existing.goals_against ?? 0) + oppScore,
        matches_played: (existing.matches_played ?? 0) + 1,
        last_calculated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('team_scores').insert({
        league_id: leagueId,
        team_id: teamId,
        total_points: pts,
        wins: win,
        draws: draw,
        losses: loss,
        goals_for: myScore,
        goals_against: oppScore,
        matches_played: 1,
      })
    }
  }

  await Promise.all([
    upsertScore(fixture.home_team_id, true),
    upsertScore(fixture.away_team_id, false),
  ])

  await recalcPlayerScores(leagueId)
}

async function recalcPlayerScores(leagueId: string) {
  const supabase = createClient()

  const [{ data: assignments }, { data: teamScores }, { data: players }] = await Promise.all([
    supabase.from('player_team_assignments').select('*').eq('league_id', leagueId),
    supabase.from('team_scores').select('*').eq('league_id', leagueId),
    supabase.from('players').select('*').eq('league_id', leagueId),
  ])

  for (const player of (players ?? [])) {
    const playerTeams = (assignments ?? []).filter(a => a.player_id === player.id)
    let total = 0, wins = 0, draws = 0, losses = 0, played = 0

    for (const a of playerTeams) {
      const ts = (teamScores ?? []).find(ts => ts.team_id === a.team_id)
      if (ts) {
        total += ts.total_points ?? 0
        wins += ts.wins ?? 0
        draws += ts.draws ?? 0
        losses += ts.losses ?? 0
        played += ts.matches_played ?? 0
      }
    }

    const { data: existing } = await supabase
      .from('player_scores')
      .select('id')
      .eq('league_id', leagueId)
      .eq('player_id', player.id)
      .maybeSingle()

    if (existing) {
      await supabase.from('player_scores').update({
        total_points: total, wins, draws, losses, matches_played: played,
        last_calculated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('player_scores').insert({
        league_id: leagueId, player_id: player.id,
        total_points: total, wins, draws, losses, matches_played: played,
      })
    }
  }
}

function AddFixtureModal({
  leagueId, competitions, teams, onClose, onSaved
}: {
  leagueId: string
  competitions: Competition[]
  teams: Team[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    competition_id: competitions[0]?.id ?? '',
    home_team_id: '',
    away_team_id: '',
    kickoff_time: '',
    round: '',
    matchday: '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.competition_id || !form.home_team_id || !form.away_team_id) return
    if (form.home_team_id === form.away_team_id) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('fixtures').insert({
      league_id: leagueId,
      competition_id: form.competition_id,
      home_team_id: form.home_team_id,
      away_team_id: form.away_team_id,
      kickoff_time: form.kickoff_time || null,
      round: form.round || null,
      matchday: form.matchday ? parseInt(form.matchday) : null,
      status: 'scheduled',
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-[var(--bg-card)] rounded-t-2xl p-5 pb-8 border-t border-[var(--border)]">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4">Add Fixture</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Competition</label>
            <select value={form.competition_id} onChange={e => setForm(f => ({ ...f, competition_id: e.target.value }))}>
              {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Home team</label>
              <select value={form.home_team_id} onChange={e => setForm(f => ({ ...f, home_team_id: e.target.value }))}>
                <option value="">Select...</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Away team</label>
              <select value={form.away_team_id} onChange={e => setForm(f => ({ ...f, away_team_id: e.target.value }))}>
                <option value="">Select...</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Date/time</label>
              <input type="datetime-local" value={form.kickoff_time} onChange={e => setForm(f => ({ ...f, kickoff_time: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] block mb-1">Matchday</label>
              <input type="number" value={form.matchday} onChange={e => setForm(f => ({ ...f, matchday: e.target.value }))} placeholder="e.g. 1" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] block mb-1">Round (optional)</label>
            <input value={form.round} onChange={e => setForm(f => ({ ...f, round: e.target.value }))} placeholder="e.g. Group Stage" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={save} loading={saving} className="flex-1">Add fixture</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

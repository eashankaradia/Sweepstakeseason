import { cookies } from 'next/headers'
import { getLeagueById, getPlayers, getPlayerScores, getAssignments, getFixtures } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { EmptyState } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const leagueId = cookieStore.get('ss_league')?.value
  const league = leagueId ? await getLeagueById(leagueId) : null

  if (!league) {
    return (
      <AppShell>
        <EmptyState
          icon="🏆"
          title="No league set up yet"
          description="Create a league in settings to get started."
          action={
            <Link href="/settings/league" className="text-[var(--accent)] text-sm font-medium hover:underline">
              Create a league →
            </Link>
          }
        />
      </AppShell>
    )
  }

  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const myUserId = authData?.user?.id

  const [players, playerScores, assignments, recentFixtures, upcomingFixtures] = await Promise.all([
    getPlayers(league.id),
    getPlayerScores(league.id),
    getAssignments(league.id),
    getFixtures(league.id, { status: 'completed', limit: 5 }),
    getFixtures(league.id, { status: 'scheduled', limit: 5 }),
  ])

  const draftDone = assignments.length > 0

  const standings = players.map(player => {
    const score = playerScores.find(s => s.player_id === player.id)
    return {
      player,
      totalPoints: score?.total_points ?? 0,
      wins: score?.wins ?? 0,
      draws: score?.draws ?? 0,
      losses: score?.losses ?? 0,
      played: score?.matches_played ?? 0,
    }
  }).sort((a, b) => b.totalPoints - a.totalPoints)

  const myEntry = myUserId ? standings.find(s => s.player.user_id === myUserId) : null
  const myPosition = myEntry ? standings.indexOf(myEntry) + 1 : null
  const leader = standings[0]

  return (
    <AppShell>
      {/* League header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-xl text-[var(--text-primary)] leading-tight">{league.name}</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">{league.season}</p>
        </div>
        <Badge variant={league.status === 'active' ? 'success' : league.status === 'setup' ? 'warning' : 'muted'}>
          {league.status === 'setup' ? 'Setting up' : league.status === 'active' ? 'Active' : 'Complete'}
        </Badge>
      </div>

      {/* My position card (only after draft) */}
      {myEntry && myPosition && (
        <div
          className="rounded-xl p-4 mb-3 border"
          style={{
            background: `linear-gradient(135deg, ${myEntry.player.color}18 0%, transparent 60%)`,
            borderColor: `${myEntry.player.color}30`,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <Avatar name={myEntry.player.name} color={myEntry.player.color} size="lg" />
              <div
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border border-[var(--bg)]"
                style={{ backgroundColor: myEntry.player.color, color: '#fff' }}
              >
                {myPosition}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[var(--text-secondary)] font-medium uppercase tracking-wide mb-0.5">Your standing</p>
              <p className="font-bold text-base text-[var(--text-primary)] truncate">{myEntry.player.name}</p>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--text-muted)]">
                <span className="text-emerald-400">{myEntry.wins}W</span>
                <span className="text-amber-400">{myEntry.draws}D</span>
                <span className="text-red-400">{myEntry.losses}L</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-2xl text-[var(--text-primary)]">{myEntry.totalPoints}</p>
              <p className="text-[10px] text-[var(--text-secondary)]">points</p>
            </div>
          </div>
        </div>
      )}

      {/* Leader card (only if someone else is leading) */}
      {leader && (!myEntry || myPosition !== 1) && (
        <Card className="mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <span className="text-amber-400 text-sm">🥇</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[var(--text-secondary)] mb-0.5 uppercase tracking-wide font-medium">League leader</p>
              <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{leader.player.name}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-[var(--text-primary)]">{leader.totalPoints} pts</p>
              <p className="text-[10px] text-[var(--text-secondary)]">
                {leader.wins}W {leader.draws}D {leader.losses}L
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats row */}
      {draftDone ? (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatCard value={players.length} label="Players" />
          <StatCard value={assignments.length} label="Teams drawn" />
          <StatCard value={recentFixtures.length} label="Results" />
        </div>
      ) : (
        <Card className="mb-4 border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5">
          <div className="text-center py-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Draft not yet run</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1 mb-2">
              {league.draft_locked ? 'The draft is locked — contact your admin.' : 'Head to the draft room to assign teams.'}
            </p>
            {!league.draft_locked && (
              <Link href="/draft" className="inline-flex items-center gap-1 text-xs text-[var(--accent)] font-semibold hover:underline">
                Go to draft room →
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Recent results */}
      {recentFixtures.length > 0 && (
        <div className="mb-4">
          <SectionHeader title="Recent results" href="/fixtures?status=completed" />
          <div className="space-y-2">
            {recentFixtures.slice(0, 3).map(f => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming fixtures */}
      {upcomingFixtures.length > 0 && (
        <div>
          <SectionHeader title="Upcoming" href="/fixtures" />
          <div className="space-y-2">
            {upcomingFixtures.slice(0, 3).map(f => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </div>
        </div>
      )}

      {recentFixtures.length === 0 && upcomingFixtures.length === 0 && draftDone && (
        <Card className="text-center py-6">
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm font-medium text-[var(--text-primary)]">No fixtures yet</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            <Link href="/fixtures" className="text-[var(--accent)] hover:underline">Add fixtures</Link> to start tracking results.
          </p>
        </Card>
      )}
    </AppShell>
  )
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-center py-3 px-2">
      <div className="text-xl font-bold text-[var(--text-primary)]">{value}</div>
      <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{label}</div>
    </div>
  )
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-semibold text-sm text-[var(--text-primary)]">{title}</h3>
      <Link href={href} className="text-xs text-[var(--accent)]">See all</Link>
    </div>
  )
}

function FixtureRow({ fixture }: { fixture: any }) {
  const isCompleted = fixture.status === 'completed'
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-1.5">
        <Badge
          variant={fixture.competition?.competition_type === 'european' ? 'purple' : 'muted'}
          className="text-[9px] px-1.5 py-0"
        >
          {fixture.competition?.short_name}
        </Badge>
        {fixture.round && <span>{fixture.round}</span>}
        {fixture.kickoff_time && <span className="ml-auto">{formatDateTime(fixture.kickoff_time)}</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <TeamCrest team={fixture.home_team} size="xs" />
          <span className="text-xs font-medium text-[var(--text-primary)] truncate">
            {fixture.home_team?.name}
          </span>
        </div>
        <div className="shrink-0 text-center min-w-[48px]">
          {isCompleted ? (
            <span className="font-bold text-sm text-[var(--text-primary)]">
              {fixture.home_score} – {fixture.away_score}
            </span>
          ) : (
            <span className="text-[var(--text-muted)] font-medium text-xs">vs</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <span className="text-xs font-medium text-[var(--text-primary)] truncate text-right">
            {fixture.away_team?.name}
          </span>
          <TeamCrest team={fixture.away_team} size="xs" />
        </div>
      </div>
    </div>
  )
}

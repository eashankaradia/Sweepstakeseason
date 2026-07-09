import { createClient } from '@/lib/supabase/server'
import { getProfile, getActiveLeague, getPlayers, getPlayerScores, getAssignments, getFixtures } from '@/lib/data'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { EmptyState } from '@/components/ui/LoadingSpinner'
import { getOrdinal, formatDateTime } from '@/lib/utils'
import Link from 'next/link'

export default async function DashboardPage() {
  const [profile, league] = await Promise.all([getProfile(), getActiveLeague()])

  if (!league) {
    return (
      <AppShell profile={profile}>
        <EmptyState
          icon="🏆"
          title="No league set up yet"
          description="An admin needs to create the sweepstake league first."
          action={
            profile?.is_admin ? (
              <Link href="/settings/league" className="text-[var(--accent)] text-sm font-medium hover:underline">
                Create a league →
              </Link>
            ) : null
          }
        />
      </AppShell>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [players, playerScores, assignments, recentFixtures, upcomingFixtures] = await Promise.all([
    getPlayers(league.id),
    getPlayerScores(league.id),
    getAssignments(league.id),
    getFixtures(league.id, { status: 'completed', limit: 5 }),
    getFixtures(league.id, { status: 'scheduled', limit: 5 }),
  ])

  const myPlayer = players.find(p => p.user_id === user?.id)
  const myScore = playerScores.find(s => s.player_id === myPlayer?.id)
  const myAssignments = myPlayer ? assignments.filter(a => a.player_id === myPlayer.id) : []
  const myRank = myPlayer ? playerScores.findIndex(s => s.player_id === myPlayer.id) + 1 : null

  const leader = playerScores[0]

  const draftDone = assignments.length > 0

  return (
    <AppShell profile={profile}>
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-[var(--text-primary)]">{league.name}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
          </div>
          <Badge variant={league.status === 'active' ? 'success' : league.status === 'setup' ? 'warning' : 'muted'}>
            {league.status === 'setup' ? 'Setting up' : league.status === 'active' ? 'Active' : 'Complete'}
          </Badge>
        </div>
      </div>

      {myPlayer && (
        <Card className="mb-3 bg-gradient-to-br from-[var(--accent)]/20 to-[var(--bg-card)] border-[var(--accent)]/30">
          <div className="flex items-center gap-3">
            <Avatar name={myPlayer.name} color={myPlayer.color} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--text-primary)]">{myPlayer.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">Your position</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-[var(--text-primary)]">
                {myRank ? getOrdinal(myRank) : '—'}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {myScore?.total_points ?? 0} pts
              </div>
            </div>
          </div>
          {myAssignments.length > 0 && (
            <div className="mt-3 flex gap-1.5 flex-wrap">
              {myAssignments.map(a => (
                <TeamCrest key={a.id} team={(a as any).team} size="sm" />
              ))}
            </div>
          )}
        </Card>
      )}

      {leader && (leader as any).player && (
        <Card className="mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
              1
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--text-secondary)] mb-0.5">League leader</p>
              <p className="font-semibold text-[var(--text-primary)] truncate">
                {(leader as any).player?.name}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-[var(--text-primary)]">{leader.total_points} pts</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {leader.wins}W {leader.draws}D {leader.losses}L
              </p>
            </div>
          </div>
        </Card>
      )}

      {draftDone ? (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Card className="text-center py-3">
            <div className="text-xl font-bold text-[var(--text-primary)]">{players.length}</div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Players</div>
          </Card>
          <Card className="text-center py-3">
            <div className="text-xl font-bold text-[var(--text-primary)]">{assignments.length}</div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Teams drawn</div>
          </Card>
          <Card className="text-center py-3">
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {recentFixtures.filter(f => f.status === 'completed').length}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">Results</div>
          </Card>
        </div>
      ) : (
        <Card className="mb-4 border-dashed border-[var(--accent)]/30">
          <div className="text-center py-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">Draft pending</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {league.draft_locked ? 'Draft is locked' : 'Admin needs to run the draft'}
            </p>
            {profile?.is_admin && !league.draft_locked && (
              <Link href="/draft" className="inline-block mt-2 text-xs text-[var(--accent)] font-medium hover:underline">
                Go to draft room →
              </Link>
            )}
          </div>
        </Card>
      )}

      {recentFixtures.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">Recent results</h3>
            <Link href="/fixtures?status=completed" className="text-xs text-[var(--accent)]">See all</Link>
          </div>
          <div className="space-y-2">
            {recentFixtures.slice(0, 3).map(f => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </div>
        </div>
      )}

      {upcomingFixtures.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">Upcoming</h3>
            <Link href="/fixtures" className="text-xs text-[var(--accent)]">See all</Link>
          </div>
          <div className="space-y-2">
            {upcomingFixtures.slice(0, 3).map(f => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </div>
        </div>
      )}

      {recentFixtures.length === 0 && upcomingFixtures.length === 0 && draftDone && (
        <Card>
          <EmptyState
            icon="📅"
            title="No fixtures yet"
            description="Add fixtures in the settings to start tracking results."
          />
        </Card>
      )}
    </AppShell>
  )
}

function FixtureRow({ fixture }: { fixture: any }) {
  const isCompleted = fixture.status === 'completed'
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1.5">
        <span>{fixture.competition?.short_name}</span>
        {fixture.round && <span>· {fixture.round}</span>}
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
            <span className="text-[var(--text-muted)] font-medium">vs</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <span className="text-xs font-medium text-[var(--text-primary)] truncate text-right">
            {fixture.away_team?.name}
          </span>
          <TeamCrest team={fixture.away_team} size="xs" />
        </div>
      </div>
    </Card>
  )
}

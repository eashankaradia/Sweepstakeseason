import { cookies } from 'next/headers'
import { getLeagueById, getPlayers, getPlayerScores, getAssignments } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/LoadingSpinner'

export default async function StandingsPage() {
  const cookieStore = await cookies()
  const leagueId = cookieStore.get('ss_league')?.value
  const league = leagueId ? await getLeagueById(leagueId) : null

  if (!league) {
    return (
      <AppShell title="Standings">
        <EmptyState icon="🏆" title="No league yet" description="Set up a league to see standings." />
      </AppShell>
    )
  }

  const supabase = await createClient()
  const { data: authUser } = await supabase.auth.getUser()

  const [players, playerScores, assignments] = await Promise.all([
    getPlayers(league.id),
    getPlayerScores(league.id),
    getAssignments(league.id),
  ])

  const standings = players.map(player => {
    const score = playerScores.find(s => s.player_id === player.id)
    const teams = assignments.filter(a => a.player_id === player.id).map(a => (a as any).team).filter(Boolean)
    return {
      player,
      score,
      teams,
      totalPoints: score?.total_points ?? 0,
      wins: score?.wins ?? 0,
      draws: score?.draws ?? 0,
      losses: score?.losses ?? 0,
      played: score?.matches_played ?? 0,
    }
  }).sort((a, b) => b.totalPoints - a.totalPoints)

  const hasDraft = assignments.length > 0
  const myUserId = authUser?.user?.id

  return (
    <AppShell title="Standings">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[var(--text-secondary)]">{league.season}</p>
        <Badge variant={league.status === 'active' ? 'success' : 'warning'}>
          {league.status === 'active' ? 'Active' : league.status === 'setup' ? 'Setting up' : league.status}
        </Badge>
      </div>

      {standings.length === 0 ? (
        <EmptyState icon="👥" title="No players yet" description="Add players in the settings to see standings." />
      ) : (
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[28px_1fr_28px_28px_28px_36px] items-center gap-1 px-3 py-2 bg-[var(--bg-card)] border-b border-[var(--border)]">
            <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">#</span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium">Player</span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">W</span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">D</span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium text-center">L</span>
            <span className="text-[10px] text-[var(--text-muted)] font-medium text-right">Pts</span>
          </div>

          {/* Rows */}
          <div>
            {standings.map((entry, idx) => {
              const isMe = entry.player.user_id === myUserId
              const posColor =
                idx === 0 ? 'text-amber-400' :
                idx === 1 ? 'text-slate-400' :
                idx === 2 ? 'text-orange-500' :
                'text-[var(--text-muted)]'
              const posBg =
                idx === 0 ? 'bg-amber-500/10' :
                idx === 1 ? 'bg-slate-400/10' :
                idx === 2 ? 'bg-orange-500/10' :
                ''

              return (
                <div
                  key={entry.player.id}
                  className={[
                    'border-b border-[var(--border)] last:border-0',
                    isMe ? 'bg-[var(--accent)]/5' : 'bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]',
                  ].join(' ')}
                >
                  <div className="grid grid-cols-[28px_1fr_28px_28px_28px_36px] items-center gap-1 px-3 py-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${posBg} ${posColor}`}>
                      {idx + 1}
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={entry.player.name} color={entry.player.color} size="sm" />
                      <div className="min-w-0">
                        <span className="font-medium text-sm text-[var(--text-primary)] truncate block">
                          {entry.player.name}
                          {isMe && <span className="ml-1 text-[9px] text-[var(--accent)] font-semibold uppercase tracking-wide">You</span>}
                        </span>
                        {!hasDraft && (
                          <span className="text-[10px] text-[var(--text-muted)]">Draft pending</span>
                        )}
                      </div>
                    </div>

                    <span className="text-xs text-emerald-400 font-medium text-center">{hasDraft ? entry.wins : '—'}</span>
                    <span className="text-xs text-amber-400 font-medium text-center">{hasDraft ? entry.draws : '—'}</span>
                    <span className="text-xs text-red-400 font-medium text-center">{hasDraft ? entry.losses : '—'}</span>
                    <span className="text-sm font-bold text-[var(--text-primary)] text-right">{entry.totalPoints}</span>
                  </div>

                  {entry.teams.length > 0 && (
                    <div className="px-3 pb-2.5 flex gap-1 flex-wrap">
                      {entry.teams.map((team: any) => (
                        <TeamCrest key={team.id} team={team} size="xs" />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </AppShell>
  )
}

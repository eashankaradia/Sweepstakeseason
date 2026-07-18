'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { TeamCrest } from '@/components/ui/TeamCrest'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import { CompetitionBadge } from '@/components/ui/CompetitionBadge'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

export default function TeamDetailPage({ params }: { params: { id: string } }) {
  const [team, setTeam] = useState<any>(null)
  const [owners, setOwners] = useState<any[]>([])
  const [teamScore, setTeamScore] = useState<any>(null)
  const [fixtures, setFixtures] = useState<any[]>([])
  const [competitions, setCompetitions] = useState<any[]>([])
  const [espnTeam, setEspnTeam] = useState<any>(null)
  const [espnNews, setEspnNews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { load() }, [params.id])

  async function load() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }

    const { data: t } = await supabase.from('teams').select('*').eq('id', params.id).maybeSingle()
    if (!t) { setLoading(false); return }
    setTeam(t)

    const [{ data: assignments }, { data: score }, { data: fix }, { data: tc }] = await Promise.all([
      supabase.from('player_team_assignments')
        .select('players(id,name,color,user_id)')
        .eq('league_id', leagueId)
        .eq('team_id', params.id),
      supabase.from('team_scores')
        .select('*')
        .eq('league_id', leagueId)
        .eq('team_id', params.id)
        .maybeSingle(),
      supabase.from('fixtures')
        .select(`*, competition:competitions(*), home_team:teams!fixtures_home_team_id_fkey(*), away_team:teams!fixtures_away_team_id_fkey(*)`)
        .eq('league_id', leagueId)
        .or(`home_team_id.eq.${params.id},away_team_id.eq.${params.id}`)
        .order('kickoff_time', { ascending: false })
        .limit(20),
      supabase.from('team_competitions')
        .select('competitions(*)')
        .eq('league_id', leagueId)
        .eq('team_id', params.id),
    ])

    setOwners(((assignments ?? []) as any[]).map((a: any) => a.players).filter(Boolean))
    setTeamScore(score)
    setFixtures((fix ?? []) as any[])
    setCompetitions((tc ?? []).map((r: any) => r.competitions).filter(Boolean))

    // ESPN data if available
    if (t.espn_team_id) {
      const domesticComp = ((tc ?? []) as any[])
        .map((r: any) => r.competitions)
        .find((c: any) => c?.competition_type === 'domestic_league' && c?.espn_slug)
      if (domesticComp?.espn_slug) {
        fetchESPN(domesticComp.espn_slug, t.espn_team_id)
      }
    }

    setLoading(false)
  }

  async function fetchESPN(slug: string, espnTeamId: string) {
    try {
      const [teamRes, newsRes] = await Promise.all([
        fetch(`${ESPN_BASE}/${slug}/teams/${espnTeamId}`),
        fetch(`${ESPN_BASE}/${slug}/news?team=${espnTeamId}&limit=5`),
      ])
      if (teamRes.ok) {
        const td = await teamRes.json()
        setEspnTeam(td.team)
      }
      if (newsRes.ok) {
        const nd = await newsRes.json()
        setEspnNews(nd.articles ?? [])
      }
    } catch { /* ignore */ }
  }

  if (loading) return <AppShell title="Team" backHref="/teams"><PageLoader /></AppShell>
  if (!team) return <AppShell title="Team" backHref="/teams"><EmptyState icon="⚽" title="Team not found" /></AppShell>

  const recentResults = fixtures.filter(f => f.status === 'completed').slice(0, 5)
  const upcoming = fixtures.filter(f => f.status === 'scheduled' || f.status === 'live').reverse().slice(0, 5)
  const form = recentResults.map(f => {
    const isHome = f.home_team_id === params.id
    const myScore = isHome ? f.home_score : f.away_score
    const oppScore = isHome ? f.away_score : f.home_score
    if (myScore > oppScore) return 'W'
    if (myScore === oppScore) return 'D'
    return 'L'
  }).reverse()

  const espnRecord = espnTeam?.record?.items?.find((r: any) => r.type === 'total') ??
    espnTeam?.record?.items?.[0]

  return (
    <AppShell title={team.short_name || team.name} backHref="/teams">
      {/* Team hero */}
      <div
        className="rounded-2xl p-4 mb-3 border flex items-center gap-4"
        style={{ borderColor: `${team.primary_color}30`, background: `${team.primary_color}10` }}
      >
        <TeamCrest team={team} size="xl" />
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-[var(--text-primary)] truncate">{team.name}</h2>
          <p className="text-xs text-[var(--text-secondary)]">{team.country}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {competitions.map((c: any) => (
              <CompetitionBadge
                key={c.id}
                name={c.name}
                shortName={c.short_name}
                type={c.competition_type}
              />
            ))}
            {team.league_position && (
              <Badge variant="muted" className="text-[9px]">
                #{team.league_position}
              </Badge>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-black text-[var(--text-primary)]">{teamScore?.total_points ?? 0}</p>
          <p className="text-[10px] text-[var(--text-secondary)]">pts</p>
        </div>
      </div>

      {/* Owners */}
      {owners.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide font-medium">
              Sweepstake Owner{owners.length > 1 ? 's' : ''}
            </p>
            {teamScore && teamScore.matches_played > 0 && (
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-emerald-400 font-medium">{teamScore.wins}W</span>
                <span className="text-amber-400 font-medium">{teamScore.draws}D</span>
                <span className="text-red-400 font-medium">{teamScore.losses}L</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {owners.map((o: any) => (
              <Link key={o.id} href={`/players/${o.id}`} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                <Avatar name={o.name} color={o.color} size="sm" />
                <span className="font-semibold text-sm text-[var(--text-primary)]">{o.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      {form.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 mb-3">
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Form</p>
          <div className="flex items-center gap-1.5">
            {form.map((r, i) => (
              <div
                key={i}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  r === 'W' ? 'bg-emerald-500/20 text-emerald-400' :
                  r === 'D' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400'
                }`}
              >
                {r}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Season stats */}
      {teamScore && (
        <div className="mb-3">
          <div className="grid grid-cols-4 gap-2 mb-2">
            {[
              { label: 'Pts', value: teamScore.total_points, color: 'text-[var(--text-primary)]' },
              { label: 'W', value: teamScore.wins, color: 'text-emerald-400' },
              { label: 'D', value: teamScore.draws, color: 'text-amber-400' },
              { label: 'L', value: teamScore.losses, color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-center py-3">
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {/* GF / GA / GD row */}
          {(teamScore.goals_for > 0 || teamScore.goals_against > 0) && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'GF', value: teamScore.goals_for ?? 0, color: 'text-[var(--text-secondary)]' },
                { label: 'GA', value: teamScore.goals_against ?? 0, color: 'text-[var(--text-secondary)]' },
                {
                  label: 'GD',
                  value: (teamScore.goals_for ?? 0) - (teamScore.goals_against ?? 0),
                  color: (teamScore.goals_for ?? 0) - (teamScore.goals_against ?? 0) > 0 ? 'text-emerald-400' : (teamScore.goals_for ?? 0) - (teamScore.goals_against ?? 0) < 0 ? 'text-red-400' : 'text-[var(--text-muted)]',
                },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-center py-2.5">
                  <p className={`text-base font-bold ${s.color}`}>{s.value > 0 ? `+${s.value}` : s.value}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ESPN record (if available) */}
      {espnRecord && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 mb-3 flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)]">Season record</span>
          <span className="text-xs font-semibold text-[var(--text-primary)] ml-auto">{espnRecord.summary}</span>
        </div>
      )}

      {/* Upcoming fixtures */}
      {upcoming.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Upcoming</p>
          <div className="space-y-2">
            {upcoming.map(f => <FixtureRow key={f.id} fixture={f} teamId={params.id} />)}
          </div>
        </div>
      )}

      {/* Recent results */}
      {recentResults.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Recent results</p>
          <div className="space-y-2">
            {recentResults.map(f => <FixtureRow key={f.id} fixture={f} teamId={params.id} />)}
          </div>
        </div>
      )}

      {/* ESPN News */}
      {espnNews.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Latest News</p>
          <div className="space-y-2">
            {espnNews.map((article: any, i: number) => (
              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                {article.images?.[0]?.url && (
                  <img
                    src={article.images[0].url}
                    alt=""
                    className="w-full h-28 object-cover rounded-lg mb-2"
                  />
                )}
                <p className="text-xs font-semibold text-[var(--text-primary)] leading-snug">{article.headline}</p>
                {article.description && (
                  <p className="text-[10px] text-[var(--text-secondary)] mt-1 line-clamp-2">{article.description}</p>
                )}
                <p className="text-[9px] text-[var(--text-muted)] mt-1.5">{article.published ? new Date(article.published).toLocaleDateString('en-GB') : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  )
}

function FixtureRow({ fixture, teamId }: { fixture: any; teamId: string }) {
  const isHome = fixture.home_team_id === teamId
  const myTeam = isHome ? fixture.home_team : fixture.away_team
  const oppTeam = isHome ? fixture.away_team : fixture.home_team
  const myScore = isHome ? fixture.home_score : fixture.away_score
  const oppScore = isHome ? fixture.away_score : fixture.home_score
  const isCompleted = fixture.status === 'completed'
  const isLive = fixture.status === 'live'

  let resultColor = ''
  if (isCompleted && myScore != null && oppScore != null) {
    resultColor = myScore > oppScore ? 'text-emerald-400' : myScore === oppScore ? 'text-amber-400' : 'text-red-400'
  }

  return (
    <Link href={`/fixtures/${fixture.id}`}>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 flex items-center gap-2 hover:border-[var(--accent)]/40 transition-colors">
        {fixture.competition && (
          <CompetitionBadge
            shortName={(fixture.competition as any).short_name}
            name={(fixture.competition as any).name}
            type={(fixture.competition as any).competition_type}
          />
        )}
        <span className="text-xs text-[var(--text-secondary)] flex-1 truncate">
          {isHome ? 'vs' : '@'} {oppTeam?.name}
        </span>
        {isLive && <Badge variant="danger" className="text-[9px]">LIVE</Badge>}
        {isCompleted && myScore != null ? (
          <span className={`text-xs font-bold shrink-0 ${resultColor}`}>
            {myScore}–{oppScore}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)] shrink-0">
            {fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
          </span>
        )}
      </div>
    </Link>
  )
}

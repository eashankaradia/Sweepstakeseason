import type { Competition, Team } from './supabase/types'

export const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

export const ESPN_LEAGUE_SLUGS: Record<string, string> = {
  PL: 'eng.1',
  LL: 'esp.1',
  SA: 'ita.1',
  UCL: 'uefa.champions',
  UEL: 'uefa.europa',
  ECL: 'uefa.europa.conf',
  FA: 'eng.fa',
  EFL: 'eng.league_cup',
  CDR: 'esp.copa_del_rey',
  CIT: 'ita.coppa_italia',
}

const TEAM_ALIASES: Record<string, string> = {
  'athletic club': 'athletic bilbao',
  'atletico madrid': 'atlético madrid',
  'internazionale': 'inter milan',
  'internazionale milano': 'inter milan',
  'manchester united': 'manchester united',
  'manchester city': 'manchester city',
  'newcastle united': 'newcastle united',
  'nottingham forest': 'nottingham forest',
  'tottenham hotspur': 'tottenham hotspur',
  'brighton & hove albion': 'brighton & hove albion',
  'brighton and hove albion': 'brighton & hove albion',
  'wolverhampton wanderers': 'wolverhampton wanderers',
  'wolves': 'wolverhampton wanderers',
  'bayer leverkusen': 'bayer leverkusen',
  'borussia dortmund': 'borussia dortmund',
  'bayern munich': 'bayern munich',
  'rb leipzig': 'rb leipzig',
  'sc freiburg': 'sc freiburg',
  'vfb stuttgart': 'vfb stuttgart',
}

type EspnEvent = {
  id: string
  name?: string
  date?: string
  status?: { type?: { name?: string; state?: string; completed?: boolean } }
  season?: { year?: number; slug?: string }
  competitions?: Array<{
    id: string
    competitors?: Array<{
      homeAway?: 'home' | 'away'
      score?: string
      team?: {
        id?: string
        displayName?: string
        shortDisplayName?: string
        abbreviation?: string
      }
    }>
  }>
}

export type ImportedFixture = {
  competition_id: string
  home_team_id: string
  away_team_id: string
  kickoff_time: string | null
  status: 'scheduled' | 'live' | 'completed' | 'postponed'
  home_score: number | null
  away_score: number | null
  round: string | null
  matchday: number | null
  external_id: string
}

export type EspnStandingEntry = {
  espnTeamId: string
  teamName: string
  position: number
  played: number
  wins: number
  draws: number
  losses: number
  points: number
}

export type EspnMatchEvent = {
  minute: string
  type: 'goal' | 'yellow_card' | 'red_card' | 'substitution' | 'own_goal' | 'var' | 'other'
  text: string
  teamId: string | null
  period: number
}

export type EspnNewsItem = {
  headline: string
  description: string
  published: string
  link: string
}

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/\b(fc|cf|afc|ac|ssc|1907)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function teamKeys(team: Team): string[] {
  const values = [team.name, team.short_name]
  return values.map(normalize).filter(Boolean)
}

function findTeam(espnTeam: NonNullable<EspnEvent['competitions']>[number]['competitors'][number]['team'], teams: Team[]): Team | null {
  const candidates = [
    espnTeam?.displayName,
    espnTeam?.shortDisplayName,
    espnTeam?.abbreviation,
  ].map(normalize).filter(Boolean)

  for (const candidate of candidates) {
    const alias = TEAM_ALIASES[candidate] ?? candidate
    const exact = teams.find(team => teamKeys(team).some(key => key === alias || key === candidate))
    if (exact) return exact
  }

  for (const candidate of candidates) {
    const alias = TEAM_ALIASES[candidate] ?? candidate
    const fuzzy = teams.find(team => teamKeys(team).some(key => key.includes(alias) || alias.includes(key)))
    if (fuzzy) return fuzzy
  }

  return null
}

function mapStatus(event: EspnEvent): ImportedFixture['status'] {
  const state = event.status?.type?.state?.toLowerCase()
  const name = event.status?.type?.name?.toLowerCase()
  if (event.status?.type?.completed || state === 'post') return 'completed'
  if (state === 'in') return 'live'
  if (name?.includes('postponed')) return 'postponed'
  return 'scheduled'
}

export async function fetchEspnFixturesForCompetition(
  competition: Competition,
  teams: Team[],
  dates: string,
): Promise<{ fixtures: ImportedFixture[]; skipped: string[] }> {
  const slug = ESPN_LEAGUE_SLUGS[competition.short_name]
  if (!slug) return { fixtures: [], skipped: [`No ESPN slug for ${competition.short_name}`] }

  const url = `${ESPN_BASE}/${slug}/scoreboard?dates=${dates}&limit=500`
  const response = await fetch(url, { next: { revalidate: 60 * 60 } })
  if (!response.ok) return { fixtures: [], skipped: [`${competition.short_name}: ESPN returned ${response.status}`] }

  const payload = await response.json() as { events?: EspnEvent[] }
  const fixtures: ImportedFixture[] = []
  const skipped: string[] = []

  for (const event of payload.events ?? []) {
    const comp = event.competitions?.[0]
    const home = comp?.competitors?.find(c => c.homeAway === 'home')
    const away = comp?.competitors?.find(c => c.homeAway === 'away')
    const homeTeam = findTeam(home?.team, teams)
    const awayTeam = findTeam(away?.team, teams)

    if (!homeTeam || !awayTeam) {
      skipped.push(`${competition.short_name}: ${event.name ?? event.id}`)
      continue
    }

    const status = mapStatus(event)
    fixtures.push({
      competition_id: competition.id,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      kickoff_time: event.date ?? null,
      status,
      home_score: status === 'completed' ? Number.parseInt(home?.score ?? '', 10) || 0 : null,
      away_score: status === 'completed' ? Number.parseInt(away?.score ?? '', 10) || 0 : null,
      round: event.season?.slug ?? null,
      matchday: null,
      external_id: `espn:${slug}:${event.id}`,
    })
  }

  return { fixtures, skipped }
}

// Fetch league table positions from ESPN
export async function fetchEspnStandings(slug: string): Promise<EspnStandingEntry[]> {
  try {
    const url = `${ESPN_BASE}/${slug}/standings`
    const res = await fetch(url, { next: { revalidate: 60 * 60 } })
    if (!res.ok) return []
    const data = await res.json()
    const entries: EspnStandingEntry[] = []
    const groups = data?.standings?.entries ?? data?.children?.[0]?.standings?.entries ?? []
    for (const entry of groups) {
      const teamId = entry.team?.id ?? ''
      const teamName = entry.team?.displayName ?? ''
      const stats: Record<string, number> = {}
      for (const s of (entry.stats ?? [])) {
        stats[s.name] = Number(s.value ?? 0)
      }
      entries.push({
        espnTeamId: String(teamId),
        teamName,
        position: stats.rank ?? stats.position ?? entries.length + 1,
        played: stats.gamesPlayed ?? 0,
        wins: stats.wins ?? 0,
        draws: stats.ties ?? stats.draws ?? 0,
        losses: stats.losses ?? 0,
        points: stats.points ?? 0,
      })
    }
    return entries.sort((a, b) => a.position - b.position)
  } catch {
    return []
  }
}

// Parse match events (goals, cards, subs) from ESPN summary play-by-play
export function parseEspnMatchEvents(plays: any[]): EspnMatchEvent[] {
  const events: EspnMatchEvent[] = []
  for (const play of plays ?? []) {
    const typeText = (play.type?.text ?? play.type?.name ?? '').toLowerCase()
    const minute = play.clock?.displayValue ?? ''
    const text = play.text ?? play.participants?.[0]?.athlete?.displayName ?? ''
    const teamId = play.team?.id ? String(play.team.id) : null
    const period = play.period?.number ?? 1

    let type: EspnMatchEvent['type'] = 'other'
    if (typeText.includes('goal') && typeText.includes('own')) type = 'own_goal'
    else if (typeText.includes('goal') || play.scoreValue > 0) type = 'goal'
    else if (typeText.includes('red card') || typeText.includes('red')) type = 'red_card'
    else if (typeText.includes('yellow card') || typeText.includes('yellow')) type = 'yellow_card'
    else if (typeText.includes('substitut') || typeText.includes('sub')) type = 'substitution'
    else if (typeText.includes('var')) type = 'var'
    else continue

    events.push({ minute, type, text, teamId, period })
  }
  return events
}

// Fetch latest news for a team from ESPN
export async function fetchEspnTeamNews(espnTeamId: string): Promise<EspnNewsItem[]> {
  try {
    const url = `${ESPN_BASE}/news?team=${espnTeamId}&limit=5`
    const res = await fetch(url, { next: { revalidate: 30 * 60 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.articles ?? []).slice(0, 5).map((a: any) => ({
      headline: a.headline ?? '',
      description: a.description ?? '',
      published: a.published ?? '',
      link: a.links?.web?.href ?? '',
    }))
  } catch {
    return []
  }
}

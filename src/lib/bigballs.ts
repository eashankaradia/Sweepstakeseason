// Shared helpers for talking to the BigBallsData sports API.
export const BBS_BASE = 'https://api.bigballsdata.com/v1'

// ESPN slug (used elsewhere in the app) → BigBallsData league key
export const ESPN_TO_BBS: Record<string, string> = {
  'eng.1': 'epl',
  'esp.1': 'laliga',
  'ger.1': 'bundesliga',
  'fra.1': 'ligue1',
  'ita.1': 'seriea',
  'uefa.champions': 'ucl',
}

export function normTeamName(s: string): string {
  return s.toLowerCase()
    .replace(/\s+f\.?c\.?$/i, '')
    .replace(/\s+a\.?f\.?c\.?$/i, '')
    .replace(/&/g, 'and')
    .trim()
}

export function teamNameMatches(dbName: string, bbsName: string): boolean {
  const a = normTeamName(dbName), b = normTeamName(bbsName)
  return a === b || a.includes(b) || b.includes(a)
}

export function bbsHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

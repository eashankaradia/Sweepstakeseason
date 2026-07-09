export function getLeagueIdCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)ss_league=([^;]*)/)
  return m ? decodeURIComponent(m[1]) : null
}

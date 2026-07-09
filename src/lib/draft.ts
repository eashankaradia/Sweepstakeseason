import type { Team } from './supabase/types'

export interface DraftPlayer {
  id: string
  name: string
  color: string
}

export interface DraftTeam extends Team {
  quality: number      // 0 = best, 1 = worst (normalised league position)
  isEuropean: boolean
}

export interface DraftAllocation {
  playerId: string
  playerName: string
  teams: DraftTeam[]
  europeanCount: number
  avgPosition: number | null   // average last-season league_position; null if no data yet
  tier1Count: number
  tier2Count: number
}

export interface DraftValidation {
  valid: boolean
  warnings: string[]
  errors: string[]
  europeanDistribution: { min: number; max: number; spread: number }
  tierDistribution: Record<number, { min: number; max: number }>
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * runDraft — fair allocation using league position + snake draft + EU parity.
 *
 * @param players        - All players in randomised draft order (caller shuffles).
 * @param rawTeams       - All eligible teams. Must include `league_position`.
 * @param europeanTeamIds - IDs of teams that play in UCL / UEL / ECL this season.
 * @param leagueSizeMap  - Maps teamId → number of teams in that team's domestic league
 *                         (used to normalise positions across PL/LL/BL/SA).
 * @param teamsPerPlayer - Override; defaults to floor(teams / players).
 */
export function runDraft(
  players: DraftPlayer[],
  rawTeams: Array<Team & { league_position?: number | null }>,
  europeanTeamIds: Set<string>,
  leagueSizeMap?: Map<string, number>,
  teamsPerPlayer?: number
): DraftAllocation[] {
  const N = players.length
  const tpp = teamsPerPlayer ?? Math.floor(rawTeams.length / N)

  if (tpp < 1) throw new Error(`Not enough teams for ${N} players (have ${rawTeams.length})`)
  if (rawTeams.length < N * tpp) throw new Error(`Need ≥${N * tpp} teams, got ${rawTeams.length}`)

  // Attach quality score to every team
  const teams: DraftTeam[] = rawTeams.map(t => {
    const size = leagueSizeMap?.get(t.id) ?? 20
    const quality = t.league_position != null ? t.league_position / size : 1.0
    return { ...t, quality, isEuropean: europeanTeamIds.has(t.id) }
  })

  // Sort pools best-first (lowest quality number = best finishing position)
  const euPool = teams.filter(t => europeanTeamIds.has(t.id)).sort((a, b) => a.quality - b.quality)
  const domPool = teams.filter(t => !europeanTeamIds.has(t.id)).sort((a, b) => a.quality - b.quality)

  // EU parity: euBase rounds (all players) + partial extra round
  const totalEu = euPool.length
  const euBase = Math.floor(totalEu / N)
  const euExtra = totalEu % N   // this many players get one additional EU team

  // Random draft order (snake will reverse on even rounds)
  const order = shuffle([...Array(N).keys()])  // indices into `players`

  type Slot = { idx: number; teams: DraftTeam[]; euCount: number }
  const slots: Slot[] = order.map(idx => ({ idx, teams: [], euCount: 0 }))

  // ── Phase 1: EU teams ───────────────────────────────────────────────────────
  // euBase full snake rounds first
  let ei = 0
  for (let round = 0; round < euBase; round++) {
    const picks = round % 2 === 0 ? slots : [...slots].reverse()
    for (const s of picks) {
      if (ei < euPool.length) { s.teams.push(euPool[ei++]); s.euCount++ }
    }
  }

  // Extra EU picks go to players who drafted LAST in round 1 (they got the worst
  // picks in round 1 of EU, so giving them the extra EU slot is fair compensation).
  // "Last in round 1" = highest index in `order` array (slots at the end).
  if (euExtra > 0) {
    // In round 1 (forward order), slots[0] picked first, slots[N-1] picked last.
    // Give extra EU to the last `euExtra` slots in the original round-1 order.
    const extraRecipients = slots.slice(N - euExtra)
    for (const s of extraRecipients) {
      if (ei < euPool.length) { s.teams.push(euPool[ei++]); s.euCount++ }
    }
  }

  // ── Phase 2: Domestic teams ─────────────────────────────────────────────────
  // Compensation: players with FEWER EU teams pick FIRST in domestic rounds.
  // Within each EU-count group maintain the original snake direction.
  const domOrder = [
    ...slots.filter(s => s.euCount <= euBase).sort((a, b) => a.idx - b.idx),
    ...slots.filter(s => s.euCount > euBase).sort((a, b) => a.idx - b.idx),
  ]

  let di = 0
  let domRound = 0
  while (di < domPool.length) {
    const picks = domRound % 2 === 0 ? domOrder : [...domOrder].reverse()
    let anyPicked = false
    for (const s of picks) {
      if (s.teams.length < tpp && di < domPool.length) {
        s.teams.push(domPool[di++])
        anyPicked = true
      }
    }
    if (!anyPicked) break
    domRound++
  }

  // ── Return in original player order ────────────────────────────────────────
  return players.map(p => {
    const slot = slots.find(s => players[s.idx].id === p.id)!
    const positions = slot.teams.map(t => t.league_position).filter((v): v is number => v != null)
    const avgPosition = positions.length > 0
      ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
      : null
    return {
      playerId: p.id,
      playerName: p.name,
      teams: slot.teams,
      europeanCount: slot.euCount,
      avgPosition,
      tier1Count: slot.teams.filter(t => t.tier === 1).length,
      tier2Count: slot.teams.filter(t => t.tier === 2).length,
    }
  })
}

export function validateDraft(
  allocations: DraftAllocation[],
  teamsPerPlayer?: number
): DraftValidation {
  const tpp = teamsPerPlayer ?? allocations[0]?.teams.length ?? 5
  const errors: string[] = []
  const warnings: string[] = []

  for (const a of allocations) {
    if (a.teams.length !== tpp) errors.push(`${a.playerName} has ${a.teams.length} teams (expected ${tpp})`)
  }

  const seen = new Set<string>()
  for (const id of allocations.flatMap(a => a.teams.map(t => t.id))) {
    if (seen.has(id)) errors.push(`Team ${id} duplicated`)
    seen.add(id)
  }

  const euCounts = allocations.map(a => a.europeanCount)
  const minEu = Math.min(...euCounts), maxEu = Math.max(...euCounts)
  if (maxEu - minEu > 1) warnings.push(`EU spread ${maxEu - minEu} (min ${minEu}, max ${maxEu}) — aim for ≤1`)

  const t1s = allocations.map(a => a.tier1Count)
  const minT1 = Math.min(...t1s), maxT1 = Math.max(...t1s)
  if (maxT1 - minT1 > 2) warnings.push(`Elite-team spread high: ${minT1}–${maxT1} per player`)

  const avgs = allocations.map(a => a.avgPosition ?? 999)
  const minAvg = Math.min(...avgs), maxAvg = Math.max(...avgs)
  if (maxAvg - minAvg > 5 && minAvg < 900) {
    warnings.push(`Avg position spread: best ${minAvg.toFixed(1)}, worst ${maxAvg.toFixed(1)}`)
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    europeanDistribution: { min: minEu, max: maxEu, spread: maxEu - minEu },
    tierDistribution: { 1: { min: minT1, max: maxT1 } },
  }
}

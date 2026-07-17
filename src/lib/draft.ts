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
 * runDraft — fair team allocation with optional co-ownership.
 *
 * K=1 (default): snake draft with EU parity across all players.
 * K>1: tier-based allocation. Teams are sorted best→worst, split into
 *   tpp tiers of (N/K) teams each. Each tier produces N slots (K copies
 *   of each team), shuffled then snake-distributed so every player gets
 *   exactly one team per tier. Result: each player owns tpp teams and
 *   each team has exactly K owners.
 *
 * @param players          - All players in the league.
 * @param rawTeams         - All eligible teams (must include `league_position`).
 * @param europeanTeamIds  - IDs of teams playing in UCL/UEL/ECL.
 * @param leagueSizeMap    - Maps teamId → domestic league size (for quality normalisation).
 * @param teamsPerPlayer   - Override computed tpp.
 * @param ownersPerTeam    - Co-owners per team (1 = exclusive, 2–3 = shared). Default 1.
 */
export function runDraft(
  players: DraftPlayer[],
  rawTeams: Array<Team & { league_position?: number | null }>,
  europeanTeamIds: Set<string>,
  leagueSizeMap?: Map<string, number>,
  teamsPerPlayer?: number,
  ownersPerTeam: number = 1,
): DraftAllocation[] {
  const N = players.length
  const K = ownersPerTeam

  if (K < 1 || !Number.isInteger(K)) throw new Error('ownersPerTeam must be a positive integer')
  if (N < 2) throw new Error('Need at least 2 players')
  if (rawTeams.length === 0) throw new Error('No teams provided')

  // Attach quality score
  const teams: DraftTeam[] = rawTeams.map(t => {
    const size = leagueSizeMap?.get(t.id) ?? 20
    const quality = t.league_position != null ? t.league_position / size : 1.0
    return { ...t, quality, isEuropean: europeanTeamIds.has(t.id) }
  })

  // ── K = 1: existing snake draft with EU parity ──────────────────────────────
  if (K === 1) {
    const tpp = teamsPerPlayer ?? Math.floor(rawTeams.length / N)
    if (tpp < 1) throw new Error(`Not enough teams for ${N} players (have ${rawTeams.length})`)
    if (rawTeams.length < N * tpp) throw new Error(`Need ≥${N * tpp} teams, got ${rawTeams.length}`)

    const euPool = teams.filter(t => europeanTeamIds.has(t.id)).sort((a, b) => a.quality - b.quality)
    const domPool = teams.filter(t => !europeanTeamIds.has(t.id)).sort((a, b) => a.quality - b.quality)

    const totalEu = euPool.length
    const euBase = Math.floor(totalEu / N)
    const euExtra = totalEu % N

    const order = shuffle([...Array(N).keys()])

    type Slot = { idx: number; teams: DraftTeam[]; euCount: number }
    const slots: Slot[] = order.map(idx => ({ idx, teams: [], euCount: 0 }))

    let ei = 0
    for (let round = 0; round < euBase; round++) {
      const picks = round % 2 === 0 ? slots : [...slots].reverse()
      for (const s of picks) {
        if (ei < euPool.length) { s.teams.push(euPool[ei++]); s.euCount++ }
      }
    }

    if (euExtra > 0) {
      const extraRecipients = slots.slice(N - euExtra)
      for (const s of extraRecipients) {
        if (ei < euPool.length) { s.teams.push(euPool[ei++]); s.euCount++ }
      }
    }

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

  // ── K > 1: tier-based multi-owner allocation ────────────────────────────────
  // tierSize = N/K players per tier owner group; must divide evenly
  if (N % K !== 0) throw new Error(
    `${N} players can't be evenly divided into groups of ${K} co-owners. ` +
    `Try ${K === 2 ? 'an even number of players' : 'a number of players divisible by ' + K}.`
  )

  const tierSize = N / K  // teams per tier
  const tpp = teamsPerPlayer ?? Math.floor(rawTeams.length * K / N)
  if (tpp < 1) throw new Error(`Not enough teams: need ≥${Math.ceil(N / K)} teams for ${N} players with ${K} owners each`)

  // Sort all teams best→worst
  const sorted = [...teams].sort((a, b) => a.quality - b.quality)

  // Snake draft order (random within each tier, alternating direction per tier)
  const order = shuffle([...Array(N).keys()])
  const playerTeams: DraftTeam[][] = Array.from({ length: N }, () => [])

  for (let tier = 0; tier < tpp; tier++) {
    const tierTeams = sorted.slice(tier * tierSize, (tier + 1) * tierSize)
    if (tierTeams.length === 0) break

    // K copies of each team in this tier → exactly N slots
    const rawSlots: DraftTeam[] = []
    for (const team of tierTeams) {
      for (let k = 0; k < K; k++) rawSlots.push(team)
    }
    const slots = shuffle(rawSlots)

    // Snake: even tiers forward, odd tiers reverse
    const pickOrder = tier % 2 === 0 ? order : [...order].reverse()
    for (let i = 0; i < N && i < slots.length; i++) {
      playerTeams[pickOrder[i]].push(slots[i])
    }
  }

  return players.map((p, idx) => {
    const myTeams = playerTeams[idx]
    const positions = myTeams.map(t => t.league_position).filter((v): v is number => v != null)
    const avgPosition = positions.length > 0
      ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
      : null
    return {
      playerId: p.id,
      playerName: p.name,
      teams: myTeams,
      europeanCount: myTeams.filter(t => europeanTeamIds.has(t.id)).length,
      avgPosition,
      tier1Count: myTeams.filter(t => t.tier === 1).length,
      tier2Count: myTeams.filter(t => t.tier === 2).length,
    }
  })
}

export function validateDraft(
  allocations: DraftAllocation[],
  teamsPerPlayer?: number,
  ownersPerTeam: number = 1,
): DraftValidation {
  const tpp = teamsPerPlayer ?? allocations[0]?.teams.length ?? 5
  const errors: string[] = []
  const warnings: string[] = []

  for (const a of allocations) {
    if (a.teams.length !== tpp) errors.push(`${a.playerName} has ${a.teams.length} teams (expected ${tpp})`)
  }

  if (ownersPerTeam === 1) {
    // Each team must appear exactly once
    const seen = new Set<string>()
    for (const id of allocations.flatMap(a => a.teams.map(t => t.id))) {
      if (seen.has(id)) errors.push(`Team ${id} duplicated`)
      seen.add(id)
    }
  } else {
    // Each team must appear exactly K times
    const teamCount = new Map<string, number>()
    for (const id of allocations.flatMap(a => a.teams.map(t => t.id))) {
      teamCount.set(id, (teamCount.get(id) ?? 0) + 1)
    }
    for (const [id, count] of teamCount) {
      if (count !== ownersPerTeam) warnings.push(`Team ${id} has ${count} owners (expected ${ownersPerTeam})`)
    }
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

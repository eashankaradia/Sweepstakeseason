import type { Team } from './supabase/types'

export interface DraftPlayer {
  id: string
  name: string
  color: string
}

export interface DraftAllocation {
  playerId: string
  playerName: string
  teams: Team[]
  europeanCount: number
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

export function runDraft(
  players: DraftPlayer[],
  teams: Team[],
  europeanTeamIds: Set<string>,
  teamsPerPlayer?: number
): DraftAllocation[] {
  const numPlayers = players.length
  const tpp = teamsPerPlayer ?? Math.floor(teams.length / numPlayers)

  if (tpp < 1) {
    throw new Error(`Not enough teams for ${numPlayers} players (have ${teams.length})`)
  }

  if (teams.length < numPlayers * tpp) {
    throw new Error(`Need at least ${numPlayers * tpp} teams, got ${teams.length}`)
  }

  const europeanTeams = shuffle(teams.filter(t => europeanTeamIds.has(t.id)))
  const nonEuropeanTeams = shuffle(teams.filter(t => !europeanTeamIds.has(t.id)))

  const eu = {
    t1: europeanTeams.filter(t => t.tier === 1),
    t2: europeanTeams.filter(t => t.tier === 2),
    t3: europeanTeams.filter(t => t.tier === 3),
    t4: europeanTeams.filter(t => t.tier === 4),
  }
  const non = {
    t1: nonEuropeanTeams.filter(t => t.tier === 1),
    t2: nonEuropeanTeams.filter(t => t.tier === 2),
    t3: nonEuropeanTeams.filter(t => t.tier === 3),
    t4: nonEuropeanTeams.filter(t => t.tier === 4),
  }

  const allocations: DraftAllocation[] = shuffle(players).map(p => ({
    playerId: p.id,
    playerName: p.name,
    teams: [],
    europeanCount: 0,
    tier1Count: 0,
    tier2Count: 0,
  }))

  const totalEuropean = europeanTeams.length
  const euPerPlayer = Math.floor(totalEuropean / numPlayers)
  const euExtra = totalEuropean % numPlayers

  const euPool: Team[] = []
  while (eu.t1.length || eu.t2.length || eu.t3.length || eu.t4.length) {
    if (eu.t1.length) euPool.push(eu.t1.shift()!)
    if (eu.t2.length) euPool.push(eu.t2.shift()!)
    if (eu.t3.length) euPool.push(eu.t3.shift()!)
    if (eu.t4.length) euPool.push(eu.t4.shift()!)
  }

  let euIdx = 0
  for (let i = 0; i < numPlayers && euIdx < euPool.length; i++) {
    const count = euPerPlayer + (i < euExtra ? 1 : 0)
    for (let j = 0; j < count && euIdx < euPool.length; j++) {
      allocations[i].teams.push(euPool[euIdx++])
      allocations[i].europeanCount++
    }
  }

  const nonPool: Team[] = []
  while (non.t1.length || non.t2.length || non.t3.length || non.t4.length) {
    if (non.t1.length) nonPool.push(non.t1.shift()!)
    if (non.t2.length) nonPool.push(non.t2.shift()!)
    if (non.t3.length) nonPool.push(non.t3.shift()!)
    if (non.t4.length) nonPool.push(non.t4.shift()!)
  }

  let nonIdx = 0
  while (nonIdx < nonPool.length) {
    allocations.sort((a, b) => a.teams.length - b.teams.length)
    const target = allocations[0]
    if (target.teams.length >= tpp) break
    target.teams.push(nonPool[nonIdx++])
  }

  const allRemaining = shuffle([
    ...eu.t1, ...eu.t2, ...eu.t3, ...eu.t4,
    ...non.t1, ...non.t2, ...non.t3, ...non.t4,
  ])
  let remIdx = 0
  for (const alloc of allocations) {
    while (alloc.teams.length < tpp && remIdx < allRemaining.length) {
      alloc.teams.push(allRemaining[remIdx++])
    }
  }

  for (const alloc of allocations) {
    alloc.tier1Count = alloc.teams.filter(t => t.tier === 1).length
    alloc.tier2Count = alloc.teams.filter(t => t.tier === 2).length
  }

  return players.map(p => allocations.find(a => a.playerId === p.id)!)
}

export function validateDraft(
  allocations: DraftAllocation[],
  teamsPerPlayer?: number
): DraftValidation {
  const tpp = teamsPerPlayer ?? allocations[0]?.teams.length ?? 5
  const errors: string[] = []
  const warnings: string[] = []

  for (const alloc of allocations) {
    if (alloc.teams.length !== tpp) {
      errors.push(`${alloc.playerName} has ${alloc.teams.length} teams (expected ${tpp})`)
    }
  }

  const allTeamIds = allocations.flatMap(a => a.teams.map(t => t.id))
  const seen = new Set<string>()
  for (const id of allTeamIds) {
    if (seen.has(id)) errors.push(`Team ${id} is assigned to multiple players`)
    seen.add(id)
  }

  const euCounts = allocations.map(a => a.europeanCount)
  const minEu = Math.min(...euCounts)
  const maxEu = Math.max(...euCounts)
  const euSpread = maxEu - minEu
  if (euSpread > 1) {
    warnings.push(`European team spread is ${euSpread} (min ${minEu}, max ${maxEu}). Aim for max spread of 1.`)
  }

  const t1Counts = allocations.map(a => a.tier1Count)
  const minT1 = Math.min(...t1Counts)
  const maxT1 = Math.max(...t1Counts)
  if (maxT1 - minT1 > 2) {
    warnings.push(`Elite team spread is high (min ${minT1}, max ${maxT1} per player)`)
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    europeanDistribution: { min: minEu, max: maxEu, spread: euSpread },
    tierDistribution: { 1: { min: minT1, max: maxT1 } },
  }
}

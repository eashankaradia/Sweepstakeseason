import type { Fixture, ScoringRule } from './supabase/types'

export interface MatchPoints {
  homePoints: number
  awayPoints: number
}

export function getMatchPoints(fixture: Fixture, rules: ScoringRule[]): MatchPoints {
  if (fixture.status !== 'completed' || fixture.home_score == null || fixture.away_score == null) {
    return { homePoints: 0, awayPoints: 0 }
  }

  const getRule = (key: string) => rules.find(r => r.rule_key === key && r.enabled)?.points ?? 0

  const winPts = getRule('win')
  const drawPts = getRule('draw')

  const h = fixture.home_score
  const a = fixture.away_score

  if (h > a) return { homePoints: winPts, awayPoints: 0 }
  if (a > h) return { homePoints: 0, awayPoints: winPts }
  return { homePoints: drawPts, awayPoints: drawPts }
}

export const DEFAULT_SCORING_RULES = [
  { rule_key: 'win', rule_name: 'Win', description: 'Points for winning a match', points: 3, enabled: true },
  { rule_key: 'draw', rule_name: 'Draw', description: 'Points for drawing a match', points: 1, enabled: true },
  { rule_key: 'loss', rule_name: 'Loss', description: 'Points for losing a match', points: 0, enabled: true },
  { rule_key: 'bonus_cl_winner', rule_name: 'Champions League Winner', description: 'Bonus for winning the Champions League', points: 20, enabled: false },
  { rule_key: 'bonus_el_winner', rule_name: 'Europa League Winner', description: 'Bonus for winning the Europa League', points: 10, enabled: false },
  { rule_key: 'bonus_ecl_winner', rule_name: 'Conference League Winner', description: 'Bonus for winning the Conference League', points: 5, enabled: false },
  { rule_key: 'bonus_domestic_winner', rule_name: 'Domestic League Winner', description: 'Bonus for winning domestic league', points: 15, enabled: false },
  { rule_key: 'bonus_top4', rule_name: 'Top 4 Domestic Finish', description: 'Bonus for top 4 domestic finish', points: 5, enabled: false },
  { rule_key: 'bonus_cl_group', rule_name: 'CL Knockout Stage', description: 'Bonus for reaching CL knockouts', points: 5, enabled: false },
  { rule_key: 'penalty_relegation', rule_name: 'Relegation Penalty', description: 'Points deducted for relegation', points: -5, enabled: false },
]

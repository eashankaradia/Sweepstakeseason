'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'

export default function RulesPage() {
  return (
    <AppShell title="How it works">
      <div className="space-y-4">

        {/* The basics */}
        <RuleSection icon="🏆" title="The basics">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Each player is randomly assigned a set of football clubs at the start of the season. You earn sweepstake points based on how your clubs perform — wins, draws, and losses across all eligible competitions.
          </p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-2">
            The player with the most sweepstake points at the end of the season wins the sweepstake.
          </p>
        </RuleSection>

        {/* Scoring */}
        <RuleSection icon="📊" title="Points per result">
          <div className="grid grid-cols-3 gap-2 mt-1">
            <ScoreBox result="Win" points="+3" color="emerald" />
            <ScoreBox result="Draw" points="+1" color="amber" />
            <ScoreBox result="Loss" points="0" color="red" />
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">
            Points are awarded after each match completes. Postponed or abandoned matches score 0.
          </p>
        </RuleSection>

        {/* Eligible competitions */}
        <RuleSection icon="🌍" title="Which competitions count?">
          <div className="space-y-2 mt-1">
            <div className="flex items-center gap-2.5 rounded-lg bg-[var(--bg)] border border-emerald-500/20 px-3 py-2">
              <span className="text-base">✅</span>
              <div>
                <p className="text-xs font-semibold text-emerald-400">Domestic leagues</p>
                <p className="text-[10px] text-[var(--text-muted)]">Premier League</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg bg-[var(--bg)] border border-emerald-500/20 px-3 py-2">
              <span className="text-base">✅</span>
              <div>
                <p className="text-xs font-semibold text-emerald-400">European competitions</p>
                <p className="text-[10px] text-[var(--text-muted)]">Champions League, Europa League, Conference League</p>
              </div>
            </div>
          </div>
        </RuleSection>

        {/* Team distribution */}
        <RuleSection icon="🎯" title="Team distribution">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Teams are drawn randomly via the draft. Each player receives the same number of clubs.
          </p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-2">
            For European competitions, teams are distributed equally across all players — so no one gets an unfair advantage from having more clubs in the Champions League.
          </p>
        </RuleSection>

        {/* Power-ups */}
        <RuleSection icon="⚡" title="Power-ups">
          <div className="space-y-3 mt-1">

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
              <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className="text-base">⚡</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Double or Nothing</p>
                  <Badge variant="success" className="text-[9px] mt-0.5">1× per calendar month</Badge>
                </div>
              </div>
              <div className="px-3 pb-3 space-y-2">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Pick a calendar month and lock in Double or Nothing for one of your clubs. Every result that club gets in that month is amplified:
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-2 text-center">
                    <p className="text-[10px] font-bold text-emerald-400">Win</p>
                    <p className="text-[13px] font-black text-emerald-400">×2 pts</p>
                    <p className="text-[9px] text-emerald-400/60">= +6</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-2 text-center">
                    <p className="text-[10px] font-bold text-amber-400">Draw</p>
                    <p className="text-[13px] font-black text-amber-400">−1 pt</p>
                    <p className="text-[9px] text-amber-400/60">net</p>
                  </div>
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-2 py-2 text-center">
                    <p className="text-[10px] font-bold text-red-400">Loss</p>
                    <p className="text-[13px] font-black text-red-400">−3 pts</p>
                    <p className="text-[9px] text-red-400/60">net</p>
                  </div>
                </div>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Each club can only have D-o-N used on it once per season. You get one month-boost per calendar month — pick your month wisely.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🔄</span>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Reverse</p>
                <Badge variant="purple" className="text-[9px] ml-auto">once per opponent</Badge>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Pick a fixture where an opponent's club is playing. For that match only,{' '}
                <span className="text-[var(--accent)] font-medium">ownership of both clubs swaps</span> — you score their club's points and they score yours.
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                You can only use Reverse on each player once per season. Best used when an opponent has a tough fixture and yours is a banker.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-base">⚔️</span>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Giant Killer</p>
                <Badge variant="warning" className="text-[9px] ml-auto">auto-awarded</Badge>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                If your club beats a team that started the match <span className="font-semibold text-[var(--text-primary)]">5 or more league places above them</span>, you automatically earn a Giant Killer bonus on top of the normal win points.
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                No activation needed — it's calculated automatically at full time. Rewards holding onto lower-ranked clubs throughout the season.
              </p>
            </div>

          </div>
        </RuleSection>

        {/* Tiebreakers */}
        <RuleSection icon="🤝" title="Tiebreakers">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            If two players finish level on sweepstake points, the tiebreaker is:
          </p>
          <ol className="mt-2 space-y-1">
            {['Most wins across all clubs', 'Best goal difference across all clubs', 'Most goals scored'].map((rule, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="w-5 h-5 rounded-full bg-[var(--border)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] shrink-0">
                  {i + 1}
                </span>
                {rule}
              </li>
            ))}
          </ol>
        </RuleSection>

      </div>
    </AppShell>
  )
}

function RuleSection({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2 border-b border-[var(--border)]">
        <span className="text-base">{icon}</span>
        <h2 className="font-bold text-sm text-[var(--text-primary)]">{title}</h2>
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  )
}

function ScoreBox({ result, points, color }: { result: string; points: string; color: 'emerald' | 'amber' | 'red' }) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
  }
  return (
    <div className={`rounded-xl border ${colorMap[color]} px-2 py-2.5 text-center`}>
      <p className="text-[10px] font-semibold">{result}</p>
      <p className="text-xl font-black mt-0.5">{points}</p>
      <p className="text-[9px] opacity-70">pts</p>
    </div>
  )
}

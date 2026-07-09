'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import type { League, ScoringRule } from '@/lib/supabase/types'

export default function ScoringSettingsPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }
    const { data: lg } = await supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle()
    setLeague(lg)
    if (lg) {
      const { data: r } = await supabase.from('scoring_rules').select('*').eq('league_id', lg.id)
      setRules(r ?? [])
      const vals: Record<string, string> = {}
      for (const rule of (r ?? [])) { vals[rule.id] = rule.points.toString() }
      setEditValues(vals)
    }
    setLoading(false)
  }

  async function saveRule(rule: ScoringRule) {
    setSaving(rule.id)
    const pts = parseFloat(editValues[rule.id] ?? rule.points.toString())
    if (!isNaN(pts)) await supabase.from('scoring_rules').update({ points: pts }).eq('id', rule.id)
    setSaving(null)
    loadData()
  }

  async function toggleRule(rule: ScoringRule) {
    await supabase.from('scoring_rules').update({ enabled: !rule.enabled }).eq('id', rule.id)
    loadData()
  }

  const coreRules = rules.filter(r => ['win', 'draw', 'loss'].includes(r.rule_key))
  const bonusRules = rules.filter(r => !['win', 'draw', 'loss'].includes(r.rule_key))

  if (loading) return <AppShell title="Scoring" backHref="/settings"><PageLoader /></AppShell>

  return (
    <AppShell title="Scoring Rules" backHref="/settings">
      {!league ? (
        <EmptyState icon="🏆" title="Create a league first" />
      ) : (
        <>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Configure how points are awarded. Enable bonus rules to add extra rewards and penalties.
          </p>
          <div className="mb-5">
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Match points</p>
            <div className="space-y-2">
              {coreRules.map(rule => (
                <RuleRow key={rule.id} rule={rule} value={editValues[rule.id] ?? rule.points.toString()} onChange={v => setEditValues(prev => ({ ...prev, [rule.id]: v }))} onSave={() => saveRule(rule)} onToggle={() => toggleRule(rule)} saving={saving === rule.id} />
              ))}
            </div>
          </div>
          {bonusRules.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Bonuses & penalties</p>
              <div className="space-y-2">
                {bonusRules.map(rule => (
                  <RuleRow key={rule.id} rule={rule} value={editValues[rule.id] ?? rule.points.toString()} onChange={v => setEditValues(prev => ({ ...prev, [rule.id]: v }))} onSave={() => saveRule(rule)} onToggle={() => toggleRule(rule)} saving={saving === rule.id} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}

function RuleRow({ rule, value, onChange, onSave, onToggle, saving }: {
  rule: ScoringRule; value: string; onChange: (v: string) => void; onSave: () => void; onToggle: () => void; saving: boolean
}) {
  return (
    <Card className={`!p-3 ${!rule.enabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-[var(--text-primary)]">{rule.rule_name}</p>
          {rule.description && <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{rule.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input type="number" value={value} onChange={e => onChange(e.target.value)} className="!w-16 text-center !py-1 text-sm" disabled={!rule.enabled} />
          <span className="text-xs text-[var(--text-secondary)]">pts</span>
          <Button size="sm" onClick={onSave} loading={saving} disabled={!rule.enabled} variant="ghost">Save</Button>
          <button onClick={onToggle} className={`w-9 h-5 rounded-full transition-colors shrink-0 ${rule.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}>
            <div className={`w-3.5 h-3.5 bg-white rounded-full mx-0.5 transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>
    </Card>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import { Toggle } from '@/components/ui/Toggle'
import type { League, ScoringRule } from '@/lib/supabase/types'

const GK_SETTINGS = [
  { key: 'giant_killer_enabled', label: 'Giant Killer enabled', type: 'toggle', description: 'Auto-award bonus when a team beats a club ranked 5+ places above them' },
  { key: 'giant_killer_threshold', label: 'Position gap required', type: 'number', description: 'Minimum league position difference to trigger Giant Killer' },
  { key: 'giant_killer_bonus_points', label: 'Bonus points awarded', type: 'number', description: 'Points awarded to the Giant Killer winner' },
]

export default function ScoringSettingsPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [gkSettings, setGkSettings] = useState<Record<string, any>>({
    giant_killer_enabled: true,
    giant_killer_threshold: 5,
    giant_killer_bonus_points: 3,
  })
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
      const [{ data: r }, { data: adminSettings }] = await Promise.all([
        supabase.from('scoring_rules').select('*').eq('league_id', lg.id),
        supabase.from('admin_settings').select('*').eq('league_id', lg.id),
      ])
      setRules(r ?? [])
      const vals: Record<string, string> = {}
      for (const rule of (r ?? [])) { vals[rule.id] = rule.points.toString() }
      setEditValues(vals)

      const gk: Record<string, any> = { giant_killer_enabled: true, giant_killer_threshold: 5, giant_killer_bonus_points: 3 }
      for (const s of (adminSettings ?? [])) {
        if (s.setting_key in gk) gk[s.setting_key] = s.setting_value
      }
      setGkSettings(gk)
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

  async function saveGkSetting(key: string, value: any) {
    if (!league) return
    setSaving(key)
    await supabase.from('admin_settings').upsert(
      { league_id: league.id, setting_key: key, setting_value: value },
      { onConflict: 'league_id,setting_key' }
    )
    setGkSettings(prev => ({ ...prev, [key]: value }))
    setSaving(null)
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
            <div className="mb-5">
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Bonuses & penalties</p>
              <div className="space-y-2">
                {bonusRules.map(rule => (
                  <RuleRow key={rule.id} rule={rule} value={editValues[rule.id] ?? rule.points.toString()} onChange={v => setEditValues(prev => ({ ...prev, [rule.id]: v }))} onSave={() => saveRule(rule)} onToggle={() => toggleRule(rule)} saving={saving === rule.id} />
                ))}
              </div>
            </div>
          )}

          {/* Giant Killer */}
          <div>
            <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">🗡️ Giant Killer</p>
            <div className="space-y-2">
              {GK_SETTINGS.map(({ key, label, type, description }) => (
                <Card key={key} className="!p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[var(--text-primary)]">{label}</p>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{description}</p>
                    </div>
                    {type === 'toggle' ? (
                      <Toggle
                        checked={!!gkSettings[key]}
                        onChange={() => saveGkSetting(key, !gkSettings[key])}
                        disabled={saving === key}
                        label={label}
                      />
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <label htmlFor={`gk-${key}`} className="sr-only">{label}</label>
                        <input
                          id={`gk-${key}`}
                          name={key}
                          type="number"
                          value={gkSettings[key] ?? ''}
                          onChange={e => setGkSettings(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                          className="!w-16 text-center !py-1 text-sm"
                        />
                        <Button size="sm" onClick={() => saveGkSetting(key, gkSettings[key])} loading={saving === key} variant="ghost">Save</Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
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
          <label htmlFor={`rule-${rule.id}`} className="sr-only">{rule.rule_name} points</label>
          <input id={`rule-${rule.id}`} name={`rule-${rule.id}`} type="number" value={value} onChange={e => onChange(e.target.value)} className="!w-16 text-center !py-1 text-sm" disabled={!rule.enabled} />
          <span className="text-xs text-[var(--text-secondary)]">pts</span>
          <Button size="sm" onClick={onSave} loading={saving} disabled={!rule.enabled} variant="ghost">Save</Button>
          <Toggle checked={rule.enabled} onChange={onToggle} label={`${rule.rule_name} enabled`} />
        </div>
      </div>
    </Card>
  )
}

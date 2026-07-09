'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import type { Profile, League, Competition } from '@/lib/supabase/types'

export default function CompetitionsSettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [league, setLeague] = useState<League | null>(null)
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [{ data: prof }, { data: leagues }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('sweepstake_leagues').select('*').order('created_at', { ascending: false }).limit(1),
    ])
    setProfile(prof)
    const lg = leagues?.[0] ?? null
    setLeague(lg)
    if (lg) {
      const { data: comps } = await supabase.from('competitions').select('*').eq('league_id', lg.id).order('display_order')
      setCompetitions(comps ?? [])
    }
    setLoading(false)
  }

  async function toggleCompetition(comp: Competition) {
    setToggling(comp.id)
    await supabase.from('competitions').update({ enabled: !comp.enabled }).eq('id', comp.id)
    setToggling(null)
    loadData()
  }

  const domestic = competitions.filter(c => c.competition_type === 'domestic_league')
  const european = competitions.filter(c => c.competition_type === 'european')

  if (loading) return <AppShell profile={null} title="Competitions" backHref="/settings"><PageLoader /></AppShell>

  return (
    <AppShell profile={profile} title="Competitions" backHref="/settings">
      {!league ? (
        <EmptyState icon="🏆" title="Create a league first" />
      ) : (
        <>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Enable or disable competitions. Only enabled competitions count toward player scores.
          </p>

          {domestic.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Domestic leagues</p>
              <div className="space-y-2">
                {domestic.map(comp => (
                  <CompetitionRow key={comp.id} comp={comp} toggling={toggling === comp.id} onToggle={() => toggleCompetition(comp)} />
                ))}
              </div>
            </div>
          )}

          {european.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">European competitions</p>
              <div className="space-y-2">
                {european.map(comp => (
                  <CompetitionRow key={comp.id} comp={comp} toggling={toggling === comp.id} onToggle={() => toggleCompetition(comp)} />
                ))}
              </div>
            </div>
          )}

          {competitions.length === 0 && (
            <EmptyState icon="🌍" title="No competitions" description="Create a league to add default competitions automatically." />
          )}

          <div className="mt-4 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
            <p className="text-xs text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">{competitions.filter(c => c.enabled).length}</strong> competitions enabled
              · <strong className="text-[var(--text-primary)]">{european.filter(c => c.enabled).length}</strong> European
            </p>
          </div>
        </>
      )}
    </AppShell>
  )
}

function CompetitionRow({ comp, toggling, onToggle }: { comp: Competition; toggling: boolean; onToggle: () => void }) {
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
          comp.competition_type === 'european' ? 'bg-purple-500/20 text-purple-400' : 'bg-[var(--accent)]/20 text-[var(--accent)]'
        }`}>
          {comp.short_name}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-[var(--text-primary)]">{comp.name}</p>
          {comp.country && <p className="text-xs text-[var(--text-secondary)]">{comp.country}</p>}
        </div>
        <Badge variant={comp.competition_type === 'european' ? 'purple' : 'muted'} className="shrink-0">
          {comp.competition_type === 'european' ? 'EU' : 'Dom'}
        </Badge>
        <button
          onClick={onToggle}
          disabled={toggling}
          className={`w-11 h-6 rounded-full transition-colors shrink-0 ${comp.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${comp.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
    </Card>
  )
}

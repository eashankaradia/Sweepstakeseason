'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import type { League } from '@/lib/supabase/types'
import { DEFAULT_SCORING_RULES } from '@/lib/scoring'

const DEFAULT_COMPETITIONS = [
  { name: 'Premier League', short_name: 'PL', competition_type: 'domestic_league', country: 'England', display_order: 1 },
] as const

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function LeagueSettingsPage() {
  const [leagues, setLeagues] = useState<League[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: 'Sweepstake 2026/27', season: '2026/2027' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [revealedCode, setRevealedCode] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: lgs } = await supabase.from('sweepstake_leagues').select('*').order('created_at', { ascending: false })
    setLeagues(lgs ?? [])
    setLoading(false)
  }

  async function createLeague() {
    if (!form.name.trim() || !form.season.trim()) return
    setSaving(true)
    setError('')
    const access_code = generateCode()
    const { data: league, error: lgErr } = await supabase
      .from('sweepstake_leagues')
      .insert({ name: form.name, season: form.season, created_by: null, access_code })
      .select()
      .maybeSingle()
    if (lgErr || !league) { setError(lgErr?.message ?? 'Failed to create league'); setSaving(false); return }
    await supabase.from('competitions').insert(DEFAULT_COMPETITIONS.map(c => ({ ...c, league_id: league.id, enabled: true })))
    await supabase.from('scoring_rules').insert(DEFAULT_SCORING_RULES.map(r => ({ ...r, league_id: league.id })))
    setSaving(false)
    setCreating(false)
    loadData()
  }

  async function updateStatus(league: League, status: League['status']) {
    if (status === 'completed' && !confirm(
      `Mark "${league.name}" as completed?\n\nThis just changes the label shown around the app - fixture sync and scoring keep running in the background regardless. It does not lock anything or stop results being recorded.`
    )) return
    await supabase.from('sweepstake_leagues').update({ status }).eq('id', league.id)
    loadData()
  }

  async function regenerateCode(league: League) {
    if (!confirm('Regenerate the league code? Update your invite URL after this.')) return
    setRegenerating(league.id)
    const access_code = generateCode()
    await supabase.from('sweepstake_leagues').update({ access_code }).eq('id', league.id)
    setRegenerating(null)
    loadData()
  }

  async function copyInviteLink(league: League) {
    const url = `${window.location.origin}/join/${league.access_code}`
    await navigator.clipboard.writeText(url)
    setCopied(league.id)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <AppShell title="League Setup" backHref="/settings"><PageLoader /></AppShell>

  return (
    <AppShell title="League Setup" backHref="/settings">
      {leagues.map(lg => {
        const statusCopy: Record<string, string> = {
          setup: 'Being configured — competitions, players and scoring can still be adjusted freely.',
          active: 'Season is underway.',
          completed: 'Marked as finished. This is just a label shown around the app — fixture sync and scoring keep running regardless.',
        }
        const isRevealed = revealedCode === lg.id
        return (
        <Card key={lg.id} className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="font-semibold text-sm text-[var(--text-primary)]">{lg.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{lg.season}</p>
            </div>
            <Badge variant={lg.status === 'active' ? 'success' : lg.status === 'setup' ? 'warning' : 'muted'}>
              {lg.status}
            </Badge>
          </div>
          {lg.status && (
            <p className="text-[10px] text-[var(--text-secondary)] mb-3">{statusCopy[lg.status] ?? ''}</p>
          )}

          <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 mb-3">
            <p className="text-[10px] text-[var(--text-muted)] mb-1">Invite link — share with players</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[var(--text-secondary)] flex-1 truncate">
                {lg.access_code ? (isRevealed ? `/join/${lg.access_code}` : '/join/••••••••') : '—'}
              </span>
              {lg.access_code && (
                <button
                  onClick={() => setRevealedCode(isRevealed ? null : lg.id)}
                  className="text-xs px-2 py-1 rounded-md bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                >
                  {isRevealed ? 'Hide' : 'Show'}
                </button>
              )}
              {lg.access_code && (
                <button
                  onClick={() => copyInviteLink(lg)}
                  className="text-xs px-2 py-1 rounded-md bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                >
                  {copied === lg.id ? 'Copied!' : 'Copy link'}
                </button>
              )}
              <button
                onClick={() => regenerateCode(lg)}
                disabled={regenerating === lg.id}
                className="text-xs px-2 py-1 rounded-md bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 shrink-0"
              >
                {regenerating === lg.id ? '...' : 'Regen'}
              </button>
            </div>
          </div>

          <div>
            <p className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">League lifecycle</p>
            <div className="flex gap-2 flex-wrap">
              {lg.status === 'setup' && (
                <Button size="sm" variant="success" onClick={() => updateStatus(lg, 'active')}>Set active</Button>
              )}
              {lg.status === 'active' && (
                <Button size="sm" variant="secondary" onClick={() => updateStatus(lg, 'completed')}>Mark completed</Button>
              )}
              {lg.draft_locked && <Badge variant="info">Draft locked</Badge>}
            </div>
          </div>
        </Card>
        )
      })}

      {!creating ? (
        <Button onClick={() => setCreating(true)} variant="secondary" className="w-full">+ Create new league</Button>
      ) : (
        <Card>
          <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3">New league</h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="new-league-name" className="text-xs text-[var(--text-secondary)] block mb-1">League name</label>
              <input
                id="new-league-name"
                name="name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Sweepstake 2026/27"
                aria-invalid={!!error}
                aria-describedby={error ? 'new-league-error' : undefined}
              />
            </div>
            <div>
              <label htmlFor="new-league-season" className="text-xs text-[var(--text-secondary)] block mb-1">Season</label>
              <input
                id="new-league-season"
                name="season"
                value={form.season}
                onChange={e => setForm(f => ({ ...f, season: e.target.value }))}
                placeholder="e.g. 2026/2027"
                aria-invalid={!!error}
                aria-describedby={error ? 'new-league-error' : undefined}
              />
            </div>
          </div>
          {error && <p id="new-league-error" role="alert" className="text-xs text-red-400 mt-2">{error}</p>}
          <p className="text-xs text-[var(--text-secondary)] mt-2">Creates the league with default competitions and a random join code.</p>
          <div className="flex gap-2 mt-3">
            <Button onClick={createLeague} loading={saving} className="flex-1">Create</Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </Card>
      )}
    </AppShell>
  )
}

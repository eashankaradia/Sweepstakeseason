'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLeagueIdCookie } from '@/lib/cookie'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { PageLoader, EmptyState } from '@/components/ui/LoadingSpinner'
import { PLAYER_COLORS } from '@/lib/utils'
import type { League, Player } from '@/lib/supabase/types'

const COLOR_NAMES: Record<string, string> = {
  '#3B82F6': 'Blue', '#EF4444': 'Red', '#10B981': 'Green', '#F59E0B': 'Amber',
  '#8B5CF6': 'Violet', '#EC4899': 'Pink', '#14B8A6': 'Teal', '#F97316': 'Orange',
  '#6366F1': 'Indigo', '#84CC16': 'Lime', '#06B6D4': 'Cyan', '#A855F7': 'Purple',
}

export default function PlayersSettingsPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', color: PLAYER_COLORS[0], buddies: [] as string[] })
  const [buddyInput, setBuddyInput] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()
  const MAX_PLAYERS = 12

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const leagueId = getLeagueIdCookie()
    if (!leagueId) { setLoading(false); return }
    const { data: lg } = await supabase.from('sweepstake_leagues').select('*').eq('id', leagueId).maybeSingle()
    setLeague(lg)
    if (lg) {
      const { data: pl } = await supabase.from('players').select('*').eq('league_id', lg.id).order('position', { nullsFirst: false })
      setPlayers(pl ?? [])
    }
    setLoading(false)
  }

  async function savePlayer() {
    if (!league) return
    if (!form.name.trim()) {
      setFormError('Enter a name for this player.')
      return
    }
    setFormError('')
    setSaving(true)
    const { error } = editingId
      ? await supabase.from('players').update({ name: form.name.trim(), email: form.email || null, color: form.color, buddies: form.buddies }).eq('id', editingId)
      : await supabase.from('players').insert({ league_id: league.id, name: form.name.trim(), email: form.email || null, color: form.color, buddies: form.buddies, position: players.length + 1 })
    setSaving(false)
    if (error) {
      setFormError(`Couldn't save: ${error.message}`)
      return
    }
    setAdding(false)
    setEditingId(null)
    setForm({ name: '', email: '', color: PLAYER_COLORS[0], buddies: [] })
    setBuddyInput('')
    loadData()
  }

  async function deletePlayer(id: string, name: string) {
    if (!confirm(`Delete ${name} permanently?\n\nThis also deletes their points, team ownership, and power-up history. This cannot be undone.`)) return
    const { error } = await supabase.from('players').delete().eq('id', id)
    if (error) {
      alert(`Couldn't delete ${name}: ${error.message}`)
      return
    }
    loadData()
  }

  function startEdit(player: Player) {
    setForm({ name: player.name, email: player.email ?? '', color: player.color ?? PLAYER_COLORS[0], buddies: player.buddies ?? [] })
    setBuddyInput('')
    setFormError('')
    setEditingId(player.id)
    setAdding(true)
  }

  function cancelEdit() {
    setAdding(false)
    setEditingId(null)
    setFormError('')
    setForm({ name: '', email: '', color: PLAYER_COLORS[players.length % PLAYER_COLORS.length], buddies: [] })
    setBuddyInput('')
  }

  function addBuddy() {
    const name = buddyInput.trim()
    if (!name || form.buddies.includes(name)) { setBuddyInput(''); return }
    setForm(f => ({ ...f, buddies: [...f.buddies, name] }))
    setBuddyInput('')
  }

  function removeBuddy(name: string) {
    setForm(f => ({ ...f, buddies: f.buddies.filter(b => b !== name) }))
  }

  if (loading) return <AppShell title="Players" backHref="/settings"><PageLoader /></AppShell>

  return (
    <AppShell title="Players" backHref="/settings">
      {!league ? (
        <EmptyState icon="🏆" title="Create a league first" />
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[var(--text-secondary)]">{players.length}/{MAX_PLAYERS} players</p>
            {players.length < MAX_PLAYERS && !adding && (
              <Button size="sm" onClick={() => {
                setForm({ name: '', email: '', color: PLAYER_COLORS[players.length % PLAYER_COLORS.length], buddies: [] })
                setBuddyInput('')
                setAdding(true)
              }}>+ Add player</Button>
            )}
          </div>

          {adding && (
            <Card className="mb-3">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3">{editingId ? 'Edit player' : 'New player'}</h3>
              {formError && (
                <p id="player-form-error" role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{formError}</p>
              )}
              <div className="space-y-3">
                <div>
                  <label htmlFor="player-name" className="text-xs text-[var(--text-secondary)] block mb-1">Name *</label>
                  <input
                    id="player-name"
                    name="name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Player name"
                    required
                    aria-invalid={!!formError}
                    aria-describedby={formError ? 'player-form-error' : undefined}
                  />
                </div>
                <div>
                  <label htmlFor="player-email" className="text-xs text-[var(--text-secondary)] block mb-1">Email (optional)</label>
                  <input
                    id="player-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="player@example.com"
                  />
                </div>
                <div>
                  <span className="text-xs text-[var(--text-secondary)] block mb-1" id="player-color-label">Colour</span>
                  <div role="radiogroup" aria-labelledby="player-color-label" className="flex gap-2 flex-wrap">
                    {PLAYER_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={form.color === c}
                        aria-label={COLOR_NAMES[c] ?? c}
                        title={COLOR_NAMES[c] ?? c}
                        className={`w-11 h-11 flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] rounded-full`}
                        onClick={() => setForm(f => ({ ...f, color: c }))}
                      >
                        <span
                          aria-hidden="true"
                          className={`block w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="player-buddy-input" className="text-xs text-[var(--text-secondary)] block mb-1">
                    Buddies <span className="text-[var(--text-muted)]">(friends following this player — no account needed)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="player-buddy-input"
                      name="buddy"
                      value={buddyInput}
                      onChange={e => setBuddyInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addBuddy() }
                      }}
                      placeholder="Add a name and press Enter"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={addBuddy}
                      className="shrink-0 px-3 rounded-lg bg-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      Add
                    </button>
                  </div>
                  {form.buddies.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {form.buddies.map(name => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-[var(--accent)]/12 text-[var(--accent)] text-xs font-medium"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => removeBuddy(name)}
                            aria-label={`Remove ${name}`}
                            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-[var(--accent)]/20"
                          >
                            <svg viewBox="0 0 10 10" width="8" height="8"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button onClick={savePlayer} loading={saving} className="flex-1">{editingId ? 'Save changes' : 'Add player'}</Button>
                <Button variant="secondary" onClick={cancelEdit}>Cancel</Button>
              </div>
            </Card>
          )}

          <div className="space-y-2">
            {players.map((player, idx) => (
              <Card key={player.id} className="!p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-muted)] w-5 shrink-0">{idx + 1}</span>
                  <Avatar name={player.name} color={player.color} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-[var(--text-primary)] truncate">{player.name}</p>
                    {player.email && <p className="text-xs text-[var(--text-secondary)] truncate">{player.email}</p>}
                    {player.buddies && player.buddies.length > 0 && (
                      <p className="text-[10px] text-[var(--text-muted)] truncate">👥 {player.buddies.join(', ')}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(player)}
                      aria-label={`Edit ${player.name}`}
                      title={`Edit ${player.name}`}
                      className="w-11 h-11 rounded-lg bg-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePlayer(player.id, player.name)}
                      aria-label={`Delete ${player.name}`}
                      title={`Delete ${player.name}`}
                      className="w-11 h-11 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {players.length === 0 && !adding && (
            <EmptyState icon="👥" title="No players yet" description="Add up to 12 players for the sweepstake." />
          )}
        </>
      )}
    </AppShell>
  )
}

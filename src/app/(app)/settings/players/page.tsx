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

export default function PlayersSettingsPage() {
  const [league, setLeague] = useState<League | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', color: PLAYER_COLORS[0] })
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
    if (!league || !form.name.trim()) return
    setSaving(true)
    if (editingId) {
      await supabase.from('players').update({ name: form.name, email: form.email || null, color: form.color }).eq('id', editingId)
    } else {
      await supabase.from('players').insert({ league_id: league.id, name: form.name, email: form.email || null, color: form.color, position: players.length + 1 })
    }
    setSaving(false)
    setAdding(false)
    setEditingId(null)
    setForm({ name: '', email: '', color: PLAYER_COLORS[0] })
    loadData()
  }

  async function deletePlayer(id: string) {
    if (!confirm('Remove this player?')) return
    await supabase.from('players').delete().eq('id', id)
    loadData()
  }

  function startEdit(player: Player) {
    setForm({ name: player.name, email: player.email ?? '', color: player.color ?? PLAYER_COLORS[0] })
    setEditingId(player.id)
    setAdding(true)
  }

  function cancelEdit() {
    setAdding(false)
    setEditingId(null)
    setForm({ name: '', email: '', color: PLAYER_COLORS[players.length % PLAYER_COLORS.length] })
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
                setForm({ name: '', email: '', color: PLAYER_COLORS[players.length % PLAYER_COLORS.length] })
                setAdding(true)
              }}>+ Add player</Button>
            )}
          </div>

          {adding && (
            <Card className="mb-3">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] mb-3">{editingId ? 'Edit player' : 'New player'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Player name" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">Email (optional)</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="player@example.com" />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">Colour</label>
                  <div className="flex gap-2 flex-wrap">
                    {PLAYER_COLORS.map(c => (
                      <button key={c} className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setForm(f => ({ ...f, color: c }))} />
                    ))}
                  </div>
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
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(player)} className="w-7 h-7 rounded-lg bg-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button onClick={() => deletePlayer(player.id)} className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:text-red-300">
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

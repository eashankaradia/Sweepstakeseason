'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export default function OnboardingPage() {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [leagueName, setLeagueName] = useState('')
  const [season, setSeason] = useState('2025/26')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }
      const { data: membership } = await supabase
        .from('league_memberships').select('league_id')
        .eq('user_id', user.id).limit(1).maybeSingle()
      if (membership) {
        document.cookie = `ss_league=${membership.league_id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
        window.location.href = '/dashboard'
        return
      }
      setChecking(false)
    }
    check()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    const accessCode = leagueName.toUpperCase().replace(/[^A-Z0-9]/g, '') || generateCode()
    const { data: league, error: lgErr } = await supabase
      .from('sweepstake_leagues')
      .insert({ name: leagueName, season, access_code: accessCode, status: 'setup', created_by: user.id })
      .select().single()
    if (lgErr) { setError(lgErr.message); setLoading(false); return }
    await supabase.from('league_memberships').insert({ user_id: user.id, league_id: league.id, role: 'admin' })
    document.cookie = `ss_league=${league.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    window.location.href = '/dashboard'
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    const { data: league } = await supabase
      .from('sweepstake_leagues').select('id').ilike('access_code', code.trim()).maybeSingle()
    if (!league) { setError('League not found — check the code and try again'); setLoading(false); return }
    await supabase.from('league_memberships').insert({ user_id: user.id, league_id: league.id, role: 'member' })
    document.cookie = `ss_league=${league.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    window.location.href = '/dashboard'
  }

  const inputCls = "w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--bg)]">
        <div className="text-2xl animate-pulse">⚽</div>
      </div>
    )
  }

  if (mode === 'join') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--bg)]">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <span className="text-4xl">🔗</span>
            <h1 className="text-xl font-bold text-[var(--text-primary)] mt-2">Join a league</h1>
          </div>
          <form onSubmit={handleJoin} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">League code</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="LEAGUE CODE" autoCapitalize="characters" required className={inputCls} />
            </div>
            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-[var(--accent)] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
              {loading ? 'Joining…' : 'Join league'}
            </button>
            <button type="button" onClick={() => setMode('choose')} className="w-full text-[var(--text-secondary)] text-sm py-2">← Back</button>
          </form>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--bg)]">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <span className="text-4xl">✨</span>
            <h1 className="text-xl font-bold text-[var(--text-primary)] mt-2">Create a league</h1>
          </div>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">League name</label>
              <input type="text" value={leagueName} onChange={e => setLeagueName(e.target.value)}
                placeholder="MY LEAGUE" required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Season</label>
              <input type="text" value={season} onChange={e => setSeason(e.target.value)}
                placeholder="2025/26" className={inputCls} />
            </div>
            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-[var(--accent)] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">
              {loading ? 'Creating…' : 'Create league'}
            </button>
            <button type="button" onClick={() => setMode('choose')} className="w-full text-[var(--text-secondary)] text-sm py-2">← Back</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">🏆</span>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mt-2">Set up your league</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Create a new league or join an existing one</p>
        </div>
        <div className="space-y-3">
          <button onClick={() => setMode('create')}
            className="w-full bg-[var(--accent)] text-white rounded-xl py-4 text-sm font-semibold text-left px-5 flex items-center gap-3">
            <span className="text-xl">✨</span>
            <div>
              <div>Create a new league</div>
              <div className="text-xs text-white/70 font-normal">Set up teams, scoring, and invite friends</div>
            </div>
          </button>
          <button onClick={() => setMode('join')}
            className="w-full bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl py-4 text-sm font-semibold text-left px-5 flex items-center gap-3">
            <span className="text-xl">🔗</span>
            <div>
              <div>Join with a code</div>
              <div className="text-xs text-[var(--text-secondary)] font-normal">Enter an invite code from your league admin</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const email = `${username.toLowerCase().trim()}@sweepstakeseason.app`
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Invalid username or password')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: membership } = await supabase
        .from('league_memberships')
        .select('league_id')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (membership) {
        document.cookie = `ss_league=${membership.league_id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
        window.location.href = '/dashboard'
        return
      }
    }

    window.location.href = '/onboarding'
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">⚽</span>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mt-2">Sweepstake Season</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="eashan"
              autoComplete="username"
              autoCapitalize="none"
              required
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent)] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-secondary)] mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="text-[var(--accent)] font-medium">Sign up</Link>
        </p>
      </div>
    </div>
  )
}

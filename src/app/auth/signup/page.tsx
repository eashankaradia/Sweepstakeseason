'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const u = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '')
    if (!u) { setError('Username can only contain letters, numbers, and underscores'); setLoading(false); return }

    const name = displayName.trim() || u
    const email = `${u}@sweepstakeseason.app`

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: u, display_name: name } },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      await supabase.from('user_profiles').insert({ id: data.user.id, username: u, display_name: name })
    }

    window.location.href = '/onboarding'
  }

  const inputCls = "w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">⚽</span>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mt-2">Create account</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Join Sweepstake Season</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Username <span className="text-[var(--text-muted)]">(used to log in)</span>
            </label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="eashan" autoComplete="username" autoCapitalize="none" required className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Display name <span className="text-[var(--text-muted)]">(optional)</span>
            </label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="Eashan" autoComplete="name" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="new-password" required minLength={6} className={inputCls} />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-[var(--accent)] text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 transition-opacity">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-secondary)] mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-[var(--accent)] font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !code.trim()) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const email = `${username.trim().toLowerCase()}@sweepstake.local`
    const password = code.trim().toUpperCase()

    // Verify league code against DB (anon-readable)
    const { data: league } = await supabase
      .from('sweepstake_leagues')
      .select('id')
      .eq('access_code', password)
      .maybeSingle()

    if (!league) {
      setError('Invalid league code — check with your admin.')
      setLoading(false)
      return
    }

    // Try sign in for returning users
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })

    if (!signInErr) {
      router.push('/dashboard')
      router.refresh()
      return
    }

    // New user — register them
    const { error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: username.trim() } },
    })

    if (signUpErr) {
      setError(signUpErr.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚽</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Sweepstake Season</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">2026/27 Club Football</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h2 className="font-semibold text-[var(--text-primary)] mb-1">Join your league</h2>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Pick a username and enter the code from your admin.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. eashan"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">League code</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC12345"
                autoComplete="off"
                spellCheck={false}
                required
                className="w-full font-mono tracking-widest"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Join league
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          Get the league code from your admin.
        </p>
      </div>
    </div>
  )
}

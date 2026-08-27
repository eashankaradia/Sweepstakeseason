'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AppShell } from '@/components/layout/AppShell'

export default function AccountPage() {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (newPw.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPw !== confirmPw) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    // Re-authenticate with current password first
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setError('Could not verify your identity. Try signing out and back in.')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPw,
    })
    if (signInError) {
      setError('Current password is incorrect.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPw })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    }
  }

  return (
    <AppShell title="Account" backHref="/settings">
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 className="font-semibold text-sm text-[var(--text-primary)] mb-1">Change Password</h2>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Set a personal password. Must be at least 8 characters.
          </p>

          {success && (
            <div role="status" className="mb-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-3 py-2.5 rounded-xl">
              ✓ Password updated successfully!
            </div>
          )}
          {error && (
            <div id="account-form-error" role="alert" className="mb-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-3" noValidate>
            <div>
              <label htmlFor="current-password" className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Current password
              </label>
              <input
                id="current-password"
                name="current-password"
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Your current password"
                aria-invalid={!!error}
                aria-describedby={error ? 'account-form-error' : undefined}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label htmlFor="new-password" className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                New password
              </label>
              <input
                id="new-password"
                name="new-password"
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                aria-invalid={!!error}
                aria-describedby={error ? 'account-form-error' : undefined}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Repeat new password"
                aria-invalid={!!error}
                aria-describedby={error ? 'account-form-error' : undefined}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--accent)] text-white font-semibold py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50 mt-1 min-h-11"
            >
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

        <p className="text-[10px] text-[var(--text-muted)] text-center px-4">
          After changing your password, you&apos;ll stay signed in on this device.
        </p>
      </div>
    </AppShell>
  )
}

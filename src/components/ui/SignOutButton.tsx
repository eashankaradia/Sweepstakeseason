'use client'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    document.cookie = 'ss_league=; path=/; max-age=0'
    window.location.href = '/auth/login'
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-red-500/40 transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center text-lg shrink-0">
        🚪
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-red-400">Sign out</p>
        <p className="text-xs text-[var(--text-secondary)] truncate">Sign out of Degenerate Sweepstake</p>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-[var(--text-muted)] shrink-0">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
      </svg>
    </button>
  )
}

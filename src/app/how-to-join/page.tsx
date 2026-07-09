export default async function HowToJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl mb-4">⚽</div>
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">Sweepstake Season</h1>
        {error === 'invalid' && (
          <p className="text-sm text-red-400 mb-3">
            That code doesn&apos;t match any league — double-check with your admin.
          </p>
        )}
        <p className="text-[var(--text-secondary)] text-sm mb-6">
          Ask your sweepstake admin for your invite link.
        </p>
        <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3">
          The link looks like:<br />
          <span className="font-mono text-[var(--text-secondary)]">
            sweepstakeseason.vercel.app/join/<strong>YOURCODE</strong>
          </span>
        </div>
      </div>
    </div>
  )
}

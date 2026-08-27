'use client'

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onChange}
      disabled={disabled}
      className="w-11 h-11 -my-3 -mr-2 flex items-center justify-center shrink-0 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded-full"
    >
      <span aria-hidden="true" className={`block w-9 h-5 rounded-full transition-colors ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}>
        <span className={`block w-3.5 h-3.5 bg-white rounded-full mx-0.5 mt-[3px] transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

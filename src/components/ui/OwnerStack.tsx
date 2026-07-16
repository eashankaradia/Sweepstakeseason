'use client'
import { useState } from 'react'
import { Avatar } from './Avatar'
import { BottomSheet } from './BottomSheet'

type Owner = { id: string; name: string; color: string }

interface OwnerStackProps {
  owners: Owner[]
  max?: number
  size?: 'xs' | 'sm'
}

export function OwnerStack({ owners, max = 3, size = 'xs' }: OwnerStackProps) {
  const [open, setOpen] = useState(false)

  if (owners.length === 0) return null

  const visible = owners.slice(0, max)
  const overflow = owners.length - max

  const avatarSize = size === 'xs' ? 'xs' : 'sm'
  const dim = size === 'xs' ? 'w-5 h-5' : 'w-6 h-6'
  const overlapClass = size === 'xs' ? '-space-x-1.5' : '-space-x-2'

  function handleClick(e: React.MouseEvent) {
    if (owners.length <= 1) return
    e.preventDefault()
    e.stopPropagation()
    if (typeof window !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={`flex ${overlapClass} focus:outline-none`}
        aria-label={`${owners.length} owner${owners.length !== 1 ? 's' : ''}`}
      >
        {visible.map(o => (
          <div key={o.id} className={`${dim} rounded-full ring-2 ring-[var(--bg-card)] shrink-0`}>
            <Avatar name={o.name} color={o.color} size={avatarSize} />
          </div>
        ))}
        {overflow > 0 && (
          <div
            className={`${dim} rounded-full ring-2 ring-[var(--bg-card)] shrink-0 bg-[var(--border)] flex items-center justify-center`}
          >
            <span className="text-[8px] font-bold text-[var(--text-secondary)]">+{overflow}</span>
          </div>
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Owners">
        <div className="space-y-2 pb-4">
          {owners.map(o => (
            <div key={o.id} className="flex items-center gap-3 py-1">
              <Avatar name={o.name} color={o.color} size="md" />
              <span className="text-sm font-medium text-[var(--text-primary)]">{o.name}</span>
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}

'use client'
import { useState, useRef } from 'react'
import { getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface AvatarProps {
  name: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
}

export function Avatar({ name, color = '#6366f1', size = 'md', className }: AvatarProps) {
  const [show, setShow] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  function onTouch() {
    clearTimeout(timer.current)
    setShow(true)
    timer.current = setTimeout(() => setShow(false), 2000)
  }

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={cn('rounded-full flex items-center justify-center font-semibold cursor-default', sizes[size], className)}
        style={{ backgroundColor: color + '33', color }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onTouchStart={onTouch}
      >
        {getInitials(name)}
      </div>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-none">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] text-[10px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap shadow-lg">
            {name}
          </div>
          <div className="w-1.5 h-1.5 bg-[var(--bg-card)] border-b border-r border-[var(--border)] rotate-45 mx-auto -mt-[3px]" />
        </div>
      )}
    </div>
  )
}

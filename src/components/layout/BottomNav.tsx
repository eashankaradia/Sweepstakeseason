'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  {
    href: '/dashboard',
    label: 'Home',
    iconOutline: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[22px] h-[22px]">
        <path d="M3 12L12 3l9 9" strokeLinejoin="round" />
        <path d="M9 21V12h6v9" strokeLinejoin="round" />
      </svg>
    ),
    iconFilled: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]">
        <path d="M12 2.5L2.5 10.5V21h6v-6h7v6h6V10.5L12 2.5Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/standings',
    label: 'Standings',
    iconOutline: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[22px] h-[22px]">
        <rect x="5" y="12" width="4" height="9" rx="1" />
        <rect x="10" y="6" width="4" height="15" rx="1" />
        <rect x="15" y="9" width="4" height="12" rx="1" />
      </svg>
    ),
    iconFilled: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]">
        <rect x="5" y="12" width="4" height="9" rx="1" fill="currentColor" />
        <rect x="10" y="6" width="4" height="15" rx="1" fill="currentColor" />
        <rect x="15" y="9" width="4" height="12" rx="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: '/my-teams',
    label: 'My Teams',
    iconOutline: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[22px] h-[22px]">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
      </svg>
    ),
    iconFilled: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]">
        <circle cx="12" cy="8" r="4" fill="currentColor" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  {
    href: '/fixtures',
    label: 'Fixtures',
    iconOutline: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[22px] h-[22px]">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
    iconFilled: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]">
        <rect x="3" y="4" width="18" height="18" rx="2" fill="currentColor" />
        <path d="M16 2v4M8 2v4" stroke="var(--bg-card)" strokeWidth="2" strokeLinecap="round" />
        <path d="M3 10h18" stroke="var(--bg-card)" strokeWidth="2" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--bg-card)]/96 backdrop-blur-md"
      style={{ height: 'var(--nav-h)' }}
    >
      <div className="flex items-stretch h-full max-w-lg mx-auto">
        {navItems.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 px-1',
                'transition-colors duration-150',
                isActive
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center w-12 h-7 rounded-full transition-all duration-200',
                  isActive ? 'bg-[var(--accent)]/15' : ''
                )}
              >
                {isActive ? item.iconFilled : item.iconOutline}
              </div>
              <span className={cn('text-[10px] font-medium leading-none', isActive ? 'font-semibold' : '')}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

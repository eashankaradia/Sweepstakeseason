'use client'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg bg-[var(--bg-card)] animate-pulse',
        className
      )}
    />
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>

      {/* Hero card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-28" />
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="w-3.5 h-3.5 rounded-full" />)}
            </div>
          </div>
          <div className="text-right space-y-1">
            <Skeleton className="h-7 w-10 ml-auto" />
            <Skeleton className="h-3 w-8 ml-auto" />
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div>
        <div className="flex justify-between mb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)] last:border-0 bg-[var(--bg-card)]">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="w-7 h-7 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3.5 w-24" />
                <div className="flex gap-0.5">
                  {[...Array(4)].map((_, j) => <Skeleton key={j} className="w-2 h-2 rounded-full" />)}
                </div>
              </div>
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </div>

      {/* Fixtures */}
      <div>
        <div className="flex justify-between mb-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="w-5 h-5 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-8" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 justify-end">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="w-5 h-5 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

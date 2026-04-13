import type { ReactNode } from 'react'

interface SkeletonCrossfadeProps {
  isLoading: boolean
  skeleton: ReactNode
  children: ReactNode
  minHeight?: number | string
}

/**
 * Crossfades between skeleton placeholder and loaded content.
 * - Skeleton fades from opacity 1 → 0 over 150ms
 * - Content fades from opacity 0 → 1 over 150ms simultaneously
 * - No layout shift — both occupy the same space via CSS grid overlap
 */
export function SkeletonCrossfade({ isLoading, skeleton, children, minHeight }: SkeletonCrossfadeProps) {
  return (
    <div style={{ display: 'grid', minHeight }}>
      {/* Skeleton layer */}
      <div
        style={{
          gridArea: '1 / 1',
          opacity: isLoading ? 1 : 0,
          transition: 'opacity 150ms ease-out',
          pointerEvents: isLoading ? 'auto' : 'none',
        }}
      >
        {skeleton}
      </div>
      {/* Content layer */}
      <div
        style={{
          gridArea: '1 / 1',
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 150ms ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}

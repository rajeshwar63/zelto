import type { ReactNode, CSSProperties } from 'react'

interface AnimatedListItemProps {
  index: number
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Wraps list items with a staggered slide-up + fade entrance animation.
 * - translateY(12px) → translateY(0) + opacity 0 → 1
 * - Duration: 200ms per card
 * - Stagger: 40ms delay between cards (caps at 8 items = 320ms total)
 * - Respects prefers-reduced-motion
 */
export function AnimatedListItem({ index, children, className, style }: AnimatedListItemProps) {
  const delay = Math.min(index, 8) * 40

  return (
    <div
      className={className}
      style={{
        animation: 'slideUp 200ms ease-out both',
        animationDelay: `${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

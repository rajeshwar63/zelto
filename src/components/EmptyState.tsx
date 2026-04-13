interface EmptyStateProps {
  icon: React.ComponentType<{ size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; color?: string }>
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

/**
 * Shared empty state component for all screens.
 * Uses a Phosphor icon at thin weight (48px) for an illustrative feel.
 */
export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <Icon size={48} weight="thin" color="var(--text-muted, #C0C8D4)" />
      <p
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text-primary, #1A1A2E)',
          margin: 0,
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: '13px',
          fontWeight: 400,
          color: 'var(--text-secondary, #8492A6)',
          maxWidth: '260px',
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            background: 'var(--brand-primary, #4A6CF7)',
            color: '#FFFFFF',
            borderRadius: '12px',
            padding: '0 24px',
            height: '48px',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            marginTop: '4px',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

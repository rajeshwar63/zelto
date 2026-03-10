import { CaretRight } from '@phosphor-icons/react'

interface Props {
  title: string
  onPress: () => void
  showDivider?: boolean
}

export function SettingsItem({ title, onPress, showDivider = true }: Props) {
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center justify-between"
      style={{
        padding: '13px 16px',
        borderBottom: showDivider ? '1px solid var(--border-section)' : 'none',
        minHeight: '44px',
      }}
    >
      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</p>
      <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
    </button>
  )
}

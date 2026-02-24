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
      className={`w-full flex items-center justify-between py-3 hover:bg-muted/30 transition-colors ${showDivider ? 'border-b border-border' : ''}`}
    >
      <p className="text-[14px] text-foreground">{title}</p>
      <CaretRight size={16} className="text-muted-foreground" />
    </button>
  )
}

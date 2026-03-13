import { CaretLeft } from '@phosphor-icons/react'

interface Props {
  onBack: () => void
}

const APP_VERSION = '1.0.0'
const SUPPORT_EMAIL = 'raja@zeltoapp.com'

export function HelpSupportScreen({ onBack }: Props) {
  const handleEmail = () => {
    window.open(`mailto:${SUPPORT_EMAIL}?subject=Zelto%20Support`)
  }

  return (
    <div>
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} className="flex items-center text-foreground hover:text-muted-foreground">
            <CaretLeft size={20} weight="regular" />
          </button>
          <h1 className="text-[17px] text-foreground font-normal flex-1">Help & Support</h1>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="divide-y divide-border">
          <button
            onClick={handleEmail}
            className="w-full text-left py-3 hover:bg-muted/30 transition-colors"
          >
            <p className="text-[14px] text-foreground">Email Support</p>
          </button>

          <div className="flex items-center justify-between py-3">
            <p className="text-[14px] text-foreground">App Version</p>
            <p className="text-[14px] text-muted-foreground">{APP_VERSION}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

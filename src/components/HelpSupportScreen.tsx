import { CaretLeft } from '@phosphor-icons/react'

interface Props {
  onBack: () => void
}

const APP_VERSION = '1.0.0'
const SUPPORT_EMAIL = 'rajeshwar63@gmail.com'
const SUPPORT_PHONE = '+919999999999' // TODO: Replace with actual support phone number
const WHATSAPP_NUMBER = '919999999999' // TODO: Replace with actual WhatsApp support number

export function HelpSupportScreen({ onBack }: Props) {
  const handleWhatsApp = () => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=Hi%2C%20I%20need%20help%20with%20Zelto`, '_blank')
  }

  const handleCall = () => {
    window.open(`tel:${SUPPORT_PHONE}`)
  }

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
            onClick={handleWhatsApp}
            className="w-full text-left py-3 hover:bg-muted/30 transition-colors"
          >
            <p className="text-[14px] text-foreground">WhatsApp Support</p>
          </button>
          <button
            onClick={handleCall}
            className="w-full text-left py-3 hover:bg-muted/30 transition-colors"
          >
            <p className="text-[14px] text-foreground">Call Support</p>
          </button>
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

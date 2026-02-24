import { useState } from 'react'
import { CaretLeft } from '@phosphor-icons/react'

const STORAGE_KEY = 'zelto_notification_settings'

interface NotificationSettings {
  paymentReminders: boolean
  orderUpdates: boolean
  issueAlerts: boolean
}

function loadSettings(): NotificationSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    // ignore
  }
  return { paymentReminders: true, orderUpdates: true, issueAlerts: true }
}

function saveSettings(settings: NotificationSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

interface Props {
  onBack: () => void
}

export function NotificationSettingsScreen({ onBack }: Props) {
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings)

  const toggle = (key: keyof NotificationSettings) => {
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    saveSettings(updated)
  }

  return (
    <div>
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} className="flex items-center text-foreground hover:text-muted-foreground">
            <CaretLeft size={20} weight="regular" />
          </button>
          <h1 className="text-[17px] text-foreground font-normal flex-1">Notifications</h1>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="divide-y divide-border">
          <ToggleRow
            label="Payment Reminders"
            value={settings.paymentReminders}
            onChange={() => toggle('paymentReminders')}
          />
          <ToggleRow
            label="Order Updates"
            value={settings.orderUpdates}
            onChange={() => toggle('orderUpdates')}
          />
          <ToggleRow
            label="Issue Alerts"
            value={settings.issueAlerts}
            onChange={() => toggle('issueAlerts')}
          />
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-3">
      <p className="text-[14px] text-foreground">{label}</p>
      <button
        onClick={onChange}
        role="switch"
        aria-checked={value}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-foreground' : 'bg-muted'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  )
}

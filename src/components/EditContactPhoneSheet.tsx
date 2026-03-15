import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'

interface Props {
  isOpen: boolean
  onClose: () => void
  connectionId: string
  currentBusinessId: string
  currentPhone: string | null
}

export function EditContactPhoneSheet({ isOpen, onClose, connectionId, currentBusinessId, currentPhone }: Props) {
  const [input, setInput] = useState(currentPhone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const handleSave = async () => {
    const digits = input.replace(/\D/g, '')
    if (digits.length < 10) {
      setError('Enter a valid 10-digit number')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await dataStore.updateConnectionContact(connectionId, currentBusinessId, digits, null, null)
      emitDataChange('connections:changed')
      onClose()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setSaving(true)
    setError(null)
    try {
      await dataStore.updateConnectionContact(connectionId, currentBusinessId, null, null, null)
      emitDataChange('connections:changed')
      onClose()
    } catch {
      setError('Failed to remove. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderTopLeftRadius: 'var(--radius-modal)',
          borderTopRightRadius: 'var(--radius-modal)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>Contact Number</h2>
          <button
            onClick={onClose}
            style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
          >
            <X size={22} weight="regular" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            This number is only visible to you. Used for calling and WhatsApp.
          </p>

          <input
            type="tel"
            inputMode="numeric"
            placeholder="e.g. 98765 43210"
            value={input}
            onChange={e => {
              setInput(e.target.value)
              setError(null)
            }}
            autoFocus
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: '16px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              backgroundColor: 'var(--bg-screen)',
              border: error ? '1px solid #DC2626' : '1px solid var(--border-light)',
              borderRadius: 'var(--radius-input)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />

          {error && (
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#DC2626' }}>{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: 'var(--brand-primary)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-button)',
              fontSize: '15px',
              fontWeight: 600,
              minHeight: '44px',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>

          {currentPhone && (
            <button
              onClick={handleRemove}
              disabled={saving}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'transparent',
                color: '#DC2626',
                borderRadius: 'var(--radius-button)',
                fontSize: '15px',
                fontWeight: 600,
                minHeight: '44px',
                opacity: saving ? 0.6 : 1,
              }}
            >
              Remove Number
            </button>
          )}

          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-button)',
              fontSize: '15px',
              fontWeight: 500,
              minHeight: '44px',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

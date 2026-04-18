// src/components/NotificationDebugScreen.tsx
import { useEffect, useState } from 'react'
import { CaretLeft, Copy, ArrowClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { getPushDiagnostic, type PushDiagnostic } from '../lib/push-notifications'

interface Props {
  onBack: () => void
}

export function NotificationDebugScreen({ onBack }: Props) {
  const [diag, setDiag] = useState<PushDiagnostic>(getPushDiagnostic())

  useEffect(() => {
    const interval = setInterval(() => setDiag(getPushDiagnostic()), 1000)
    return () => clearInterval(interval)
  }, [])

  const copyAll = async () => {
    const text = JSON.stringify(diag, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy')
    }
  }

  const rows: Array<[string, string]> = [
    ['Platform', diag.platform],
    ['iOS device', String(diag.isIos)],
    ['Running as PWA (standalone)', String(diag.isStandalone)],
    ['Push API supported', String(diag.pushSupported)],
    ['Permission status', diag.permissionStatus],
    ['Service worker ready', String(diag.serviceWorkerReady)],
    ['Registration attempted', String(diag.registrationAttempted)],
    ['Registration succeeded', String(diag.registrationSucceeded)],
    ['Token saved to DB', String(diag.tokenSavedToDb)],
    ['Token preview', diag.tokenPreview ?? '—'],
    ['Last error', diag.lastError ?? '—'],
    [
      'Last update',
      diag.lastUpdatedAt ? new Date(diag.lastUpdatedAt).toLocaleTimeString() : '—',
    ],
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F7F9FC', paddingBottom: 40 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 16px',
          background: '#fff',
          borderBottom: '1px solid #E8ECF2',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            padding: 8,
            marginRight: 4,
            cursor: 'pointer',
          }}
          aria-label="Back"
        >
          <CaretLeft size={20} color="#1A1F2E" />
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#1A1F2E', flex: 1 }}>
          Notification diagnostics
        </h1>
        <button
          onClick={() => setDiag(getPushDiagnostic())}
          style={{
            background: 'none',
            border: 'none',
            padding: 8,
            cursor: 'pointer',
          }}
          aria-label="Refresh"
        >
          <ArrowClockwise size={18} color="#6B7280" />
        </button>
      </div>

      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 12px 0', lineHeight: 1.5 }}>
          Share this information with support if notifications aren't arriving.
        </p>

        <div
          style={{
            background: '#fff',
            border: '1px solid #E8ECF2',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {rows.map(([label, value], idx) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderBottom: idx < rows.length - 1 ? '1px solid #F0F2F5' : 'none',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 13, color: '#6B7280', flexShrink: 0 }}>{label}</span>
              <span
                style={{
                  fontSize: 13,
                  color: '#1A1F2E',
                  fontFamily: 'monospace',
                  textAlign: 'right',
                  wordBreak: 'break-all',
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={copyAll}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '12px',
            background: '#fff',
            border: '1px solid #E8ECF2',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            color: '#1A1F2E',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Copy size={16} />
          Copy all for support
        </button>
      </div>
    </div>
  )
}

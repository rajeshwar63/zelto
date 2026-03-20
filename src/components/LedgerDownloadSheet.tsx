// src/components/LedgerDownloadSheet.tsx
// Bottom sheet for selecting ledger period + format, then triggering download.

import { useState } from 'react'
import { X, DownloadSimple } from '@phosphor-icons/react'
import { supabase, supabaseUrl } from '@/lib/supabase-client'
import { generateLedgerExcel } from '@/utils/ledger-excel'
import { generateLedgerPdf } from '@/utils/ledger-pdf'
import type { LedgerData } from '@/utils/ledger-excel'

type Period = '7d' | '30d' | '90d' | '1y'
type Format = 'excel' | 'pdf'

interface Props {
  isOpen: boolean
  onClose: () => void
  scope: 'all' | 'single'
  connectionId?: string
  connectionName?: string
  currentBusinessId: string
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '1 Quarter' },
  { value: '1y', label: '1 Year' },
]

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'excel', label: 'Excel' },
  { value: 'pdf', label: 'PDF' },
]

export function LedgerDownloadSheet({ isOpen, onClose, scope, connectionId, connectionName, currentBusinessId }: Props) {
  const [period, setPeriod] = useState<Period>('30d')
  const [fileFormat, setFileFormat] = useState<Format>('excel')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const title = scope === 'single' && connectionName
    ? `Download ${connectionName} Ledger`
    : 'Download Ledger'

  const handleDownload = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const functionUrl = `${supabaseUrl}/functions/v1/generate-ledger`

      const body: Record<string, string> = {
        scope,
        period,
        businessId: currentBusinessId,
      }
      if (scope === 'single' && connectionId) {
        body.connectionId = connectionId
      }

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error || `Request failed: ${response.status}`)
      }

      const ledgerData: LedgerData = await response.json()

      if (fileFormat === 'excel') {
        generateLedgerExcel(ledgerData)
      } else {
        generateLedgerPdf(ledgerData)
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
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
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
          >
            <X size={22} weight="regular" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-5">
          {/* Period selector */}
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>SELECT PERIOD</p>
            <div className="flex gap-2 flex-wrap">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  disabled={loading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-chip)',
                    fontSize: '14px',
                    fontWeight: period === opt.value ? 600 : 500,
                    color: period === opt.value ? '#FFFFFF' : 'var(--text-primary)',
                    backgroundColor: period === opt.value ? 'var(--brand-primary)' : 'var(--bg-screen)',
                    border: period === opt.value ? 'none' : '1px solid var(--border-light)',
                    minHeight: '44px',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format selector */}
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>SELECT FORMAT</p>
            <div className="flex gap-2">
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setFileFormat(opt.value)}
                  disabled={loading}
                  style={{
                    padding: '8px 24px',
                    borderRadius: 'var(--radius-chip)',
                    fontSize: '14px',
                    fontWeight: fileFormat === opt.value ? 600 : 500,
                    color: fileFormat === opt.value ? '#FFFFFF' : 'var(--text-primary)',
                    backgroundColor: fileFormat === opt.value ? 'var(--brand-primary)' : 'var(--bg-screen)',
                    border: fileFormat === opt.value ? 'none' : '1px solid var(--border-light)',
                    minHeight: '44px',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ backgroundColor: '#FEF2F2', borderRadius: '8px', padding: '10px 14px' }}>
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#DC2626' }}>{error}</p>
            </div>
          )}

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 'var(--radius-button)',
              backgroundColor: loading ? 'var(--brand-primary-bg)' : 'var(--brand-primary)',
              color: loading ? 'var(--brand-primary)' : '#FFFFFF',
              fontSize: '15px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              minHeight: '50px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {loading ? (
              <>
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid currentColor',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                Generating...
              </>
            ) : (
              <>
                <DownloadSimple size={20} weight="bold" />
                Download {fileFormat === 'excel' ? 'Excel' : 'PDF'}
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

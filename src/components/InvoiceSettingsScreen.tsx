import { useState, useEffect } from 'react'
import { ArrowLeft, Image, PencilSimple } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { supabase } from '@/lib/supabase-client'
import { toast } from 'sonner'
import type { InvoiceSettings, BusinessEntity } from '@/lib/types'

interface Props {
  currentBusinessId: string
  onBack: () => void
  onNavigateToBusinessDetails: () => void
  onNavigateToItemMaster: () => void
}

export function InvoiceSettingsScreen({ currentBusinessId, onBack, onNavigateToBusinessDetails, onNavigateToItemMaster }: Props) {
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [business, setBusiness] = useState<BusinessEntity | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [invoicePrefix, setInvoicePrefix] = useState('INV-')
  const [startingNumber, setStartingNumber] = useState('1')
  const [defaultDueDays, setDefaultDueDays] = useState('7')
  const [bankAccountName, setBankAccountName] = useState('')
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [bankIfsc, setBankIfsc] = useState('')
  const [bankName, setBankName] = useState('')
  const [upiId, setUpiId] = useState('')
  const [termsAndConditions, setTermsAndConditions] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      dataStore.getInvoiceSettings(currentBusinessId),
      dataStore.getBusinessEntityById(currentBusinessId),
    ]).then(([s, b]) => {
      setBusiness(b || null)
      if (s) {
        setSettings(s)
        setInvoicePrefix(s.invoicePrefix)
        setStartingNumber(String(s.nextInvoiceNumber))
        setDefaultDueDays(String(s.defaultDueDays))
        setBankAccountName(s.bankAccountName || '')
        setBankAccountNumber(s.bankAccountNumber || '')
        setBankIfsc(s.bankIfsc || '')
        setBankName(s.bankName || '')
        setUpiId(s.upiId || '')
        setTermsAndConditions(s.termsAndConditions || '')
        setLogoUrl(s.logoUrl)
        setSignatureUrl(s.signatureUrl)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [currentBusinessId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await dataStore.upsertInvoiceSettings(currentBusinessId, {
        invoicePrefix: invoicePrefix.trim() || 'INV-',
        nextInvoiceNumber: parseInt(startingNumber) || 1,
        defaultDueDays: parseInt(defaultDueDays) || 7,
        bankAccountName: bankAccountName.trim() || null,
        bankAccountNumber: bankAccountNumber.trim() || null,
        bankIfsc: bankIfsc.trim() || null,
        bankName: bankName.trim() || null,
        upiId: upiId.trim() || null,
        termsAndConditions: termsAndConditions.trim() || null,
        logoUrl,
        signatureUrl,
      })
      toast.success('Invoice settings saved')
      onBack()
    } catch (err) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleUploadImage = async (type: 'logo' | 'signature') => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const ext = file.name.split('.').pop() || 'png'
      const path = `${currentBusinessId}/${type}_${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from('invoices')
        .upload(path, file, { upsert: true })

      if (error) {
        toast.error('Upload failed')
        return
      }

      const { data: urlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(path)

      if (type === 'logo') setLogoUrl(urlData.publicUrl)
      else setSignatureUrl(urlData.publicUrl)

      toast.success(`${type === 'logo' ? 'Logo' : 'Signature'} uploaded`)
    }
    input.click()
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: '#F2F4F8' }}>
        <div style={{ backgroundColor: '#0F1320', paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center px-4" style={{ height: '44px' }}>
            <button onClick={onBack} className="flex items-center justify-center" style={{ minWidth: '44px', minHeight: '44px', color: '#FFFFFF' }}>
              <ArrowLeft size={20} />
            </button>
            <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>Invoice settings</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <p style={{ fontSize: '14px', color: '#8492A6' }}>Loading...</p>
        </div>
      </div>
    )
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    color: '#8492A6',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '6px',
    paddingLeft: '2px',
  }

  const inputContainerStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    border: '1px solid rgba(0,0,0,0.08)',
    overflow: 'hidden',
    marginBottom: '16px',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '13px 14px',
    fontSize: '14px',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: '#1A1F2E',
    fontFamily: 'inherit',
  }

  const hintStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#8492A6',
    paddingLeft: '2px',
    marginTop: '-10px',
    marginBottom: '16px',
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#F2F4F8' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#0F1320', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center px-4" style={{ height: '44px' }}>
          <button onClick={onBack} className="flex items-center justify-center" style={{ minWidth: '44px', minHeight: '44px', color: '#FFFFFF' }}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>Invoice settings</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pt-4">
        {/* Business details (read-only) */}
        <div className="flex items-center justify-between mb-1.5">
          <p style={labelStyle}>BUSINESS DETAILS</p>
          <button onClick={onNavigateToBusinessDetails} style={{ fontSize: '11px', fontWeight: 600, color: '#4A6CF7', background: 'none', border: 'none', cursor: 'pointer' }}>
            Edit in business profile
          </button>
        </div>
        <div style={{ ...inputContainerStyle, padding: '12px 14px' }}>
          {business && (
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A1F2E' }}>{business.businessName}</p>
              {business.gstNumber && <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>GSTIN: {business.gstNumber}</p>}
              {business.businessAddress && <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>{business.businessAddress}</p>}
              {business.phone && <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>{business.phone}</p>}
            </div>
          )}
        </div>

        {/* Item master link */}
        <p style={labelStyle}>PRODUCTS</p>
        <button
          onClick={onNavigateToItemMaster}
          className="w-full flex items-center justify-between text-left"
          style={{ ...inputContainerStyle, padding: '14px', cursor: 'pointer', border: '1px solid rgba(74,108,247,0.2)', backgroundColor: 'rgba(74,108,247,0.04)' }}
        >
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#4A6CF7' }}>Item master</span>
          <span style={{ fontSize: '12px', color: '#8492A6' }}>Manage your products</span>
        </button>

        {/* Branding */}
        <p style={labelStyle}>BRANDING</p>
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => handleUploadImage('logo')}
            className="flex flex-col items-center justify-center gap-1"
            style={{
              flex: 1,
              height: '80px',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.08)',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }} />
            ) : (
              <>
                <Image size={20} color="#8492A6" />
                <span style={{ fontSize: '11px', color: '#8492A6' }}>Upload logo</span>
              </>
            )}
          </button>
          <button
            onClick={() => handleUploadImage('signature')}
            className="flex flex-col items-center justify-center gap-1"
            style={{
              flex: 1,
              height: '80px',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.08)',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
          >
            {signatureUrl ? (
              <img src={signatureUrl} alt="Signature" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }} />
            ) : (
              <>
                <PencilSimple size={20} color="#8492A6" />
                <span style={{ fontSize: '11px', color: '#8492A6' }}>Upload signature</span>
              </>
            )}
          </button>
        </div>

        {/* Invoice numbering */}
        <p style={labelStyle}>INVOICE NUMBERING</p>
        <div style={inputContainerStyle}>
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <input
              type="text"
              value={invoicePrefix}
              onChange={e => setInvoicePrefix(e.target.value)}
              placeholder="Prefix (e.g. INV-)"
              style={inputStyle}
            />
          </div>
          <div>
            <input
              type="number"
              inputMode="numeric"
              value={startingNumber}
              onChange={e => setStartingNumber(e.target.value)}
              placeholder="Starting number"
              style={inputStyle}
            />
          </div>
        </div>
        <p style={hintStyle}>
          Invoices will be numbered {invoicePrefix}{startingNumber} and so on. Auto-increments after each invoice.
        </p>

        {/* Bank details */}
        <p style={labelStyle}>BANK DETAILS</p>
        <div style={inputContainerStyle}>
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <input type="text" value={bankAccountName} onChange={e => setBankAccountName(e.target.value)} placeholder="Account name" style={inputStyle} />
          </div>
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <input type="text" value={bankAccountNumber} onChange={e => setBankAccountNumber(e.target.value)} placeholder="Account number" style={inputStyle} />
          </div>
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <input type="text" value={bankIfsc} onChange={e => setBankIfsc(e.target.value)} placeholder="IFSC code" style={inputStyle} />
          </div>
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Bank name" style={inputStyle} />
          </div>
          <div>
            <input type="text" value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="UPI ID" style={inputStyle} />
          </div>
        </div>

        {/* Terms */}
        <p style={labelStyle}>TERMS & CONDITIONS</p>
        <div style={inputContainerStyle}>
          <textarea
            value={termsAndConditions}
            onChange={e => setTermsAndConditions(e.target.value)}
            placeholder="Terms and conditions (shown on every invoice)"
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
          />
        </div>
        <p style={hintStyle}>
          These terms appear on every invoice. You can edit per invoice if needed.
        </p>

        {/* Default settings */}
        <p style={labelStyle}>DEFAULT SETTINGS</p>
        <div style={inputContainerStyle}>
          <div className="flex items-center">
            <input
              type="number"
              inputMode="numeric"
              value={defaultDueDays}
              onChange={e => setDefaultDueDays(e.target.value)}
              placeholder="Due days"
              style={{ ...inputStyle, flex: 1 }}
            />
            <span style={{ fontSize: '14px', color: '#8492A6', paddingRight: '14px' }}>days</span>
          </div>
        </div>
        <p style={hintStyle}>
          Due date on new invoices defaults to today + {defaultDueDays || '7'} days. Editable per invoice.
        </p>
      </div>

      {/* Save button */}
      <div className="px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full"
          style={{
            backgroundColor: '#4A6CF7',
            color: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}

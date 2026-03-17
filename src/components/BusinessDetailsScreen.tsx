import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, UploadSimple, FilePdf, Image, Trash, CheckCircle, Clock } from '@phosphor-icons/react'
import { CapacitorHttp } from '@capacitor/core'
import { dataStore } from '@/lib/data-store'
import { supabase } from '@/lib/supabase-client'
import { calculateCredibility, type CredibilityBreakdown } from '@/lib/credibility'
import { CredibilityBadge } from './CredibilityBadge'
import { toast } from 'sonner'
import type { BusinessDocument } from '@/lib/types'

const MOBILE_REGEX = /^(\+91|91|0)?[6-9]\d{9}$/

function validateMobileNumber(raw: string): string | null {
  const stripped = raw.replace(/[\s\-]/g, '')
  if (!stripped) return null
  if (!MOBILE_REGEX.test(stripped)) return 'Enter a valid 10-digit Indian mobile number'
  return null
}

function normalizeMobileNumber(raw: string): string {
  const stripped = raw.replace(/[\s\-]/g, '')
  if (stripped.startsWith('+91')) return stripped
  if (stripped.startsWith('91') && stripped.length === 12) return `+${stripped}`
  if (stripped.startsWith('0')) return `+91${stripped.slice(1)}`
  return `+91${stripped}`
}

interface Props {
  currentBusinessId: string
  onBack: () => void
  onSave?: () => void
  scrollToDocuments?: boolean
}

const BUSINESS_TYPES = ['Restaurant', 'Supplier', 'Manufacturer', 'Retailer', 'Distributor', 'Other']

const DOCUMENT_TYPES: { type: string; label: string; points: number; hasExpiry: boolean }[] = [
  { type: 'msme_udyam', label: 'MSME / Udyam Certificate', points: 8, hasExpiry: false },
  { type: 'trade_licence', label: 'Trade Licence', points: 7, hasExpiry: true },
  { type: 'fssai_licence', label: 'FSSAI Licence', points: 5, hasExpiry: true },
  { type: 'pan_card', label: 'PAN Card', points: 5, hasExpiry: false },
  { type: 'other', label: 'Other Document', points: 3, hasExpiry: false },
]

function isShortMapsLink(url: string): boolean {
  return /maps\.app\.goo\.gl/i.test(url)
}

async function expandShortLink(url: string): Promise<string> {
  try {
    const response = await CapacitorHttp.get({ url })
    if (response.url && response.url !== url) return response.url
  } catch {
    // native unavailable or failed; try fetch as fallback
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (res.url && res.url !== url) return res.url
    } catch {
      // ignore – return original
    }
  }
  return url
}

function parseGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  // Format: https://www.google.com/maps?q=17.4372,78.4483
  // Format: https://maps.google.com/?q=17.4372,78.4483
  const qMatch = url.match(/[?&]q=([-\d.]+),([-\d.]+)/)
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) }

  // Format: https://www.google.com/maps/@17.4372,78.4483,17z
  const atMatch = url.match(/@([-\d.]+),([-\d.]+)/)
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }

  // Format: https://www.google.com/maps/place/.../@17.4372,78.4483,...
  const placeMatch = url.match(/place\/.*\/@([-\d.]+),([-\d.]+)/)
  if (placeMatch) return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) }

  // Format with ll= parameter
  const llMatch = url.match(/[?&]ll=([-\d.]+),([-\d.]+)/)
  if (llMatch) return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) }

  return null
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function BusinessDetailsScreen({ currentBusinessId, onBack, onSave, scrollToDocuments }: Props) {
  const [gst, setGst] = useState('')
  const [address, setAddress] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [website, setWebsite] = useState('')
  const [phone, setPhone] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [description, setDescription] = useState('')
  const [mobileNumberError, setMobileNumberError] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [expandedMapsUrl, setExpandedMapsUrl] = useState('')
  const [parsedLocation, setParsedLocation] = useState<{ lat: number; lng: number; formattedAddress?: string } | null>(null)
  const [existingLocation, setExistingLocation] = useState<{ lat: number; lng: number; url?: string; formattedAddress?: string } | null>(null)
  const [locationConfirmed, setLocationConfirmed] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [gstError, setGstError] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandingLink, setExpandingLink] = useState(false)
  const [credibility, setCredibility] = useState<CredibilityBreakdown | null>(null)

  // Documents state
  const [documents, setDocuments] = useState<BusinessDocument[]>([])
  const [uploadingType, setUploadingType] = useState<string | null>(null)
  const [pendingExpiry, setPendingExpiry] = useState<{ type: string; file: File } | null>(null)
  const [expiryDate, setExpiryDate] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadExisting() {
      const entity = await dataStore.getBusinessEntityById(currentBusinessId)
      if (!entity) return
      if (entity.gstNumber) setGst(entity.gstNumber)
      if (entity.businessAddress) setAddress(entity.businessAddress)
      if (entity.businessType) setBusinessType(entity.businessType)
      if (entity.website) setWebsite(entity.website)
      if (entity.phone) setPhone(entity.phone)
      if (entity.description) setDescription(entity.description)
      if (entity.latitude && entity.longitude) {
        setExistingLocation({
          lat: entity.latitude,
          lng: entity.longitude,
          url: entity.googleMapsUrl,
          formattedAddress: entity.formattedAddress,
        })
      }
      if (entity.googleMapsUrl) setMapsUrl(entity.googleMapsUrl)

      if (entity.mobileNumber) {
        setMobileNumber(entity.mobileNumber)
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.phone) setMobileNumber(user.phone)
      }
    }
    loadExisting()
  }, [currentBusinessId])

  useEffect(() => {
    async function loadCredibility() {
      const result = await calculateCredibility(currentBusinessId)
      setCredibility(result)
    }
    loadCredibility()
  }, [currentBusinessId])

  useEffect(() => {
    async function loadDocuments() {
      try {
        const docs = await dataStore.getDocumentsByBusinessId(currentBusinessId)
        setDocuments(docs)
      } catch {
        // non-critical
      }
    }
    loadDocuments()
  }, [currentBusinessId])

  useEffect(() => {
    if (scrollToDocuments && docsRef.current) {
      setTimeout(() => {
        docsRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 300)
    }
  }, [scrollToDocuments])

  const handleSetLocation = async () => {
    setLocationError('')
    const trimmed = mapsUrl.trim()
    if (!trimmed) {
      setLocationError('Please paste a Google Maps link')
      return
    }

    let resolvedUrl = trimmed
    if (isShortMapsLink(trimmed)) {
      setExpandingLink(true)
      resolvedUrl = await expandShortLink(trimmed)
      setExpandingLink(false)
    }

    setExpandedMapsUrl(resolvedUrl)
    const parsed = parseGoogleMapsUrl(resolvedUrl)
    if (parsed) {
      setParsedLocation({ lat: parsed.lat, lng: parsed.lng })
    } else {
      setParsedLocation(null)
    }
    setExistingLocation(null)
    setLocationConfirmed(true)
  }

  const handleMapsUrlChange = (value: string) => {
    setMapsUrl(value)
    setLocationError('')
    setLocationConfirmed(false)
  }

  const handleClearLocation = () => {
    setParsedLocation(null)
    setExistingLocation(null)
    setExpandedMapsUrl('')
    setMapsUrl('')
    setLocationError('')
    setLocationConfirmed(false)
  }

  const handleSave = async () => {
    setGstError('')
    setMobileNumberError('')

    const mobileError = validateMobileNumber(mobileNumber)
    if (mobileError) {
      setMobileNumberError(mobileError)
      return
    }

    if (gst.trim()) {
      const allEntities = await dataStore.getAllBusinessEntities()
      const duplicate = allEntities.find(
        e => e.id !== currentBusinessId && e.gstNumber === gst.trim()
      )
      if (duplicate) {
        setGstError('This GST number is already registered. Contact support if this is your business.')
        return
      }
    }
    setSaving(true)
    try {
      await dataStore.updateBusinessDetails(currentBusinessId, {
        gstNumber: gst.trim() || undefined,
        address: address.trim() || undefined,
        businessType: businessType || undefined,
        website: website.trim() || undefined,
        description: description.trim() || undefined,
      })

      if (phone.trim()) {
        await dataStore.updateBusinessPhone(currentBusinessId, phone.trim())
      }

      const strippedMobile = mobileNumber.replace(/[\s\-]/g, '')
      await dataStore.updateBusinessMobileNumber(
        currentBusinessId,
        strippedMobile ? normalizeMobileNumber(mobileNumber) : null
      )

      const urlToStore = expandedMapsUrl || mapsUrl.trim()
      if (parsedLocation && urlToStore) {
        await dataStore.updateBusinessLocation(currentBusinessId, {
          latitude: parsedLocation.lat,
          longitude: parsedLocation.lng,
          googleMapsUrl: urlToStore,
          formattedAddress: parsedLocation.formattedAddress,
        })
      } else if (urlToStore && locationConfirmed) {
        await dataStore.updateBusinessMapsUrl(currentBusinessId, urlToStore)
      }

      // Recalculate credibility after saving
      const newCredibility = await calculateCredibility(currentBusinessId)
      setCredibility(newCredibility)

      toast.success('Saved')
      if (onSave) onSave()
      else onBack()
    } catch (err) {
      console.error(err)
      toast.error('Failed to save details')
    } finally {
      setSaving(false)
    }
  }

  const handleDocumentRowTap = (docType: string, hasExpiry: boolean) => {
    // Check if already uploaded
    const existing = documents.find(d => d.documentType === docType)
    if (existing) return // already uploaded, do nothing (delete via trash icon)

    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('data-doc-type', docType)
      fileInputRef.current.setAttribute('data-has-expiry', String(hasExpiry))
      fileInputRef.current.click()
    }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset

    const docType = fileInputRef.current?.getAttribute('data-doc-type') || 'other'
    const hasExpiry = fileInputRef.current?.getAttribute('data-has-expiry') === 'true'

    // Validate
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB')
      return
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(file.type)) {
      toast.error('Only PDF, JPG, or PNG files allowed')
      return
    }

    if (hasExpiry) {
      setPendingExpiry({ type: docType, file })
      setExpiryDate('')
      return
    }

    await doUpload(docType, file, undefined)
  }

  const doUpload = async (docType: string, file: File, expiry: string | undefined) => {
    setUploadingType(docType)
    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const fileName = `${docType}_${Date.now()}.${ext}`
      const path = `${currentBusinessId}/${docType}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('business-documents')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('business-documents')
        .getPublicUrl(path)

      const doc = await dataStore.uploadBusinessDocument(currentBusinessId, {
        documentType: docType,
        fileName: file.name,
        fileUrl: publicUrl,
        fileSizeBytes: file.size,
        mimeType: file.type,
        expiryDate: expiry || undefined,
      })

      setDocuments(prev => [doc, ...prev])

      // Recalculate credibility
      const newCred = await calculateCredibility(currentBusinessId)
      setCredibility(newCred)

      toast.success('Document uploaded')
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Upload failed. Please try again.')
    } finally {
      setUploadingType(null)
    }
  }

  const handleExpiryConfirm = async () => {
    if (!pendingExpiry) return
    const { type, file } = pendingExpiry
    const expiry = expiryDate || undefined
    setPendingExpiry(null)
    await doUpload(type, file, expiry)
  }

  const handleDeleteDocument = async (doc: BusinessDocument) => {
    try {
      await dataStore.deleteBusinessDocument(doc.id)
      setDocuments(prev => prev.filter(d => d.id !== doc.id))

      // Optionally remove from storage
      const path = `${currentBusinessId}/${doc.documentType}/${doc.fileName}`
      await supabase.storage.from('business-documents').remove([path]).catch(() => {})

      const newCred = await calculateCredibility(currentBusinessId)
      setCredibility(newCred)
      toast.success('Document removed')
    } catch {
      toast.error('Failed to remove document')
    }
  }

  const locationDisplay = parsedLocation || existingLocation

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-screen)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '12px' }}>
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Business Details</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Adding details builds credibility and helps connections verify your business.
        </p>

        {/* Credibility Progress */}
        {credibility && (
          <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Credibility
                </span>
                {credibility.level !== 'none' && <CredibilityBadge level={credibility.level} />}
              </div>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {credibility.score}/100
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: '4px', backgroundColor: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: '4px',
                  transition: 'width 0.5s',
                  width: `${credibility.score}%`,
                  background: 'linear-gradient(90deg, #4A6CF7, #22B573)',
                }}
              />
            </div>

            {/* Missing items as hints */}
            {credibility.missingItems.length > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Add {credibility.missingItems.slice(0, 2).join(' and ')} to improve your credibility
              </p>
            )}
          </div>
        )}

        {/* Phone number */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Business Phone</label>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. 9876543210"
            maxLength={15}
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border-light)', borderRadius: '8px', boxSizing: 'border-box', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Mobile Number */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Mobile Number</label>
          <input
            type="tel"
            value={mobileNumber}
            onChange={e => { setMobileNumber(e.target.value); setMobileNumberError('') }}
            placeholder="+91 98765 43210"
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: `1px solid ${mobileNumberError ? 'var(--status-overdue)' : 'var(--border-light)'}`, borderRadius: '8px', boxSizing: 'border-box', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
          />
          {mobileNumberError && <p style={{ color: 'var(--status-overdue)', fontSize: '12px', marginTop: '4px' }}>{mobileNumberError}</p>}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>GST Number</label>
          <input
            type="text"
            value={gst}
            onChange={e => { setGst(e.target.value); setGstError('') }}
            placeholder="e.g. 22AAAAA0000A1Z5"
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border-light)', borderRadius: '8px', boxSizing: 'border-box', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
          />
          {gstError && <p style={{ color: 'var(--status-overdue)', fontSize: '12px', marginTop: '4px' }}>{gstError}</p>}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Business Type</label>
          <select
            value={businessType}
            onChange={e => setBusinessType(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border-light)', borderRadius: '8px', boxSizing: 'border-box', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
          >
            <option value="">Select type</option>
            {BUSINESS_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Business Description */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Business Description
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '6px', fontWeight: 400 }}>+5 pts</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value.slice(0, 200))}
            placeholder="e.g. We supply dry groceries and spices across Hyderabad"
            rows={3}
            maxLength={200}
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border-light)', borderRadius: '8px', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
          />
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'right', marginTop: '2px' }}>
            {200 - description.length} remaining
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Business Address</label>
          <textarea
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Enter your business address"
            rows={3}
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border-light)', borderRadius: '8px', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Map Location – paste Google Maps link */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Map Location</label>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Open Google Maps → Share → Copy link
          </p>

          {locationDisplay ? (
            <div style={{ padding: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
              <p style={{ fontSize: '13px', color: '#166534', marginBottom: '2px' }}>
                {locationDisplay.formattedAddress ||
                  (locationDisplay.lat != null
                    ? `${locationDisplay.lat.toFixed(5)}, ${locationDisplay.lng.toFixed(5)}`
                    : 'Link saved')}
              </p>
              {locationDisplay.lat != null && (
                <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                  {locationDisplay.lat.toFixed(5)}, {locationDisplay.lng.toFixed(5)}
                </p>
              )}
              <button
                onClick={handleClearLocation}
                style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={mapsUrl}
                onChange={e => handleMapsUrlChange(e.target.value)}
                placeholder="Paste Google Maps link here"
                style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border-light)', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '8px', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={handleSetLocation}
                disabled={expandingLink}
                style={{ padding: '8px 16px', fontSize: '13px', backgroundColor: 'var(--border-light)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: expandingLink ? 'not-allowed' : 'pointer', opacity: expandingLink ? 0.7 : 1 }}
              >
                {expandingLink ? 'Checking…' : 'Set Location'}
              </button>
              {locationConfirmed && !parsedLocation && (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Link saved (coordinates could not be extracted)
                </p>
              )}
              {locationError && <p style={{ color: 'var(--status-overdue)', fontSize: '12px', marginTop: '4px' }}>{locationError}</p>}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Website</label>
          <input
            type="text"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            placeholder="e.g. www.yourbusiness.com"
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border-light)', borderRadius: '8px', boxSizing: 'border-box', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Save Button */}
        <div style={{ marginBottom: '32px' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ width: '100%', padding: '14px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Details'}
          </button>
        </div>

        {/* Documents Section */}
        <div ref={docsRef} style={{ borderTop: '1px solid var(--border-light)', paddingTop: '24px', marginBottom: '32px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
            DOCUMENTS
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Add documents to build credibility and let connections verify your business.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
            {DOCUMENT_TYPES.map((docDef, idx) => {
              const uploaded = documents.find(d => d.documentType === docDef.type)
              const isUploading = uploadingType === docDef.type
              const isLast = idx === DOCUMENT_TYPES.length - 1

              return (
                <div
                  key={docDef.type}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '12px 16px',
                    backgroundColor: 'var(--bg-card)',
                    borderBottom: isLast ? 'none' : '1px solid var(--border-light)',
                    cursor: uploaded || isUploading ? 'default' : 'pointer',
                  }}
                  onClick={() => !uploaded && !isUploading && handleDocumentRowTap(docDef.type, docDef.hasExpiry)}
                >
                  {/* Icon */}
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: uploaded ? '#DCFCE7' : '#F3F4F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '12px',
                    flexShrink: 0,
                  }}>
                    {uploaded ? (
                      uploaded.mimeType?.startsWith('image/') ? (
                        <Image size={18} color="#16A34A" />
                      ) : (
                        <FilePdf size={18} color="#16A34A" />
                      )
                    ) : (
                      <UploadSimple size={18} color="var(--text-secondary)" />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {docDef.label}
                      </span>
                      {!uploaded && (
                        <span style={{ fontSize: '11px', color: 'var(--brand-primary)', fontWeight: 600 }}>
                          +{docDef.points} pts
                        </span>
                      )}
                    </div>

                    {uploaded && (
                      <div style={{ marginTop: '2px' }}>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {formatFileSize(uploaded.fileSizeBytes)} · {formatUploadDate(uploaded.uploadedAt)}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          {uploaded.verificationStatus === 'verified' ? (
                            <>
                              <CheckCircle size={12} color="#16A34A" weight="fill" />
                              <span style={{ fontSize: '11px', color: '#16A34A' }}>Verified</span>
                            </>
                          ) : (
                            <>
                              <Clock size={12} color="var(--status-dispatched)" />
                              <span style={{ fontSize: '11px', color: 'var(--status-dispatched)' }}>Verification pending</span>
                            </>
                          )}
                        </div>
                        {uploaded.expiryDate && (
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Exp: {uploaded.expiryDate}
                          </p>
                        )}
                      </div>
                    )}

                    {isUploading && (
                      <p style={{ fontSize: '12px', color: 'var(--brand-primary)', marginTop: '2px' }}>Uploading…</p>
                    )}
                  </div>

                  {/* Delete button */}
                  {uploaded && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteDocument(uploaded) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--status-overdue)' }}
                    >
                      <Trash size={16} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Expiry date modal */}
      {pendingExpiry && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '16px 16px 0 0', padding: '24px 16px', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Expiry Date</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Enter the expiry date for this document (optional).
            </p>
            <input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border-light)', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '16px', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setPendingExpiry(null)}
                style={{ flex: 1, padding: '12px', border: '1px solid var(--border-light)', borderRadius: '8px', fontSize: '14px', backgroundColor: 'var(--bg-card)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleExpiryConfirm}
                style={{ flex: 2, padding: '12px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

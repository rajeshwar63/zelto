import { useState, useEffect } from 'react'
import { ArrowLeft, FileText, CaretRight } from '@phosphor-icons/react'
import { CapacitorHttp } from '@capacitor/core'
import { dataStore } from '@/lib/data-store'
import { supabase } from '@/lib/supabase-client'
import { calculateCredibility, type CredibilityBreakdown } from '@/lib/credibility'
import { toast } from 'sonner'

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
  onNavigateToDocuments?: () => void
}

const BUSINESS_TYPES = ['Restaurant', 'Supplier', 'Manufacturer', 'Retailer', 'Distributor', 'Other']

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

export function BusinessDetailsScreen({ currentBusinessId, onBack, onSave, onNavigateToDocuments }: Props) {
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

  const locationDisplay = parsedLocation || existingLocation

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-screen)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>

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

        {/* Compliance Documents Link */}
        {onNavigateToDocuments && (
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '24px', marginBottom: '32px' }}>
            <button
              onClick={onNavigateToDocuments}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 16px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                backgroundColor: '#EEF0FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <FileText size={18} color="#4A6CF7" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Compliance Documents
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', marginBottom: 0 }}>
                  Upload GST, FSSAI, PAN and other certificates
                </p>
              </div>
              <CaretRight size={16} color="var(--text-secondary)" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { ArrowLeft, Phone, DeviceMobile, IdentificationCard, Buildings, MapPin, Globe, Warning } from '@phosphor-icons/react'
import { CapacitorHttp } from '@capacitor/core'
import { dataStore } from '@/lib/data-store'
import { supabase } from '@/lib/supabase-client'
import { calculateCredibility, type CredibilityBreakdown } from '@/lib/credibility'
import { computeTrustScore, type TrustScoreBreakdown } from '@/lib/trust-score'
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
  const qMatch = url.match(/[?&]q=([-\d.]+),([-\d.]+)/)
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) }

  const atMatch = url.match(/@([-\d.]+),([-\d.]+)/)
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }

  const placeMatch = url.match(/place\/.*\/@([-\d.]+),([-\d.]+)/)
  if (placeMatch) return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) }

  const llMatch = url.match(/[?&]ll=([-\d.]+),([-\d.]+)/)
  if (llMatch) return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) }

  return null
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 14px 13px 40px',
  fontSize: '14px',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const inputNoIconStyle: React.CSSProperties = {
  ...inputStyle,
  paddingLeft: '14px',
}

const fieldRowStyle: React.CSSProperties = {
  position: 'relative',
  borderBottom: '1px solid var(--border-light)',
}

const fieldLastRowStyle: React.CSSProperties = {
  position: 'relative',
}

const iconWrapStyle: React.CSSProperties = {
  position: 'absolute',
  left: '12px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--text-secondary)',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
}

const sectionCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  borderRadius: '14px',
  border: '1px solid var(--border-light)',
  overflow: 'hidden',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  marginBottom: '20px',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: '8px',
  paddingLeft: '2px',
}

export function BusinessDetailsScreen({ currentBusinessId, onBack, onSave }: Props) {
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
      const result = await computeTrustScore(currentBusinessId)
      setCredibility({ score: result.total, level: result.level, completedItems: [], missingItems: [] })
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

      const newTrust = await computeTrustScore(currentBusinessId)
      setCredibility({ score: newTrust.total, level: newTrust.level, completedItems: [], missingItems: [] })

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
  const credScore = credibility?.score ?? null
  const credMax = 100

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-screen)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '16px 16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', borderRadius: '10px', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <ArrowLeft size={20} color="#0F1320" weight="bold" />
        </button>
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: '#0F1320' }}>Business Details</h2>
          <p style={{ fontSize: '12px', color: '#8492A6', margin: 0 }}>Complete your profile to build trust</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* Credibility Banner */}
        {credScore !== null && (
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: '14px',
            padding: '14px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: 'rgba(74,108,247,0.1)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#4A6CF7', lineHeight: 1 }}>{credScore}</span>
              <span style={{ fontSize: '9px', color: '#8492A6', lineHeight: 1, marginTop: '1px' }}>/ {credMax}</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F1320', margin: '0 0 6px' }}>Trust Score</p>
              <div style={{ height: 6, backgroundColor: '#E8ECF2', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (credScore / credMax) * 100)}%`, backgroundColor: '#4A6CF7', borderRadius: 99, transition: 'width 0.4s ease' }} />
              </div>
              <p style={{ fontSize: '11px', color: '#8492A6', margin: '4px 0 0' }}>
                {credScore < 50 ? 'Fill in more details to increase your score' : credScore < 80 ? 'Good progress — keep adding details' : 'Excellent profile!'}
              </p>
            </div>
          </div>
        )}

        {/* Contact Section */}
        <p style={sectionLabelStyle}>Contact</p>
        <div style={sectionCardStyle}>
          <div style={fieldRowStyle}>
            <span style={iconWrapStyle}><Phone size={16} /></span>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Business Phone"
              maxLength={15}
              style={inputStyle}
            />
          </div>
          <div style={fieldLastRowStyle}>
            <span style={iconWrapStyle}><DeviceMobile size={16} /></span>
            <input
              type="tel"
              value={mobileNumber}
              onChange={e => { setMobileNumber(e.target.value); setMobileNumberError('') }}
              placeholder="Mobile Number (+91…)"
              style={{ ...inputStyle, borderColor: mobileNumberError ? 'var(--status-overdue)' : undefined }}
            />
          </div>
          {mobileNumberError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px 10px', color: 'var(--status-overdue)' }}>
              <Warning size={13} />
              <span style={{ fontSize: '12px' }}>{mobileNumberError}</span>
            </div>
          )}
        </div>

        {/* Business Info Section */}
        <p style={sectionLabelStyle}>Business Info</p>
        <div style={sectionCardStyle}>
          <div style={fieldRowStyle}>
            <span style={iconWrapStyle}><Buildings size={16} /></span>
            <select
              value={businessType}
              onChange={e => setBusinessType(e.target.value)}
              style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}
            >
              <option value="">Business Type</option>
              {BUSINESS_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div style={fieldRowStyle}>
            <span style={iconWrapStyle}><IdentificationCard size={16} /></span>
            <input
              type="text"
              value={gst}
              onChange={e => { setGst(e.target.value); setGstError('') }}
              placeholder="GST Number (e.g. 22AAAAA0000A1Z5)"
              style={inputStyle}
            />
          </div>
          {gstError && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '6px 14px', color: 'var(--status-overdue)' }}>
              <Warning size={13} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: '12px' }}>{gstError}</span>
            </div>
          )}
          <div style={fieldLastRowStyle}>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 200))}
              placeholder="Business Description — e.g. We supply dry groceries and spices across Hyderabad"
              rows={3}
              maxLength={200}
              style={{ ...inputNoIconStyle, resize: 'none', paddingTop: '13px', paddingBottom: '4px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 14px 10px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-screen)', borderRadius: 99, padding: '1px 8px' }}>
                {200 - description.length} remaining
              </span>
            </div>
          </div>
        </div>

        {/* Location Section */}
        <p style={sectionLabelStyle}>Location</p>
        <div style={sectionCardStyle}>
          <div style={fieldRowStyle}>
            <span style={iconWrapStyle}><MapPin size={16} /></span>
            <textarea
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Business Address"
              rows={2}
              style={{ ...inputStyle, resize: 'none', paddingTop: '13px' }}
            />
          </div>

          {/* Map Location */}
          <div style={{ padding: '12px 14px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={12} />
              Open Google Maps → Share → Copy link
            </p>

            {locationDisplay ? (
              <div style={{ padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '13px', color: '#166534', margin: 0, fontWeight: 500 }}>
                    {locationDisplay.formattedAddress ||
                      (locationDisplay.lat != null
                        ? `${locationDisplay.lat.toFixed(5)}, ${locationDisplay.lng.toFixed(5)}`
                        : 'Link saved')}
                  </p>
                  {locationDisplay.lat != null && !locationDisplay.formattedAddress && (
                    <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>
                      {locationDisplay.lat.toFixed(5)}, {locationDisplay.lng.toFixed(5)}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClearLocation}
                  style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', textDecoration: 'underline', flexShrink: 0 }}
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
                  style={{ width: '100%', padding: '11px 12px', fontSize: '14px', border: '1px solid var(--border-light)', borderRadius: '10px', boxSizing: 'border-box', marginBottom: '8px', backgroundColor: 'var(--bg-screen)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }}
                />
                <button
                  onClick={handleSetLocation}
                  disabled={expandingLink}
                  style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 600, backgroundColor: '#EEF0FF', color: '#4A6CF7', border: '1px solid #C7CEFF', borderRadius: '8px', cursor: expandingLink ? 'not-allowed' : 'pointer', opacity: expandingLink ? 0.7 : 1 }}
                >
                  {expandingLink ? 'Checking…' : 'Set Location'}
                </button>
                {locationConfirmed && !parsedLocation && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    Link saved (coordinates could not be extracted)
                  </p>
                )}
                {locationError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', color: 'var(--status-overdue)' }}>
                    <Warning size={13} />
                    <span style={{ fontSize: '12px' }}>{locationError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Online Presence Section */}
        <p style={sectionLabelStyle}>Online Presence</p>
        <div style={sectionCardStyle}>
          <div style={fieldLastRowStyle}>
            <span style={iconWrapStyle}><Globe size={16} /></span>
            <input
              type="text"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="Website (e.g. www.yourbusiness.com)"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%',
            padding: '15px',
            background: saving ? '#9aabf7' : 'linear-gradient(135deg, #4A6CF7 0%, #6B8EFF 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '14px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            marginBottom: '32px',
            boxShadow: saving ? 'none' : '0 4px 14px rgba(74, 108, 247, 0.4)',
            transition: 'opacity 0.2s',
          }}
        >
          {saving ? 'Saving…' : 'Save Details'}
        </button>

      </div>
    </div>
  )
}

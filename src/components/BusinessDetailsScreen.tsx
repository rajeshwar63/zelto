import { useState, useEffect } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { calculateCredibility, type CredibilityBreakdown } from '@/lib/credibility'
import { toast } from 'sonner'

interface Props {
  currentBusinessId: string
  onBack: () => void
  onSave?: () => void
}

const BUSINESS_TYPES = ['Restaurant', 'Supplier', 'Manufacturer', 'Retailer', 'Distributor', 'Other']

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

export function BusinessDetailsScreen({ currentBusinessId, onBack, onSave }: Props) {
  const [gst, setGst] = useState('')
  const [address, setAddress] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [website, setWebsite] = useState('')
  const [phone, setPhone] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [parsedLocation, setParsedLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [existingLocation, setExistingLocation] = useState<{ lat: number; lng: number; url?: string } | null>(null)
  const [locationError, setLocationError] = useState('')
  const [gstError, setGstError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
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
      if (entity.latitude && entity.longitude) {
        setExistingLocation({
          lat: entity.latitude,
          lng: entity.longitude,
          url: entity.googleMapsUrl,
        })
      }
      if (entity.googleMapsUrl) setMapsUrl(entity.googleMapsUrl)
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

  const handleVerifyLocation = () => {
    setLocationError('')
    const trimmed = mapsUrl.trim()
    if (!trimmed) {
      setLocationError('Please paste a Google Maps link')
      return
    }

    const parsed = parseGoogleMapsUrl(trimmed)
    if (!parsed) {
      setLocationError('Could not extract location. Please use the full Google Maps URL (not the short link). Open your location in Google Maps on a browser and copy the URL from the address bar.')
      return
    }

    setParsedLocation(parsed)
    setExistingLocation(null)
  }

  const handleClearLocation = () => {
    setParsedLocation(null)
    setExistingLocation(null)
    setMapsUrl('')
    setLocationError('')
  }

  const handleSave = async () => {
    setGstError('')
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
      })

      if (phone.trim()) {
        await dataStore.updateBusinessPhone(currentBusinessId, phone.trim())
      }

      if (parsedLocation) {
        await dataStore.updateBusinessLocation(currentBusinessId, {
          latitude: parsedLocation.lat,
          longitude: parsedLocation.lng,
          googleMapsUrl: mapsUrl.trim(),
        })
      }

      // Recalculate credibility after saving
      await calculateCredibility(currentBusinessId)

      setSaved(true)
      setTimeout(() => {
        if (onSave) onSave()
        else onBack()
      }, 800)
    } catch (err) {
      console.error(err)
      toast.error('Failed to save details')
    } finally {
      setSaving(false)
    }
  }

  const locationDisplay = parsedLocation || existingLocation

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#fff', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '12px' }}>
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Business Details</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
          Adding details builds credibility and helps connections verify your business.
        </p>

        {/* Credibility Progress */}
        {credibility && (
          <div style={{ marginBottom: '24px', padding: '16px', borderRadius: '8px', border: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '500', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Credibility
              </span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#222' }}>
                {credibility.score}/100
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: '8px', backgroundColor: '#e8e8e8', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: '4px',
                  transition: 'width 0.5s',
                  width: `${credibility.score}%`,
                  backgroundColor: credibility.level === 'trusted' ? '#22C55E'
                    : credibility.level === 'verified' ? '#3B82F6'
                    : credibility.level === 'basic' ? '#F59E0B'
                    : '#D1D5DB'
                }}
              />
            </div>

            {/* Level label */}
            <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
              {credibility.level === 'trusted' ? 'Trusted Business'
                : credibility.level === 'verified' ? 'Verified'
                : credibility.level === 'basic' ? 'Basic Profile'
                : 'New Business'}
            </p>

            {/* Missing items as hints */}
            {credibility.missingItems.length > 0 && (
              <p style={{ fontSize: '12px', color: '#888' }}>
                Add {credibility.missingItems.slice(0, 2).join(' and ')} to improve your credibility
              </p>
            )}
          </div>
        )}

        {/* Phone number */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: '#444', display: 'block', marginBottom: '6px' }}>Phone Number</label>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. 9876543210"
            maxLength={15}
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: '#444', display: 'block', marginBottom: '6px' }}>GST Number</label>
          <input
            type="text"
            value={gst}
            onChange={e => { setGst(e.target.value); setGstError('') }}
            placeholder="e.g. 22AAAAA0000A1Z5"
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box' }}
          />
          {gstError && <p style={{ color: '#D64545', fontSize: '12px', marginTop: '4px' }}>{gstError}</p>}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: '#444', display: 'block', marginBottom: '6px' }}>Business Type</label>
          <select
            value={businessType}
            onChange={e => setBusinessType(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', backgroundColor: '#fff' }}
          >
            <option value="">Select type</option>
            {BUSINESS_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: '#444', display: 'block', marginBottom: '6px' }}>Business Address</label>
          <textarea
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Enter your business address"
            rows={3}
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {/* Google Maps Location */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: '#444', display: 'block', marginBottom: '6px' }}>Map Location</label>

          {locationDisplay ? (
            <div style={{ padding: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
              <p style={{ fontSize: '13px', color: '#166534', marginBottom: '4px' }}>
                Location set ({locationDisplay.lat.toFixed(4)}, {locationDisplay.lng.toFixed(4)})
              </p>
              <button
                onClick={handleClearLocation}
                style={{ fontSize: '12px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                Open Google Maps, find your business or drop a pin, tap Share and copy the link.
              </p>
              <input
                type="text"
                value={mapsUrl}
                onChange={e => { setMapsUrl(e.target.value); setLocationError('') }}
                placeholder="Paste Google Maps link here"
                style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '8px' }}
              />
              <button
                onClick={handleVerifyLocation}
                style={{ padding: '8px 16px', fontSize: '13px', backgroundColor: '#f0f0f0', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer' }}
              >
                Verify Location
              </button>
              {locationError && <p style={{ color: '#D64545', fontSize: '12px', marginTop: '4px' }}>{locationError}</p>}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', color: '#444', display: 'block', marginBottom: '6px' }}>Website</label>
          <input
            type="text"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            placeholder="e.g. www.yourbusiness.com"
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid #f0f0f0' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ width: '100%', padding: '14px', backgroundColor: saved ? '#4CAF50' : '#1A1A2E', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saved ? 'Saved' : saving ? 'Saving...' : 'Save Details'}
        </button>
      </div>
    </div>
  )
}

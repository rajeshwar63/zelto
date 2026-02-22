import { useState, useEffect } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'

interface Props {
  currentBusinessId: string
  onBack: () => void
}

const BUSINESS_TYPES = ['Restaurant', 'Supplier', 'Manufacturer', 'Retailer', 'Distributor', 'Other']

export function BusinessDetailsScreen({ currentBusinessId, onBack }: Props) {
  const [gst, setGst] = useState('')
  const [address, setAddress] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [website, setWebsite] = useState('')
  const [gstError, setGstError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function loadExisting() {
      const entity = await dataStore.getBusinessEntityById(currentBusinessId)
      if (!entity) return
      if (entity.gstNumber) setGst(entity.gstNumber)
      if (entity.businessAddress) setAddress(entity.businessAddress)
      if (entity.businessType) setBusinessType(entity.businessType)
      if (entity.website) setWebsite(entity.website)
    }
    loadExisting()
  }, [currentBusinessId])

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
      setSaved(true)
      setTimeout(() => onBack(), 800)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#fff', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '12px' }}>
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Business Details</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <p style={{ fontSize: '13px', color: '#888', marginBottom: '24px' }}>
          All fields are optional. Adding details helps build credibility and prevents duplicate accounts.
        </p>

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
          <label style={{ fontSize: '13px', color: '#444', display: 'block', marginBottom: '6px' }}>Business Address</label>
          <textarea
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Enter your business address"
            rows={3}
            style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit' }}
          />
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
          {saved ? 'Saved ✓' : saving ? 'Saving...' : 'Save Details'}
        </button>
      </div>
    </div>
  )
}
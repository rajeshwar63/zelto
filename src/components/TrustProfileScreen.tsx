import { useState, useEffect } from 'react'
import { ArrowLeft, Buildings, Note, Briefcase, MapPin, Link, User, Phone, PencilSimple } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { calculateCredibility, getBusinessActivityCounts, type CredibilityBreakdown } from '@/lib/credibility'
import { TrustBadge } from './TrustBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { emitDataChange } from '@/lib/data-events'
import { consumePendingConnectionLabels } from '@/lib/pending-connection-labels'
import { toast } from 'sonner'
import type { BusinessEntity, BusinessDocument, Connection } from '@/lib/types'

export type TrustProfileActionMode = 'send-request' | 'accept-request' | 'view-connection'
export type TrustProfileAudience = 'connection-review' | 'self-profile-ready'

export interface TrustProfileScreenMode {
  action: TrustProfileActionMode
  audience: TrustProfileAudience
}

interface Props {
  targetBusinessId: string
  currentBusinessId: string
  screenMode: TrustProfileScreenMode
  connectionRequestId?: string
  connectionId?: string
  initialTab?: 'identity' | 'docs'
  onBack: () => void
  onNavigateToEditBusiness?: (scrollToDocuments?: boolean) => void
  onRequestSent?: () => void
  onRequestAccepted?: () => void
  onRequestDeclined?: () => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

function formatUploadDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

type DocExpiryInfo =
  | { status: 'none' }
  | { status: 'valid'; validTill: string }
  | { status: 'expiring'; daysLeft: number }
  | { status: 'expired'; daysAgo: number }

function getDocExpiryInfo(expiryDate?: string): DocExpiryInfo {
  if (!expiryDate) return { status: 'none' }
  const expiryMs = new Date(expiryDate).getTime()
  if (isNaN(expiryMs)) return { status: 'none' }
  const now = Date.now()
  const diffMs = expiryMs - now
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffMs < 0) {
    return { status: 'expired', daysAgo: Math.abs(diffDays) }
  } else if (diffDays <= 30) {
    return { status: 'expiring', daysLeft: diffDays }
  } else {
    const validTill = new Date(expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    return { status: 'valid', validTill }
  }
}

export function TrustProfileScreen({
  targetBusinessId,
  currentBusinessId,
  screenMode,
  connectionRequestId,
  connectionId,
  initialTab,
  onBack,
  onNavigateToEditBusiness,
  onRequestSent,
  onRequestAccepted,
  onRequestDeclined,
}: Props) {
  const { action, audience } = screenMode
  const isConnectionReview = audience === 'connection-review'
  const isSelfProfileReady = audience === 'self-profile-ready'
  const [activeTab, setActiveTab] = useState<'identity' | 'docs'>(initialTab ?? 'identity')

  // Data
  const [business, setBusiness] = useState<BusinessEntity | null>(null)
  const [credibility, setCredibility] = useState<CredibilityBreakdown | null>(null)
  const [documents, setDocuments] = useState<BusinessDocument[]>([])
  const [activityCounts, setActivityCounts] = useState<{ connectionCount: number; orderCount: number } | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)

  // Loading
  const [loadingBusiness, setLoadingBusiness] = useState(true)
  const [loadingCred, setLoadingCred] = useState(true)
  const [loadingDocs, setLoadingDocs] = useState(true)

  // Actions
  const [showRoleConfirm, setShowRoleConfirm] = useState(false)
  const [receiverRole, setReceiverRole] = useState<'buyer' | 'supplier'>('buyer')
  const [roleError, setRoleError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    Promise.all([
      dataStore.getBusinessEntityById(targetBusinessId),
      getBusinessActivityCounts(targetBusinessId),
    ]).then(([biz, activity]) => {
      setBusiness(biz ?? null)
      setActivityCounts(activity)
      setLoadingBusiness(false)
    }).catch(() => setLoadingBusiness(false))

    calculateCredibility(targetBusinessId).then(cred => {
      setCredibility(cred)
      setLoadingCred(false)
    }).catch(() => setLoadingCred(false))

    dataStore.getDocumentsByBusinessId(targetBusinessId).then(docs => {
      setDocuments(docs)
      setLoadingDocs(false)
    }).catch(() => setLoadingDocs(false))

    if (action === 'view-connection' && isConnectionReview && connectionId) {
      dataStore.getConnectionById(connectionId, currentBusinessId).then(conn => {
        setConnection(conn ?? null)
      }).catch(() => {})
    }
  }, [targetBusinessId, action, connectionId, currentBusinessId, isConnectionReview])

  const [requestData, setRequestData] = useState<{ requesterRole: 'buyer' | 'supplier'; receiverRole: 'buyer' | 'supplier' } | null>(null)
  useEffect(() => {
    if (action === 'accept-request' && connectionRequestId) {
      dataStore.getConnectionRequestById(connectionRequestId).then(req => {
        if (req) {
          setRequestData({ requesterRole: req.requesterRole, receiverRole: req.receiverRole })
          setReceiverRole(req.receiverRole)
        }
      }).catch(() => {})
    }
  }, [action, connectionRequestId])

  const handleSendRequest = async () => {
    setSending(true)
    setShowRoleConfirm(true)
    setSending(false)
  }

  const handleConfirmSendRequest = async () => {
    if (!business) return
    setProcessing(true)
    try {
      if (business.id === currentBusinessId) {
        toast.error('You cannot connect to yourself.')
        setProcessing(false)
        return
      }

      const existingConnections = await dataStore.getAllConnections()
      const alreadyConnected = existingConnections.some(
        conn =>
          (conn.buyerBusinessId === currentBusinessId && conn.supplierBusinessId === business.id) ||
          (conn.buyerBusinessId === business.id && conn.supplierBusinessId === currentBusinessId)
      )
      if (alreadyConnected) {
        toast.error('You are already connected with this business.')
        setProcessing(false)
        setShowRoleConfirm(false)
        return
      }

      const requesterRole = receiverRole
      const receiverRoleOther = requesterRole === 'buyer' ? 'supplier' : 'buyer'
      await dataStore.createConnectionRequest(currentBusinessId, business.id, requesterRole, receiverRoleOther)
      emitDataChange('connection-requests:changed', 'notifications:changed')
      toast.success('Connection request sent')
      setShowRoleConfirm(false)
      onRequestSent?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to send request')
    } finally {
      setProcessing(false)
    }
  }

  const handleAccept = () => {
    setRoleError(null)
    setShowRoleConfirm(true)
  }

  const handleDecline = async () => {
    if (!connectionRequestId) return
    setProcessing(true)
    try {
      await dataStore.updateConnectionRequestStatus(connectionRequestId, 'Declined')
      emitDataChange('connection-requests:changed', 'notifications:changed')
      onRequestDeclined?.()
    } catch {
      toast.error('Failed to decline request')
    } finally {
      setProcessing(false)
    }
  }

  const handleRoleConfirmAccept = async () => {
    if (!connectionRequestId || !requestData) return
    if (receiverRole === requestData.requesterRole) {
      setRoleError('One party must be the buyer and one must be the supplier.')
      return
    }
    setRoleError(null)
    setProcessing(true)
    try {
      const result = await dataStore.acceptConnectionRequest(connectionRequestId, receiverRole, currentBusinessId)

      const pendingLabels = consumePendingConnectionLabels(connectionRequestId)
      if (pendingLabels && result.connectionId) {
        await dataStore.updateConnectionContact(
          result.connectionId,
          currentBusinessId,
          null,
          pendingLabels.branchLabel,
          pendingLabels.contactName
        ).catch(() => {})
      }

      setShowRoleConfirm(false)
      toast.success('Connection accepted.')
      emitDataChange('connections:changed', 'connection-requests:changed', 'notifications:changed')
      onRequestAccepted?.()
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Failed to accept request')
    } finally {
      setProcessing(false)
    }
  }

  if (loadingBusiness) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#F2F4F8', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#8492A6', fontSize: '14px' }}>Loading...</p>
      </div>
    )
  }

  if (!business) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#F2F4F8', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
        <div style={{ backgroundColor: '#0F1320', padding: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} color="#fff" />
          </button>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>Trust Profile</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#8492A6' }}>Business not found.</p>
        </div>
      </div>
    )
  }

  const memberSince = new Date(business.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })

  // Identity rows — only include rows where data exists
  const legalIdentityRows = [
    { field: 'businessName', label: 'Registered business name', value: business.businessName, iconBg: '#EEF0FF', Icon: Buildings },
    business.gstNumber ? { field: 'gstNumber', label: 'GST number', value: business.gstNumber, iconBg: '#E8F8F0', Icon: Note } : null,
    business.businessType ? { field: 'businessType', label: 'Business type', value: business.businessType, iconBg: '#FFF4E0', Icon: Briefcase } : null,
    business.city ? { field: 'city', label: 'City / State', value: business.city, iconBg: '#F2F4F8', Icon: MapPin } : null,
    business.businessAddress ? { field: 'businessAddress', label: 'Address', value: business.businessAddress, iconBg: '#F2F4F8', Icon: MapPin } : null,
    business.website ? { field: 'website', label: 'Website', value: business.website, iconBg: '#F2F4F8', Icon: Link } : null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ].filter(Boolean) as Array<{ field: string; label: string; value: string; iconBg: string; Icon: any }>

  const contactRows = [
    { field: 'owner', label: 'Owner / Contact person', value: business.businessName, iconBg: '#EEF0FF', Icon: User },
    business.phone ? { field: 'phone', label: 'Business phone', value: business.phone, iconBg: '#F2F4F8', Icon: Phone } : null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ].filter(Boolean) as Array<{ field: string; label: string; value: string; iconBg: string; Icon: any }>

  // Doc alert counts (≤30 days threshold)
  const now = Date.now()
  const expiredDocs = documents.filter(d => d.expiryDate && new Date(d.expiryDate).getTime() < now)
  const expiringDocs = documents.filter(d => {
    if (!d.expiryDate) return false
    const expMs = new Date(d.expiryDate).getTime()
    const diffDays = Math.floor((expMs - now) / (1000 * 60 * 60 * 24))
    return expMs > now && diffDays <= 30
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', backgroundColor: '#F2F4F8' }}>

      {/* Header — non-scrolling */}
      <div style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.06)', padding: '16px 16px 20px', flexShrink: 0 }}>
        {/* Back + Title + Edit (self-profile only) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeft size={20} color="#0F1320" />
          </button>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#0F1320', flex: 1 }}>Trust Profile</span>
          {isSelfProfileReady && (
            <button
              onClick={() => onNavigateToEditBusiness?.()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              aria-label="Edit business details"
            >
              <PencilSimple size={20} color="#8492A6" />
            </button>
          )}
        </div>

        {/* Business info row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {/* Avatar */}
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #4A6CF7 0%, #7B8FF7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>{getInitials(business.businessName)}</span>
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#0F1320' }}>{business.businessName}</span>
              {credibility && <TrustBadge level={credibility.level} variant="light" size="sm" />}
            </div>
            {(business.businessType || business.city) && (
              <p style={{ fontSize: '11px', color: '#8492A6', marginBottom: '4px' }}>
                {[business.businessType, business.city].filter(Boolean).join(' · ')}
              </p>
            )}
            <p style={{ fontSize: '10px', color: '#B0BAC9', fontFamily: '"DM Mono", "Courier New", monospace', marginBottom: '2px' }}>
              {business.zeltoId}
            </p>
            <p style={{ fontSize: '11px', color: '#8492A6' }}>
              Member since {memberSince}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Strip — white, immediately below dark header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #E8ECF2', display: 'flex', flexShrink: 0 }}>
        {(['identity', 'docs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? '#4A6CF7' : '#8492A6',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #4A6CF7' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab === 'identity' ? 'Identity' : 'Docs'}
          </button>
        ))}
      </div>

      {/* Scrollable Content — grey background */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* === IDENTITY TAB === */}
        {activeTab === 'identity' && (
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* LEGAL IDENTITY */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#8492A6', letterSpacing: '0.6px', marginBottom: '8px' }}>
                LEGAL IDENTITY
              </p>
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
                {legalIdentityRows.map((row, idx) => (
                  <div
                    key={row.field}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: idx < legalIdentityRows.length - 1 ? '1px solid #F2F4F8' : 'none',
                    }}
                  >
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: '8px',
                      backgroundColor: row.iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <row.Icon size={14} color="#4A6CF7" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '10px', color: '#8492A6', marginBottom: '1px' }}>{row.label}</p>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E', wordBreak: 'break-word' }}>{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CONTACT */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#8492A6', letterSpacing: '0.6px', marginBottom: '8px' }}>
                CONTACT
              </p>
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
                {contactRows.map((row, idx) => (
                  <div
                    key={row.field}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: idx < contactRows.length - 1 ? '1px solid #F2F4F8' : 'none',
                    }}
                  >
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: '8px',
                      backgroundColor: row.iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <row.Icon size={14} color="#4A6CF7" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '10px', color: '#8492A6', marginBottom: '1px' }}>{row.label}</p>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* === DOCS TAB === */}
        {activeTab === 'docs' && (
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Manage Documents row — only for own profile */}
            {isSelfProfileReady && (
              <button
                onClick={() => onNavigateToEditBusiness?.(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '14px 16px',
                  backgroundColor: 'var(--bg-card, #fff)',
                  border: '1px solid var(--border-light, #E8ECF2)',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary, #1A1F2E)', margin: 0 }}>
                    Manage Documents
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary, #8492A6)', marginTop: '2px', marginBottom: 0 }}>
                    Upload GST, FSSAI, PAN and other certificates
                  </p>
                </div>
                <span style={{ fontSize: '18px', color: 'var(--text-secondary, #8492A6)' }}>›</span>
              </button>
            )}

            {/* Alert banner — expired takes priority */}
            {expiredDocs.length > 0 && (
              <div style={{
                backgroundColor: '#FFF0F0',
                borderBottom: '1px solid #FFD5D5',
                padding: '12px 16px',
                borderRadius: '10px',
              }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#E53535' }}>
                  {expiredDocs.length} document{expiredDocs.length > 1 ? 's' : ''} expired · renewal needed
                </p>
              </div>
            )}
            {expiredDocs.length === 0 && expiringDocs.length > 0 && (
              <div style={{
                backgroundColor: '#FFF8E8',
                padding: '12px 16px',
                borderRadius: '10px',
              }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#E67E00' }}>
                  {expiringDocs.length} document{expiringDocs.length > 1 ? 's' : ''} expiring soon
                </p>
              </div>
            )}

            {/* COMPLIANCE DOCUMENTS */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#8492A6', letterSpacing: '0.6px', marginBottom: '8px' }}>
                COMPLIANCE DOCUMENTS
              </p>

              {loadingDocs ? (
                <p style={{ fontSize: '13px', color: '#8492A6' }}>Loading documents…</p>
              ) : documents.length === 0 ? (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
                  <p style={{ fontSize: '14px', color: '#8492A6' }}>
                    {isSelfProfileReady
                      ? 'No documents uploaded yet. Tap Manage Documents above to add.'
                      : 'No documents shared yet.'}
                  </p>
                </div>
              ) : (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
                  {documents.map((doc, idx) => {
                    const expiryInfo = getDocExpiryInfo(doc.expiryDate)
                    return (
                      <div
                        key={doc.id}
                        onClick={isConnectionReview ? () => window.open(doc.fileUrl, '_blank') : undefined}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 16px',
                          borderBottom: idx < documents.length - 1 ? '1px solid #F2F4F8' : 'none',
                          cursor: isConnectionReview ? 'pointer' : 'default',
                        }}
                      >
                        {/* Doc icon */}
                        <div style={{
                          width: 34,
                          height: 28,
                          borderRadius: '8px',
                          backgroundColor: '#F2F4F8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <Note size={14} color="#8492A6" />
                        </div>

                        {/* Name + upload date */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.displayName ?? doc.documentType}
                          </p>
                          <p style={{ fontSize: '11px', color: '#8492A6', marginTop: '2px' }}>
                            {formatUploadDate(doc.uploadedAt)}
                          </p>
                        </div>

                        {/* Status chip + days */}
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          {expiryInfo.status === 'valid' && (
                            <>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#22B573', backgroundColor: '#E8F8F0', padding: '2px 8px', borderRadius: '100px', display: 'inline-block' }}>
                                Valid
                              </span>
                              <p style={{ fontSize: '10px', color: '#8492A6', marginTop: '2px' }}>
                                till {expiryInfo.validTill}
                              </p>
                            </>
                          )}
                          {expiryInfo.status === 'expiring' && (
                            <>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#E67E00', backgroundColor: '#FFF4E0', padding: '2px 8px', borderRadius: '100px', display: 'inline-block' }}>
                                Expiring
                              </span>
                              <p style={{ fontSize: '10px', color: '#E67E00', marginTop: '2px' }}>
                                {expiryInfo.daysLeft}d left
                              </p>
                            </>
                          )}
                          {expiryInfo.status === 'expired' && (
                            <>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#E53535', backgroundColor: '#FFF0F0', padding: '2px 8px', borderRadius: '100px', display: 'inline-block' }}>
                                Expired
                              </span>
                              <p style={{ fontSize: '10px', color: '#E53535', marginTop: '2px' }}>
                                {expiryInfo.daysAgo}d ago
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Fixed Bottom CTA */}
      <div style={{
        padding: '12px 16px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        backgroundColor: '#fff',
        borderTop: '1px solid #E8ECF2',
        flexShrink: 0,
      }}>
        {action === 'send-request' && (
          <button
            onClick={handleSendRequest}
            disabled={sending}
            style={{ width: '100%', padding: '14px', backgroundColor: '#4A6CF7', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}
          >
            {sending ? 'Loading…' : 'Send Connection Request'}
          </button>
        )}

        {action === 'accept-request' && (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleDecline}
              disabled={processing}
              style={{ flex: 1, padding: '14px', backgroundColor: 'transparent', border: '1px solid #E8ECF2', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', color: '#1A1F2E' }}
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              disabled={processing}
              style={{ flex: 2, padding: '14px', backgroundColor: '#4A6CF7', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}
            >
              Accept Connection →
            </button>
          </div>
        )}

        {action === 'view-connection' && (
          <button
            onClick={onBack}
            style={{ width: '100%', padding: '14px', backgroundColor: 'transparent', border: '1px solid #E8ECF2', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', color: '#1A1F2E' }}
          >
            {isSelfProfileReady ? 'Back to Profile' : 'Close'}
          </button>
        )}
      </div>

      {/* Role confirm dialog — send-request mode */}
      {action === 'send-request' && (
        <Dialog open={showRoleConfirm} onOpenChange={setShowRoleConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Your Role</DialogTitle>
              <DialogDescription>
                Select your role in this connection with {business.businessName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <RadioGroup value={receiverRole} onValueChange={val => setReceiverRole(val as 'buyer' | 'supplier')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="buyer" id="send-buyer" />
                  <Label htmlFor="send-buyer" className="font-normal cursor-pointer">I am the Buyer</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="supplier" id="send-supplier" />
                  <Label htmlFor="send-supplier" className="font-normal cursor-pointer">I am the Supplier</Label>
                </div>
              </RadioGroup>
              <div className="flex gap-2">
                <Button onClick={handleConfirmSendRequest} disabled={processing} className="flex-1">
                  {processing ? 'Sending…' : 'Send Request'}
                </Button>
                <Button onClick={() => setShowRoleConfirm(false)} variant="outline" className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Role confirm dialog — accept-request mode */}
      {action === 'accept-request' && requestData && (
        <Dialog open={showRoleConfirm} onOpenChange={setShowRoleConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Connection Roles</DialogTitle>
              <DialogDescription>
                Select your role. {business.businessName} wants to be the {requestData.requesterRole === 'buyer' ? 'Buyer' : 'Supplier'}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <RadioGroup value={receiverRole} onValueChange={val => setReceiverRole(val as 'buyer' | 'supplier')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="buyer" id="acc-buyer" />
                  <Label htmlFor="acc-buyer" className="font-normal cursor-pointer">I am the Buyer</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="supplier" id="acc-supplier" />
                  <Label htmlFor="acc-supplier" className="font-normal cursor-pointer">I am the Supplier</Label>
                </div>
              </RadioGroup>
              {roleError && <p className="text-sm text-destructive">{roleError}</p>}
              <div className="flex gap-2">
                <Button onClick={handleRoleConfirmAccept} disabled={processing} className="flex-1">
                  {processing ? 'Creating…' : 'Confirm'}
                </Button>
                <Button onClick={() => setShowRoleConfirm(false)} variant="outline" className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

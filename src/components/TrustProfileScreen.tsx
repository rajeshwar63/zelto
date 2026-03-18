import { useState, useEffect } from 'react'
import { ArrowLeft, FilePdf, Image, CheckCircle, Clock, Warning } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { calculateCredibility, getBusinessActivityCounts, scoreToLevel, type CredibilityBreakdown } from '@/lib/credibility'
import { CredibilityBadge } from './CredibilityBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { emitDataChange } from '@/lib/data-events'
import { consumePendingConnectionLabels } from '@/lib/pending-connection-labels'
import { toast } from 'sonner'
import type { BusinessEntity, BusinessDocument, Connection } from '@/lib/types'
import { formatDistance } from 'date-fns'

export type TrustProfileMode = 'send-request' | 'accept-request' | 'view-connection'

interface Props {
  targetBusinessId: string
  currentBusinessId: string
  mode: TrustProfileMode
  connectionRequestId?: string
  connectionId?: string
  onBack: () => void
  onRequestSent?: () => void
  onRequestAccepted?: () => void
  onRequestDeclined?: () => void
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

function isExpiringWithin90Days(expiryDate: string): boolean {
  const expiry = new Date(expiryDate)
  const now = new Date()
  const diff = expiry.getTime() - now.getTime()
  return diff > 0 && diff <= 90 * 24 * 60 * 60 * 1000
}

function isExpired(expiryDate: string): boolean {
  return new Date(expiryDate) < new Date()
}

function getDocumentLabel(type: string): string {
  const labels: Record<string, string> = {
    gst_certificate: 'GST Certificate',
    msme_udyam: 'MSME / Udyam Certificate',
    trade_licence: 'Trade Licence',
    fssai_licence: 'FSSAI Licence',
    pan_card: 'PAN Card',
    fire_safety: 'Fire Safety Certificate',
    other: 'Other Document',
  }
  return labels[type] ?? type
}

function getTrustTone(level: ReturnType<typeof scoreToLevel>) {
  const styles: Record<ReturnType<typeof scoreToLevel>, {
    accent: string
    soft: string
    text: string
    confidence: string
    headline: string
  }> = {
    trusted: {
      accent: '#16A34A',
      soft: '#DCFCE7',
      text: '#166534',
      confidence: 'High confidence',
      headline: 'Strong trust signals across identity, documents, and network activity.',
    },
    verified: {
      accent: '#4A6CF7',
      soft: '#EEF1FE',
      text: '#2846C7',
      confidence: 'Good confidence',
      headline: 'Verified business details and healthy account activity support this profile.',
    },
    basic: {
      accent: '#D97706',
      soft: '#FEF3C7',
      text: '#B45309',
      confidence: 'Moderate confidence',
      headline: 'Some trust signals are present, but more proof points would strengthen confidence.',
    },
    none: {
      accent: '#6B7280',
      soft: '#F3F4F6',
      text: '#4B5563',
      confidence: 'Early confidence',
      headline: 'This profile is still building trust signals, so review details with extra care.',
    },
  }
  return styles[level]
}

function getTrustSummary(mode: TrustProfileMode, score: number, level: ReturnType<typeof scoreToLevel>, activityCounts: { connectionCount: number; orderCount: number } | null) {
  const tone = getTrustTone(level)
  const connections = activityCounts?.connectionCount ?? 0
  const orders = activityCounts?.orderCount ?? 0

  if (mode === 'accept-request') {
    return `${tone.headline} They currently show ${connections} connections and ${orders} orders on Zelto.`
  }

  if (mode === 'view-connection') {
    return `You are already connected, and this ${level} profile holds a trust score of ${score}/100 backed by ${connections} connections and ${orders} orders.`
  }

  return `${tone.headline} Review this ${level} profile before sending a connection request.`
}

function CompactScoreBadge({ score }: { score: number }) {
  const level = scoreToLevel(score)
  const tone = getTrustTone(level)

  return (
    <span style={{
      backgroundColor: tone.soft,
      color: tone.text,
      fontSize: '12px',
      fontWeight: 600,
      padding: '4px 10px',
      borderRadius: '999px',
      whiteSpace: 'nowrap',
    }}>
      {score} · {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  )
}

export function TrustProfileScreen({
  targetBusinessId,
  currentBusinessId,
  mode,
  connectionRequestId,
  connectionId,
  onBack,
  onRequestSent,
  onRequestAccepted,
  onRequestDeclined,
}: Props) {
  const [activeTab, setActiveTab] = useState<'identity' | 'docs'>('identity')

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
    // Load business + activity + connection
    Promise.all([
      dataStore.getBusinessEntityById(targetBusinessId),
      getBusinessActivityCounts(targetBusinessId),
    ]).then(([biz, activity]) => {
      setBusiness(biz ?? null)
      setActivityCounts(activity)
      setLoadingBusiness(false)
    }).catch(() => setLoadingBusiness(false))

    // Load credibility
    calculateCredibility(targetBusinessId).then(cred => {
      setCredibility(cred)
      setLoadingCred(false)
    }).catch(() => setLoadingCred(false))

    // Load documents
    dataStore.getDocumentsByBusinessId(targetBusinessId).then(docs => {
      setDocuments(docs)
      setLoadingDocs(false)
    }).catch(() => setLoadingDocs(false))

    // Load connection for view-connection mode
    if (mode === 'view-connection' && connectionId) {
      dataStore.getConnectionById(connectionId, currentBusinessId).then(conn => {
        setConnection(conn ?? null)
      }).catch(() => {})
    }
  }, [targetBusinessId, mode, connectionId, currentBusinessId])

  // Load the connection request to get requester's role (for accept mode)
  const [requestData, setRequestData] = useState<{ requesterRole: 'buyer' | 'supplier'; receiverRole: 'buyer' | 'supplier' } | null>(null)
  useEffect(() => {
    if (mode === 'accept-request' && connectionRequestId) {
      dataStore.getConnectionRequestById(connectionRequestId).then(req => {
        if (req) {
          setRequestData({ requesterRole: req.requesterRole, receiverRole: req.receiverRole })
          setReceiverRole(req.receiverRole)
        }
      }).catch(() => {})
    }
  }, [mode, connectionRequestId])

  const handleSendRequest = async () => {
    setSending(true)
    // Navigate to role selection is handled by parent; for now open role dialog inline
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

  const verifiedCount = documents.filter(d => d.verificationStatus === 'verified').length
  const pendingCount = documents.filter(d => d.verificationStatus === 'pending').length
  const expiringCount = documents.filter(d => d.expiryDate && isExpiringWithin90Days(d.expiryDate)).length

  const memberSince = business
    ? new Date(business.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : ''

  const onZeltoMonths = business
    ? Math.max(1, Math.round((Date.now() - business.createdAt) / (30 * 24 * 60 * 60 * 1000)))
    : 0

  const relationshipAge = connection
    ? formatDistance(connection.createdAt, Date.now(), { addSuffix: false })
    : ''
  const relationshipSince = connection
    ? new Date(connection.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : ''

  const trustLevel = credibility ? scoreToLevel(credibility.score) : null
  const trustTone = trustLevel ? getTrustTone(trustLevel) : null
  const trustSummary = credibility && trustLevel
    ? getTrustSummary(mode, credibility.score, trustLevel, activityCounts)
    : ''

  if (loadingBusiness) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-screen)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading...</p>
      </div>
    )
  }

  if (!business) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-screen)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--border-light)' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={20} />
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Business not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-screen)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      {/* Sticky Header */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderBottom: '0.5px solid var(--border-light)',
        padding: '12px 16px 0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {business.businessName}
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {business.zeltoId}
              {business.city ? ` · ${business.city}` : ''}
            </p>
          </div>
          {credibility && <CompactScoreBadge score={credibility.score} />}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0' }}>
          {(['identity', 'docs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? 'var(--brand-primary)' : 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--brand-primary)' : '2px solid transparent',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab === 'identity' ? 'Identity' : 'Docs'}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loadingCred ? (
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '20px', padding: '18px', border: '1px solid var(--border-light)', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading trust overview…</p>
          </div>
        ) : credibility && trustLevel && trustTone ? (
          <div style={{
            background: `linear-gradient(135deg, ${trustTone.soft} 0%, var(--bg-card) 100%)`,
            borderRadius: '20px',
            padding: '18px',
            border: `1px solid ${trustTone.soft}`,
            marginBottom: '16px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: trustTone.text, marginBottom: '8px' }}>
                  Trust overview
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <span style={{ fontSize: '40px', lineHeight: 1, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {credibility.score}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', paddingBottom: '5px' }}>/ 100</span>
                  <CredibilityBadge level={credibility.level} />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: trustTone.text, marginBottom: '6px' }}>
                  {trustTone.confidence}
                </p>
                <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.45, maxWidth: '42rem' }}>
                  {trustSummary}
                </p>
              </div>

              <div style={{ minWidth: '140px', flex: '1 1 140px', maxWidth: '180px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span>Trust score</span>
                  <span>{credibility.score}%</span>
                </div>
                <div style={{ height: '10px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '999px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.8)' }}>
                  <div style={{ height: '100%', width: `${credibility.score}%`, background: `linear-gradient(90deg, ${trustTone.accent} 0%, #22B573 100%)`, borderRadius: '999px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', gap: '8px' }}>
                  {[
                    { label: 'Connections', value: activityCounts?.connectionCount ?? '—' },
                    { label: 'Orders', value: activityCounts?.orderCount ?? '—' },
                    { label: 'Months', value: onZeltoMonths },
                  ].map(metric => (
                    <div key={metric.label} style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{metric.value}</p>
                      <p style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{metric.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* === IDENTITY TAB === */}
        {activeTab === 'identity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Trust evidence */}
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-light)' }}>
              {loadingCred ? (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading trust evidence…</p>
              ) : credibility ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Trust evidence</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Signals contributing to the trust score.
                      </p>
                    </div>
                    <CredibilityBadge level={credibility.level} />
                  </div>

                  {/* Completed items */}
                  {credibility.completedItems.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: mode === 'view-connection' && credibility.missingItems.length > 0 ? '8px' : '0' }}>
                      {credibility.completedItems.map(item => (
                        <span key={item} style={{ fontSize: '11px', fontWeight: 500, color: '#16A34A', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '100px' }}>
                          ✓ {item}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Missing items — only for view-connection mode */}
                  {mode === 'view-connection' && credibility.missingItems.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {credibility.missingItems.slice(0, 4).map(item => (
                        <span key={item} style={{ fontSize: '11px', fontWeight: 500, color: '#D97706', backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: '100px' }}>
                          + {item}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Business Details */}
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
              {[
                business.businessType && { label: 'Business type', value: business.businessType },
                business.gstNumber && { label: 'GST number', value: business.gstNumber, mono: true },
                { label: 'GST status', value: business.gstNumber ? 'Active' : '—', green: !!business.gstNumber },
                (business.businessAddress || business.formattedAddress) && {
                  label: 'Location',
                  value: business.formattedAddress || business.businessAddress || '',
                },
                business.latitude && business.longitude && { label: 'Map verified', value: 'Yes ✓', green: true },
                business.description && { label: 'Description', value: `"${business.description}"` },
                memberSince && { label: 'Member since', value: `${memberSince} · ${onZeltoMonths} months` },
                business.website && { label: 'Website', value: business.website },
              ]
                .filter(Boolean)
                .map((row: any, idx, arr) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      padding: '10px 16px',
                      borderBottom: idx < arr.length - 1 ? '1px solid var(--border-light)' : 'none',
                      gap: '12px',
                    }}
                  >
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flexShrink: 0 }}>{row.label}</span>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: row.green ? '#16A34A' : 'var(--text-primary)',
                      fontFamily: row.mono ? 'monospace' : undefined,
                      textAlign: 'right',
                      flex: 1,
                    }}>
                      {row.value}
                    </span>
                  </div>
                ))}
            </div>

            {/* Network presence */}
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', gap: '0' }}>
                <div style={{ flex: 1, textAlign: 'center', padding: '8px' }}>
                  <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {activityCounts?.connectionCount ?? '—'}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Connections</p>
                </div>
                <div style={{ width: '1px', backgroundColor: 'var(--border-light)' }} />
                <div style={{ flex: 1, textAlign: 'center', padding: '8px' }}>
                  <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {activityCounts?.orderCount ?? '—'}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Orders</p>
                </div>
                <div style={{ width: '1px', backgroundColor: 'var(--border-light)' }} />
                <div style={{ flex: 1, textAlign: 'center', padding: '8px' }}>
                  <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {onZeltoMonths}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Months on Zelto</p>
                </div>
              </div>
            </div>

            {/* Relationship row — view-connection only */}
            {mode === 'view-connection' && connection && (
              <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '12px 16px', border: '1px solid var(--border-light)' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Your relationship · Trading for {relationshipAge} · Since {relationshipSince}
                </p>
              </div>
            )}
          </div>
        )}

        {/* === DOCS TAB === */}
        {activeTab === 'docs' && (
          <div>
            {/* Summary row */}
            {documents.length > 0 && (
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                {verifiedCount > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#16A34A', backgroundColor: '#DCFCE7', padding: '4px 10px', borderRadius: '100px' }}>
                    {verifiedCount} Verified
                  </span>
                )}
                {pendingCount > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', backgroundColor: '#FEF3C7', padding: '4px 10px', borderRadius: '100px' }}>
                    {pendingCount} Pending
                  </span>
                )}
                {expiringCount > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', backgroundColor: '#FEF3C7', padding: '4px 10px', borderRadius: '100px' }}>
                    {expiringCount} Expiring
                  </span>
                )}
              </div>
            )}

            {loadingDocs ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading documents…</p>
            ) : documents.length === 0 ? (
              <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '24px', textAlign: 'center', border: '1px solid var(--border-light)' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>No documents uploaded yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                {documents.map((doc, idx) => {
                  const expiring = doc.expiryDate ? isExpiringWithin90Days(doc.expiryDate) : false
                  const expired = doc.expiryDate ? isExpired(doc.expiryDate) : false
                  const isPdf = doc.mimeType === 'application/pdf'
                  const isLast = idx === documents.length - 1

                  return (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        padding: '12px 16px',
                        backgroundColor: 'var(--bg-card)',
                        borderBottom: isLast ? 'none' : '1px solid var(--border-light)',
                        gap: '12px',
                      }}
                    >
                      {/* File type badge */}
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: isPdf ? '#FEE2E2' : '#DBEAFE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {isPdf ? (
                          <FilePdf size={18} color="#DC2626" />
                        ) : (
                          <Image size={18} color="#2563EB" />
                        )}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {getDocumentLabel(doc.documentType)}
                          </span>
                          {doc.verificationStatus === 'verified' && (
                            <CheckCircle size={14} color="#16A34A" weight="fill" />
                          )}
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {formatFileSize(doc.fileSizeBytes)} · {formatUploadDate(doc.uploadedAt)}
                        </p>

                        {doc.verificationStatus === 'pending' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <Clock size={12} color="var(--status-dispatched)" />
                            <span style={{ fontSize: '11px', color: 'var(--status-dispatched)' }}>Verification pending</span>
                          </div>
                        )}

                        {doc.expiryDate && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            {expired || expiring ? <Warning size={12} color="#D97706" weight="fill" /> : null}
                            <span style={{ fontSize: '11px', color: expired || expiring ? '#D97706' : '#16A34A' }}>
                              Exp: {doc.expiryDate}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed Bottom CTA */}
      <div style={{
        padding: '12px 16px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        backgroundColor: 'var(--bg-card)',
        borderTop: '1px solid var(--border-light)',
        flexShrink: 0,
      }}>
        {mode === 'send-request' && (
          <button
            onClick={handleSendRequest}
            disabled={sending}
            style={{ width: '100%', padding: '14px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}
          >
            {sending ? 'Loading…' : 'Send Connection Request'}
          </button>
        )}

        {mode === 'accept-request' && (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleDecline}
              disabled={processing}
              style={{ flex: 1, padding: '14px', backgroundColor: 'transparent', border: '1px solid var(--border-light)', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', color: 'var(--text-primary)' }}
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              disabled={processing}
              style={{ flex: 2, padding: '14px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer' }}
            >
              Accept Connection →
            </button>
          </div>
        )}

        {mode === 'view-connection' && (
          <button
            onClick={onBack}
            style={{ width: '100%', padding: '14px', backgroundColor: 'transparent', border: '1px solid var(--border-light)', borderRadius: '12px', fontSize: '15px', fontWeight: 500, cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            Close
          </button>
        )}
      </div>

      {/* Role confirm dialog — send-request mode */}
      {mode === 'send-request' && (
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
      {mode === 'accept-request' && requestData && (
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

import { useEffect, type ReactNode, useState } from 'react'
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

export type TrustProfileActionMode = 'send-request' | 'accept-request' | 'view-connection'
export type TrustProfileAudience = 'connection-review' | 'self-profile-ready'

export interface TrustProfileScreenMode {
  action: TrustProfileActionMode
  audience: TrustProfileAudience
}

type ScoreExplanationGroupKey = 'businessIdentity' | 'networkActivity' | 'complianceDocuments'

interface ScoreExplanationGroup {
  key: ScoreExplanationGroupKey
  title: string
  statusLabel: string
  positiveItems: string[]
  missingItems: string[]
}

const SCORE_EXPLANATION_GROUPS: Array<{ key: ScoreExplanationGroupKey; title: string; items: string[] }> = [
  {
    key: 'businessIdentity',
    title: 'Business Identity',
    items: [
      'Phone number',
      'GST number',
      'Business address',
      'Map location verified',
      'Map location',
      'Business type',
      'Website',
      'Business description',
    ],
  },
  {
    key: 'networkActivity',
    title: 'Network Activity',
    items: [
      'Active connections',
      '3+ connections',
      'Order history',
      '10+ orders',
    ],
  },
  {
    key: 'complianceDocuments',
    title: 'Compliance Documents',
    items: [
      'MSME certificate',
      'Trade licence',
      'FSSAI licence',
      'PAN card',
      'Upload MSME certificate',
      'Upload trade licence',
    ],
  },
]

function getGroupStatusLabel(completedCount: number, missingCount: number): string {
  if (completedCount > 0 && missingCount === 0) return 'Complete'
  if (completedCount > 0) return 'In progress'
  return 'Needs attention'
}

function getScoreExplanationGroups(breakdown: CredibilityBreakdown): ScoreExplanationGroup[] {
  return SCORE_EXPLANATION_GROUPS.map(group => {
    const positiveItems = group.items.filter(item => breakdown.completedItems.includes(item)).slice(0, 3)
    const missingItems = group.items.filter(item => breakdown.missingItems.includes(item)).slice(0, 3)

    return {
      key: group.key,
      title: group.title,
      statusLabel: getGroupStatusLabel(positiveItems.length, missingItems.length),
      positiveItems,
      missingItems,
    }
  })
}

interface Props {
  targetBusinessId: string;
  currentBusinessId: string;
  mode: TrustProfileMode;
  connectionRequestId?: string;
  connectionId?: string;
  onBack: () => void;
  onRequestSent?: () => void;
  onRequestAccepted?: () => void;
  onRequestDeclined?: () => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isExpiringWithin90Days(expiryDate: string): boolean {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();
  return diff > 0 && diff <= 90 * 24 * 60 * 60 * 1000;
}

function isExpired(expiryDate: string): boolean {
  return new Date(expiryDate) < new Date();
}

function getDocumentLabel(type: string): string {
  const labels: Record<string, string> = {
    gst_certificate: "GST Certificate",
    msme_udyam: "MSME / Udyam Certificate",
    trade_licence: "Trade Licence",
    fssai_licence: "FSSAI Licence",
    pan_card: "PAN Card",
    fire_safety: "Fire Safety Certificate",
    other: "Other Document",
  };
  return labels[type] ?? type;
}

const PRIORITY_DOCUMENT_TYPES = [
  "gst_certificate",
  "msme_udyam",
  "trade_licence",
  "fssai_licence",
  "pan_card",
] as const;

const PRIORITY_DOC_INDEX = PRIORITY_DOCUMENT_TYPES.reduce<
  Record<string, number>
>((acc, type, index) => {
  acc[type] = index;
  return acc;
}, {});

type DocumentGroupItem = {
  kind: "document";
  doc: BusinessDocument;
  expired: boolean;
  expiring: boolean;
  isPriority: boolean;
};

function sortDocumentItems(a: DocumentGroupItem, b: DocumentGroupItem): number {
  if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;

  const aPriorityIndex =
    PRIORITY_DOC_INDEX[a.doc.documentType] ?? Number.MAX_SAFE_INTEGER;
  const bPriorityIndex =
    PRIORITY_DOC_INDEX[b.doc.documentType] ?? Number.MAX_SAFE_INTEGER;
  if (aPriorityIndex !== bPriorityIndex) return aPriorityIndex - bPriorityIndex;

  const getUrgencyRank = (item: DocumentGroupItem) => {
    if (item.expired) return 0;
    if (item.doc.verificationStatus === "pending") return 1;
    if (item.expiring) return 2;
    return 3;
  };

  const urgencyDiff = getUrgencyRank(a) - getUrgencyRank(b);
  if (urgencyDiff !== 0) return urgencyDiff;

  if (a.doc.verificationStatus !== b.doc.verificationStatus) {
    return a.doc.verificationStatus === "verified" ? -1 : 1;
  }

  return b.doc.uploadedAt - a.doc.uploadedAt;
}



function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function ScorePill({ score }: { score: number }) {
  const level = scoreToLevel(score);
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    trusted: { bg: '#DCFCE7', color: '#16A34A', label: 'Trusted' },
    verified: { bg: '#EEF1FE', color: '#4A6CF7', label: 'Verified' },
    basic: { bg: '#FEF3C7', color: '#D97706', label: 'Basic' },
    none: { bg: '#F3F4F6', color: '#6B7280', label: 'New' },
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

type VerificationStatus = 'Verified' | 'Provided' | 'Missing' | 'Not available'

type VerificationRow = {
  label: string
  value: string
  status: VerificationStatus
  mono?: boolean
}

const verificationStatusStyles: Record<VerificationStatus, { bg: string; color: string }> = {
  Verified: { bg: '#DCFCE7', color: '#16A34A' },
  Provided: { bg: '#EEF1FE', color: '#4A6CF7' },
  Missing: { bg: '#FEF2F2', color: '#DC2626' },
  'Not available': { bg: '#F3F4F6', color: '#6B7280' },
}

function VerificationStatusPill({ status }: { status: VerificationStatus }) {
  const style = verificationStatusStyles[status]
  return (
    <span style={{
      backgroundColor: style.bg,
      color: style.color,
      fontSize: '11px',
      fontWeight: 600,
      padding: '3px 8px',
      borderRadius: '999px',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

function VerificationRowItem({ row, isLast }: { row: VerificationRow; isLast: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--border-light)',
        gap: '12px',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, marginBottom: '4px' }}>{row.label}</p>
        <p style={{
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          fontFamily: row.mono ? 'monospace' : undefined,
          margin: 0,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}>
          {row.value}
        </p>
      </div>
      <VerificationStatusPill status={row.status} />
    </div>
  )
}

function VerificationSubsection({ title, rows }: { title: string; rows: VerificationRow[] }) {
  return (
    <div style={{ borderTop: '1px solid var(--border-light)' }}>
      <div style={{ padding: '12px 16px 8px' }}>
        <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
          {title}
        </p>
      </div>
      <div>
        {rows.map((row, idx) => (
          <VerificationRowItem key={`${title}-${row.label}`} row={row} isLast={idx === rows.length - 1} />
        ))}
      </div>
    </div>
  )
}

export function TrustProfileScreen({
  targetBusinessId,
  currentBusinessId,
  screenMode,
  connectionRequestId,
  connectionId,
  onBack,
  onRequestSent,
  onRequestAccepted,
  onRequestDeclined,
}: Props) {
  // Data
  const [business, setBusiness] = useState<BusinessEntity | null>(null);
  const [credibility, setCredibility] = useState<CredibilityBreakdown | null>(
    null,
  );
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [activityCounts, setActivityCounts] = useState<{
    connectionCount: number;
    orderCount: number;
  } | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);

  // Loading
  const [loadingBusiness, setLoadingBusiness] = useState(true);
  const [loadingCred, setLoadingCred] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Actions
  const [showRoleConfirm, setShowRoleConfirm] = useState(false);
  const [receiverRole, setReceiverRole] = useState<"buyer" | "supplier">(
    "buyer",
  );
  const [roleError, setRoleError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Load business + activity + connection
    Promise.all([
      dataStore.getBusinessEntityById(targetBusinessId),
      getBusinessActivityCounts(targetBusinessId),
    ])
      .then(([biz, activity]) => {
        setBusiness(biz ?? null);
        setActivityCounts(activity);
        setLoadingBusiness(false);
      })
      .catch(() => setLoadingBusiness(false));

    // Load credibility
    calculateCredibility(targetBusinessId)
      .then((cred) => {
        setCredibility(cred);
        setLoadingCred(false);
      })
      .catch(() => setLoadingCred(false));

    // Load documents
    dataStore
      .getDocumentsByBusinessId(targetBusinessId)
      .then((docs) => {
        setDocuments(docs);
        setLoadingDocs(false);
      })
      .catch(() => setLoadingDocs(false));

    // Load connection for view-connection mode
    if (mode === "view-connection" && connectionId) {
      dataStore
        .getConnectionById(connectionId, currentBusinessId)
        .then((conn) => {
          setConnection(conn ?? null);
        })
        .catch(() => {});
    }
  }, [targetBusinessId, mode, connectionId, currentBusinessId]);

  // Load the connection request to get requester's role (for accept mode)
  const [requestData, setRequestData] = useState<{
    requesterRole: "buyer" | "supplier";
    receiverRole: "buyer" | "supplier";
  } | null>(null);
  useEffect(() => {
    if (mode === "accept-request" && connectionRequestId) {
      dataStore
        .getConnectionRequestById(connectionRequestId)
        .then((req) => {
          if (req) {
            setRequestData({
              requesterRole: req.requesterRole,
              receiverRole: req.receiverRole,
            });
            setReceiverRole(req.receiverRole);
          }
        })
        .catch(() => {});
    }
  }, [mode, connectionRequestId]);

  const handleSendRequest = async () => {
    setSending(true);
    // Navigate to role selection is handled by parent; for now open role dialog inline
    setShowRoleConfirm(true);
    setSending(false);
  };

  const handleConfirmSendRequest = async () => {
    if (!business) return;
    setProcessing(true);
    try {
      if (business.id === currentBusinessId) {
        toast.error("You cannot connect to yourself.");
        setProcessing(false);
        return;
      }

      const existingConnections = await dataStore.getAllConnections();
      const alreadyConnected = existingConnections.some(
        (conn) =>
          (conn.buyerBusinessId === currentBusinessId &&
            conn.supplierBusinessId === business.id) ||
          (conn.buyerBusinessId === business.id &&
            conn.supplierBusinessId === currentBusinessId),
      );
      if (alreadyConnected) {
        toast.error("You are already connected with this business.");
        setProcessing(false);
        setShowRoleConfirm(false);
        return;
      }

      const requesterRole = receiverRole;
      const receiverRoleOther =
        requesterRole === "buyer" ? "supplier" : "buyer";
      await dataStore.createConnectionRequest(
        currentBusinessId,
        business.id,
        requesterRole,
        receiverRoleOther,
      );
      emitDataChange("connection-requests:changed", "notifications:changed");
      toast.success("Connection request sent");
      setShowRoleConfirm(false);
      onRequestSent?.();
    } catch (err) {
      console.error(err);
      toast.error("Failed to send request");
    } finally {
      setProcessing(false);
    }
  };

  const handleAccept = () => {
    setRoleError(null);
    setShowRoleConfirm(true);
  };

  const handleDecline = async () => {
    if (!connectionRequestId) return;
    setProcessing(true);
    try {
      await dataStore.updateConnectionRequestStatus(
        connectionRequestId,
        "Declined",
      );
      emitDataChange("connection-requests:changed", "notifications:changed");
      onRequestDeclined?.();
    } catch {
      toast.error("Failed to decline request");
    } finally {
      setProcessing(false);
    }
  };

  const handleRoleConfirmAccept = async () => {
    if (!connectionRequestId || !requestData) return;
    if (receiverRole === requestData.requesterRole) {
      setRoleError("One party must be the buyer and one must be the supplier.");
      return;
    }
    setRoleError(null);
    setProcessing(true);
    try {
      const result = await dataStore.acceptConnectionRequest(
        connectionRequestId,
        receiverRole,
        currentBusinessId,
      );

      const pendingLabels = consumePendingConnectionLabels(connectionRequestId);
      if (pendingLabels && result.connectionId) {
        await dataStore
          .updateConnectionContact(
            result.connectionId,
            currentBusinessId,
            null,
            pendingLabels.branchLabel,
            pendingLabels.contactName,
          )
          .catch(() => {});
      }

      setShowRoleConfirm(false);
      toast.success("Connection accepted.");
      emitDataChange(
        "connections:changed",
        "connection-requests:changed",
        "notifications:changed",
      );
      onRequestAccepted?.();
    } catch (err) {
      setRoleError(
        err instanceof Error ? err.message : "Failed to accept request",
      );
    } finally {
      setProcessing(false);
    }
  };

  const documentSummary = useMemo(() => {
    const items: DocumentGroupItem[] = documents.map((doc) => ({
      kind: "document",
      doc,
      expired: doc.expiryDate ? isExpired(doc.expiryDate) : false,
      expiring: doc.expiryDate ? isExpiringWithin90Days(doc.expiryDate) : false,
      isPriority: PRIORITY_DOCUMENT_TYPES.includes(
        doc.documentType as (typeof PRIORITY_DOCUMENT_TYPES)[number],
      ),
    }));

    const keyDocuments = items
      .filter((item) => item.isPriority)
      .sort(sortDocumentItems);

    const otherDocuments = items
      .filter((item) => !item.isPriority)
      .sort(sortDocumentItems);

  const verifiedCount = documents.filter(d => d.verificationStatus === 'verified').length
  const pendingCount = documents.filter(d => d.verificationStatus === 'pending').length
  const expiringCount = documents.filter(d => d.expiryDate && isExpiringWithin90Days(d.expiryDate)).length
  const scoreExplanationGroups = credibility ? getScoreExplanationGroups(credibility) : []

  const memberSince = business
    ? new Date(business.createdAt).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      })
    : "";

  const onZeltoMonths = business
    ? Math.max(
        1,
        Math.round(
          (Date.now() - business.createdAt) / (30 * 24 * 60 * 60 * 1000),
        ),
      )
    : 0;

  const timeOnZeltoLabel = business?.createdAt
    ? `${formatDistanceToNow(business.createdAt, { addSuffix: false })} on Zelto`
    : 'Time on Zelto not available'

  const tradingSignals = [
    {
      label: 'Active connections',
      value: activityCounts?.connectionCount ?? '—',
      detail: activityCounts
        ? `${activityCounts.connectionCount} active trade ${activityCounts.connectionCount === 1 ? 'relationship' : 'relationships'}`
        : 'Connections will appear once activity data syncs',
    },
    {
      label: 'Orders completed',
      value: activityCounts?.orderCount ?? '—',
      detail: activityCounts
        ? `${activityCounts.orderCount} recorded ${activityCounts.orderCount === 1 ? 'order' : 'orders'} on Zelto`
        : 'Orders will appear once activity data syncs',
    },
    {
      label: 'Time on Zelto',
      value: business?.createdAt ? onZeltoMonths : '—',
      detail: business?.createdAt
        ? `${timeOnZeltoLabel} · member since ${memberSince}`
        : 'Business age will appear once profile setup is complete',
    },
  ]

  const relationshipAge = connection
    ? formatDistance(connection.createdAt, Date.now(), { addSuffix: false })
    : "";
  const relationshipSince = connection
    ? new Date(connection.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : ''
  const connectionStateLabel = connection ? getConnectionStateLabel(connection.connectionState) : ''
  const connectionStateColor = connection ? getConnectionStateColor(connection.connectionState) : 'var(--text-secondary)'
  const paymentTermsLabel = connection ? formatPaymentTerms(connection.paymentTerms) : null
  const relationshipRole = connection
    ? connection.buyerBusinessId === currentBusinessId
      ? `You buy from ${business?.businessName ?? 'this business'}`
      : connection.supplierBusinessId === currentBusinessId
        ? `You supply to ${business?.businessName ?? 'this business'}`
        : null
    : null
  const contactContext = connection
    ? buildConnectionSubtitle(connection.branchLabel, connection.contactName)
    : null

  const trustLevel = credibility ? scoreToLevel(credibility.score) : null
  const trustTone = trustLevel ? getTrustTone(trustLevel) : null
  const trustSummary = credibility && trustLevel
    ? getTrustSummary(mode, credibility.score, trustLevel, activityCounts)
    : ''

  const roleLabel = (role: 'buyer' | 'supplier') => role === 'buyer' ? 'Buyer' : 'Supplier'
  const trustReviewSignals = [
    !business.gstNumber && 'identity not fully verified',
    (activityCounts?.connectionCount ?? 0) === 0 && (activityCounts?.orderCount ?? 0) === 0 && 'limited trading activity',
    verifiedCount === 0 && 'no verified documents yet',
  ].filter(Boolean) as string[]
  const hasWeakTrustSignals = trustReviewSignals.length > 0

  if (loadingBusiness) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "var(--bg-screen)",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          Loading...
        </p>
      </div>
    );
  }

  if (!business) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "var(--bg-screen)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "16px",
            borderBottom: "1px solid var(--border-light)",
          }}
        >
          <button
            onClick={onBack}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <ArrowLeft size={20} />
          </button>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p style={{ color: "var(--text-secondary)" }}>Business not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--bg-screen)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Sticky Header */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderBottom: '0.5px solid var(--border-light)',
        padding: '12px 16px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {business.businessName}
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              {business.zeltoId}
              {business.city ? ` · ${business.city}` : ""}
            </p>
          </div>
          {credibility && <CompactScoreBadge score={credibility.score} />}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Section title="Overview">
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

                  {credibility.completedItems.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: mode === 'view-connection' && credibility.missingItems.length > 0 ? '8px' : '0' }}>
                      {credibility.completedItems.map(item => (
                        <span key={item} style={{ fontSize: '11px', fontWeight: 500, color: '#16A34A', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '100px' }}>
                          ✓ {item}
                        </span>
                      ))}
                    </div>
                  )}

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

            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
              <div style={{ padding: '16px 16px 12px' }}>
                <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: '4px' }}>Verification</p>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Business identity, location confidence, and membership details surfaced from the current entity record.
                </p>
              </div>
              {verificationSections.map(section => (
                <VerificationSubsection key={section.title} title={section.title} rows={section.rows} />
              ))}
            </div>
          </Section>

          <Section title="Verification">
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', gap: '0' }}>
                <div style={{ flex: 1, textAlign: 'center', padding: '8px' }}>
                  <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {verifiedCount}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Verified docs</p>
                </div>
                <div style={{ width: '1px', backgroundColor: 'var(--border-light)' }} />
                <div style={{ flex: 1, textAlign: 'center', padding: '8px' }}>
                  <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {pendingCount}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Pending review</p>
                </div>
                <div style={{ width: '1px', backgroundColor: 'var(--border-light)' }} />
                <div style={{ flex: 1, textAlign: 'center', padding: '8px' }}>
                  <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {expiringCount}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Expiring soon</p>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-light)' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                {loadingDocs
                  ? 'Loading verification details…'
                  : documents.length === 0
                    ? 'No verification documents uploaded yet.'
                    : `${documents.length} document${documents.length === 1 ? '' : 's'} uploaded for review.`}
              </p>
            </div>
          </Section>

          <Section title="Trading Signals">
            <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', gap: '0' }}>
                <div style={{ flex: 1, textAlign: 'center', padding: '8px' }}>
                  <p style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {activityCounts?.connectionCount ?? '—'}
                  </p>
                </div>
                <div
                  style={{
                    width: "1px",
                    backgroundColor: "var(--border-light)",
                  }}
                />
                <div style={{ flex: 1, textAlign: "center", padding: "8px" }}>
                  <p
                    style={{
                      fontSize: "20px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "2px",
                    }}
                  >
                    {activityCounts?.orderCount ?? "—"}
                  </p>
                  <p
                    style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                  >
                    Orders
                  </p>
                </div>
                <div
                  style={{
                    width: "1px",
                    backgroundColor: "var(--border-light)",
                  }}
                />
                <div style={{ flex: 1, textAlign: "center", padding: "8px" }}>
                  <p
                    style={{
                      fontSize: "20px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "2px",
                    }}
                  >
                    {onZeltoMonths}
                  </p>
                  <p
                    style={{ fontSize: "11px", color: "var(--text-secondary)" }}
                  >
                    Months on Zelto
                  </p>
                </div>
              </div>
            </div>

            {mode === 'view-connection' && connection && (
              <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '12px 16px', border: '1px solid var(--border-light)' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Your relationship · Trading for {relationshipAge} · Since {relationshipSince}
                </p>
              </div>
            )}
          </Section>

          <Section title="Documents">
            {documents.length > 0 && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
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
              <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Loading documents…
              </p>
            ) : (
              <>
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderRadius: "14px",
                    overflow: "hidden",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  <div
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid var(--border-light)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
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
                        );
                      })}
                      {missingKeyDocs.map((type, idx) => {
                        const isLast = idx === missingKeyDocs.length - 1;
                        return (
                          <div
                            key={type}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "12px",
                              padding: "12px 16px",
                              borderBottom: isLast
                                ? "none"
                                : "1px solid var(--border-light)",
                              backgroundColor: "#FAFAFA",
                            }}
                          >
                            <div
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "8px",
                                backgroundColor: "#F3F4F6",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <Warning size={18} color="#6B7280" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span
                                style={{
                                  fontSize: "14px",
                                  fontWeight: 500,
                                  color: "var(--text-primary)",
                                }}
                              >
                                {getDocumentLabel(type)}
                              </span>
                              <p
                                style={{
                                  fontSize: "12px",
                                  color: "var(--text-secondary)",
                                  marginTop: "2px",
                                }}
                              >
                                Missing key document
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderRadius: "14px",
                    overflow: "hidden",
                    border: "1px solid var(--border-light)",
                  }}
                >
                  <div
                    style={{
                      padding: "14px 16px",
                      borderBottom:
                        otherDocuments.length > 0
                          ? "1px solid var(--border-light)"
                          : "none",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      Other Documents
                    </p>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginTop: "2px",
                      }}
                    >
                      Additional supporting documents shared by the business.
                    </p>
                  </div>
                  {otherDocuments.length === 0 ? (
                    <div style={{ padding: "20px 16px" }}>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {documents.length === 0
                          ? "No documents uploaded yet."
                          : "No other documents uploaded."}
                      </p>
                    </div>
                  ) : (
                    otherDocuments.map((item, idx) => {
                      const { doc, expiring, expired } = item;
                      const isPdf = doc.mimeType === "application/pdf";
                      const isLast = idx === otherDocuments.length - 1;

                      return (
                        <div
                          key={doc.id}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            padding: "12px 16px",
                            backgroundColor: "var(--bg-card)",
                            borderBottom: isLast
                              ? "none"
                              : "1px solid var(--border-light)",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "8px",
                              backgroundColor: isPdf ? "#FEE2E2" : "#DBEAFE",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {isPdf ? (
                              <FilePdf size={18} color="#DC2626" />
                            ) : (
                              <Image size={18} color="#2563EB" />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "14px",
                                  fontWeight: 500,
                                  color: "var(--text-primary)",
                                }}
                              >
                                {getDocumentLabel(doc.documentType)}
                              </span>
                              {doc.verificationStatus === "verified" && (
                                <CheckCircle
                                  size={14}
                                  color="#16A34A"
                                  weight="fill"
                                />
                              )}
                            </div>
                            <p
                              style={{
                                fontSize: "12px",
                                color: "var(--text-secondary)",
                                marginTop: "2px",
                              }}
                            >
                              {formatFileSize(doc.fileSizeBytes)} ·{" "}
                              {formatUploadDate(doc.uploadedAt)}
                            </p>
                            {doc.verificationStatus === "pending" && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  marginTop: "2px",
                                }}
                              >
                                <Clock
                                  size={12}
                                  color="var(--status-dispatched)"
                                />
                                <span
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--status-dispatched)",
                                  }}
                                >
                                  Verification pending
                                </span>
                              </div>
                            )}
                            {doc.expiryDate && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  marginTop: "2px",
                                }}
                              >
                                {expired || expiring ? (
                                  <Warning
                                    size={12}
                                    color="#D97706"
                                    weight="fill"
                                  />
                                ) : null}
                                <span
                                  style={{
                                    fontSize: "11px",
                                    color:
                                      expired || expiring
                                        ? "#D97706"
                                        : "#16A34A",
                                  }}
                                >
                                  {expired ? "Expired" : "Exp"}:{" "}
                                  {doc.expiryDate}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </Section>
        </div>
      </div>

      {(mode === 'send-request' || mode === 'accept-request') && (
        <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
          {mode === 'send-request' && (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              borderRadius: '14px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Review trust signals before you send this request.
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Start with Overview, Verification, and Trading Signals, then use the docs tab for file-level detail only if you need more context.
              </p>
            </div>
          )}

          {mode === 'accept-request' && requestData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-light)',
                borderRadius: '14px',
                padding: '12px 14px',
              }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  Request context
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {business.businessName} is requesting to connect as the <strong>{roleLabel(requestData.requesterRole)}</strong>. You would join this relationship as the <strong>{roleLabel(requestData.receiverRole)}</strong>.
                </p>
              </div>

              {hasWeakTrustSignals && (
                <div style={{
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: '14px',
                  padding: '12px 14px',
                }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400E', marginBottom: '4px' }}>
                    Review before accepting
                  </p>
                  <p style={{ fontSize: '12px', color: '#A16207', lineHeight: 1.45 }}>
                    Check {trustReviewSignals.join(', ')} before you confirm the connection.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fixed Bottom CTA */}
      <div
        style={{
          padding: "12px 16px",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          backgroundColor: "var(--bg-card)",
          borderTop: "1px solid var(--border-light)",
          flexShrink: 0,
        }}
      >
        {mode === "send-request" && (
          <button
            onClick={handleSendRequest}
            disabled={sending}
            style={{
              width: "100%",
              padding: "14px",
              backgroundColor: "var(--brand-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
              fontSize: "15px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {sending ? "Loading…" : "Send Connection Request"}
          </button>
        )}

        {mode === "accept-request" && (
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={handleDecline}
              disabled={processing}
              style={{
                flex: 1,
                padding: "14px",
                backgroundColor: "transparent",
                border: "1px solid var(--border-light)",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: 500,
                cursor: "pointer",
                color: "var(--text-primary)",
              }}
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              disabled={processing}
              style={{
                flex: 2,
                padding: "14px",
                backgroundColor: "var(--brand-primary)",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Accept Connection →
            </button>
          </div>
        )}

        {mode === "view-connection" && (
          <button
            onClick={onBack}
            style={{
              width: "100%",
              padding: "14px",
              backgroundColor: "transparent",
              border: "1px solid var(--border-light)",
              borderRadius: "12px",
              fontSize: "15px",
              fontWeight: 500,
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            {isSelfProfileReady ? 'Back to Profile' : 'Close'}
          </button>
        )}
      </div>

      {/* Role confirm dialog — send-request mode */}
      {mode === "send-request" && (
        <Dialog open={showRoleConfirm} onOpenChange={setShowRoleConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Your Role</DialogTitle>
              <DialogDescription>
                Select your role in this connection with {business.businessName}
                .
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <RadioGroup
                value={receiverRole}
                onValueChange={(val) =>
                  setReceiverRole(val as "buyer" | "supplier")
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="buyer" id="send-buyer" />
                  <Label
                    htmlFor="send-buyer"
                    className="font-normal cursor-pointer"
                  >
                    I am the Buyer
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="supplier" id="send-supplier" />
                  <Label
                    htmlFor="send-supplier"
                    className="font-normal cursor-pointer"
                  >
                    I am the Supplier
                  </Label>
                </div>
              </RadioGroup>
              <div className="flex gap-2">
                <Button
                  onClick={handleConfirmSendRequest}
                  disabled={processing}
                  className="flex-1"
                >
                  {processing ? "Sending…" : "Send Request"}
                </Button>
                <Button
                  onClick={() => setShowRoleConfirm(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Role confirm dialog — accept-request mode */}
      {mode === "accept-request" && requestData && (
        <Dialog open={showRoleConfirm} onOpenChange={setShowRoleConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Connection Roles</DialogTitle>
              <DialogDescription>
                Select your role. {business.businessName} wants to be the{" "}
                {requestData.requesterRole === "buyer" ? "Buyer" : "Supplier"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <RadioGroup
                value={receiverRole}
                onValueChange={(val) =>
                  setReceiverRole(val as "buyer" | "supplier")
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="buyer" id="acc-buyer" />
                  <Label
                    htmlFor="acc-buyer"
                    className="font-normal cursor-pointer"
                  >
                    I am the Buyer
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="supplier" id="acc-supplier" />
                  <Label
                    htmlFor="acc-supplier"
                    className="font-normal cursor-pointer"
                  >
                    I am the Supplier
                  </Label>
                </div>
              </RadioGroup>
              {roleError && (
                <p className="text-sm text-destructive">{roleError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={handleRoleConfirmAccept}
                  disabled={processing}
                  className="flex-1"
                >
                  {processing ? "Creating…" : "Confirm"}
                </Button>
                <Button
                  onClick={() => setShowRoleConfirm(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

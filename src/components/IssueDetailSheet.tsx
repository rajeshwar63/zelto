import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import { formatDistanceToNow } from 'date-fns'
import { acknowledgeIssue, resolveIssue, closeIssue, addIssueComment } from '@/lib/interactions'
import { dataStore } from '@/lib/data-store'
import { toast } from 'sonner'
import type { IssueReport, IssueComment, OrderWithPaymentState, BusinessEntity } from '@/lib/types'

interface IssueDetailSheetProps {
  issue: IssueReport
  order: OrderWithPaymentState
  buyerBusiness: BusinessEntity
  supplierBusiness: BusinessEntity
  currentBusinessId: string
  isOpen: boolean
  onClose: () => void
  onStatusChange: () => void
}

export function IssueDetailSheet({
  issue,
  order,
  buyerBusiness,
  supplierBusiness,
  currentBusinessId,
  isOpen,
  onClose,
  onStatusChange,
}: IssueDetailSheetProps) {
  const [comments, setComments] = useState<IssueComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [isSending, setIsSending] = useState(false)

  const isRaiser =
    (issue.raisedBy === 'buyer' && currentBusinessId === buyerBusiness.id) ||
    (issue.raisedBy === 'supplier' && currentBusinessId === supplierBusiness.id)
  const isResponder = !isRaiser
  const showAcknowledge = isResponder && issue.status === 'Open'
  const showResolve = issue.status === 'Open' || issue.status === 'Acknowledged'
  const showClose = isRaiser && issue.status === 'Resolved'
  const isClosed = issue.status === 'Closed'

  const raiserName = issue.raisedBy === 'buyer'
    ? buyerBusiness.businessName
    : supplierBusiness.businessName

  const resolvedByName = issue.resolvedBy === 'buyer'
    ? buyerBusiness.businessName
    : issue.resolvedBy === 'supplier'
      ? supplierBusiness.businessName
      : undefined

  useEffect(() => {
    if (isOpen) {
      dataStore.getIssueCommentsByIssueId(issue.id).then(setComments).catch(console.error)
    }
  }, [isOpen, issue.id])

  const handleAcknowledge = async () => {
    try {
      await acknowledgeIssue(issue.id, currentBusinessId)
      toast.success('Issue acknowledged')
      onStatusChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to acknowledge issue')
    }
  }

  const handleResolve = async () => {
    try {
      await resolveIssue(issue.id, currentBusinessId)
      toast.success('Issue resolved')
      onStatusChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve issue')
    }
  }

  const handleClose = async () => {
    try {
      await closeIssue(issue.id, currentBusinessId)
      toast.success('Issue closed')
      onStatusChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close issue')
    }
  }

  const handleSendComment = async () => {
    if (!newComment.trim() || isSending) return
    setIsSending(true)
    try {
      await addIssueComment(issue.id, newComment.trim(), currentBusinessId)
      setNewComment('')
      const updated = await dataStore.getIssueCommentsByIssueId(issue.id)
      setComments(updated)
      toast.success('Response sent')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send response')
    } finally {
      setIsSending(false)
    }
  }

  const getCommentAuthorName = (comment: IssueComment): string => {
    return comment.authorRole === 'buyer'
      ? buyerBusiness.businessName
      : supplierBusiness.businessName
  }

  const severityColor = issue.severity === 'High'
    ? 'var(--status-overdue)'
    : issue.severity === 'Medium'
      ? '#F59E0B'
      : 'var(--text-secondary)'

  const statusColor = issue.status === 'Resolved' || issue.status === 'Closed'
    ? '#22C55E'
    : issue.status === 'Acknowledged'
      ? '#F59E0B'
      : '#EF4444'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', maxHeight: '85vh', overflowY: 'auto' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-muted rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 pb-3 flex items-start justify-between">
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {issue.issueType}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: severityColor }}>
                    {issue.severity} Severity
                  </span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: statusColor,
                    backgroundColor: `${statusColor}1A`,
                    padding: '2px 8px',
                    borderRadius: '12px',
                  }}>
                    {issue.status}
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="p-1" style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Description */}
            {issue.description && (
              <div className="px-4 pb-4">
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  DESCRIPTION
                </p>
                <p style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {issue.description}
                </p>
              </div>
            )}

            {/* Order context */}
            <div className="px-4 pb-4">
              <div style={{ backgroundColor: 'var(--bg-screen)', borderRadius: 'var(--radius-card)', padding: '10px 14px' }}>
                <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Order</p>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {order.itemSummary}
                </p>
                {order.orderValue > 0 && (
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {order.orderValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                  </p>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="px-4 pb-4">
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                TIMELINE
              </p>
              <div style={{ paddingLeft: '4px' }}>
                {/* Raised */}
                <TimelineEntry
                  color="#EF4444"
                  label={`Raised by ${raiserName}`}
                  timestamp={issue.createdAt}
                  showConnector={issue.status !== 'Open'}
                />

                {/* Acknowledged */}
                {(issue.status === 'Acknowledged' || issue.status === 'Resolved' || issue.status === 'Closed') && (
                  <TimelineEntry
                    color="#F59E0B"
                    label={`Acknowledged${issue.raisedBy === 'buyer' ? ` by ${supplierBusiness.businessName}` : ` by ${buyerBusiness.businessName}`}`}
                    timestamp={issue.acknowledgedAt}
                    showConnector={issue.status === 'Resolved' || issue.status === 'Closed'}
                  />
                )}

                {/* Resolved */}
                {(issue.status === 'Resolved' || issue.status === 'Closed') && (
                  <TimelineEntry
                    color="#22C55E"
                    label={`Resolved${resolvedByName ? ` by ${resolvedByName}` : ''}`}
                    timestamp={issue.resolvedAt}
                    showConnector={issue.status === 'Closed'}
                  />
                )}

                {/* Closed */}
                {issue.status === 'Closed' && (
                  <TimelineEntry
                    color="#6B7280"
                    label={`Closed by ${raiserName}`}
                    showConnector={false}
                  />
                )}
              </div>
            </div>

            {/* Responses / Comments */}
            {comments.length > 0 && (
              <div className="px-4 pb-4">
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                  RESPONSES
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {comments.map(comment => {
                    const isMyComment = comment.authorBusinessId === currentBusinessId
                    return (
                      <div
                        key={comment.id}
                        style={{
                          backgroundColor: isMyComment ? '#EFF6FF' : 'var(--bg-screen)',
                          borderRadius: 'var(--radius-card)',
                          padding: '10px 14px',
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {getCommentAuthorName(comment)}
                          </p>
                          <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>
                            {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
                          </p>
                        </div>
                        <p style={{ fontSize: '14px', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {comment.message}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Comment input */}
            {!isClosed && (
              <div className="px-4 pb-4">
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                  RESPOND
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Type a response..."
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendComment() }}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    style={{ minHeight: '40px' }}
                  />
                  <button
                    onClick={handleSendComment}
                    disabled={!newComment.trim() || isSending}
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#FFFFFF',
                      backgroundColor: !newComment.trim() || isSending ? '#9CA3AF' : 'var(--brand-primary, #4A6CF7)',
                      border: 'none',
                      borderRadius: 'var(--radius-button)',
                      padding: '8px 16px',
                      minHeight: '40px',
                    }}
                  >
                    {isSending ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            {(showAcknowledge || showResolve || showClose) && (
              <div className="px-4 pb-4">
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                  ACTIONS
                </p>
                <div className="flex gap-3">
                  {showAcknowledge && (
                    <button
                      onClick={handleAcknowledge}
                      className="flex-1"
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-card)',
                        borderRadius: 'var(--radius-button)',
                        padding: '12px',
                        minHeight: '44px',
                      }}
                    >
                      Acknowledge
                    </button>
                  )}
                  {showResolve && (
                    <button
                      onClick={handleResolve}
                      className="flex-1"
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#FFFFFF',
                        backgroundColor: '#22C55E',
                        border: 'none',
                        borderRadius: 'var(--radius-button)',
                        padding: '12px',
                        minHeight: '44px',
                      }}
                    >
                      Mark as Resolved
                    </button>
                  )}
                  {showClose && (
                    <button
                      onClick={handleClose}
                      className="flex-1"
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-light)',
                        backgroundColor: 'var(--bg-card)',
                        borderRadius: 'var(--radius-button)',
                        padding: '12px',
                        minHeight: '44px',
                      }}
                    >
                      Close Issue
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function TimelineEntry({
  color,
  label,
  timestamp,
  showConnector,
}: {
  color: string
  label: string
  timestamp?: number
  showConnector: boolean
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className="flex-shrink-0 mt-1"
          style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color }}
        />
        {showConnector && (
          <div style={{ width: '2px', flex: 1, minHeight: '24px', backgroundColor: color, opacity: 0.3 }} />
        )}
      </div>
      <div style={{ paddingBottom: '16px' }}>
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
        {timestamp && (
          <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>
            {formatDistanceToNow(timestamp, { addSuffix: true })}
          </p>
        )}
      </div>
    </div>
  )
}

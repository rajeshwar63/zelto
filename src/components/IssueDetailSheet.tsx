import { motion, AnimatePresence } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import { formatDistanceToNow } from 'date-fns'
import { acknowledgeIssue, resolveIssue } from '@/lib/interactions'
import { toast } from 'sonner'
import type { IssueReport, OrderWithPaymentState, BusinessEntity } from '@/lib/types'

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
  const isRaiser =
    (issue.raisedBy === 'buyer' && currentBusinessId === buyerBusiness.id) ||
    (issue.raisedBy === 'supplier' && currentBusinessId === supplierBusiness.id)
  const isResponder = !isRaiser
  const showAcknowledge = isResponder && issue.status === 'Open'
  const showResolve = issue.status === 'Open' || issue.status === 'Acknowledged'

  const raiserName = issue.raisedBy === 'buyer'
    ? buyerBusiness.businessName
    : supplierBusiness.businessName

  const resolvedByName = issue.resolvedBy === 'buyer'
    ? buyerBusiness.businessName
    : issue.resolvedBy === 'supplier'
      ? supplierBusiness.businessName
      : undefined

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

  const severityColor = issue.severity === 'High'
    ? 'var(--status-overdue)'
    : issue.severity === 'Medium'
      ? '#F59E0B'
      : 'var(--text-secondary)'

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
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', maxHeight: '80vh', overflowY: 'auto' }}
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
                <p style={{ fontSize: '13px', fontWeight: 600, color: severityColor, marginTop: '2px' }}>
                  {issue.severity} Severity
                </p>
              </div>
              <button onClick={onClose} className="p-1" style={{ color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

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
                  showConnector={issue.status === 'Acknowledged' || issue.status === 'Resolved'}
                />

                {/* Acknowledged */}
                {(issue.status === 'Acknowledged' || issue.status === 'Resolved') && (
                  <TimelineEntry
                    color="#F59E0B"
                    label={`Acknowledged${issue.raisedBy === 'buyer' ? ` by ${supplierBusiness.businessName}` : ` by ${buyerBusiness.businessName}`}`}
                    timestamp={issue.acknowledgedAt}
                    showConnector={issue.status === 'Resolved'}
                  />
                )}

                {/* Resolved */}
                {issue.status === 'Resolved' && (
                  <TimelineEntry
                    color="#22C55E"
                    label={`Resolved${resolvedByName ? ` by ${resolvedByName}` : ''}`}
                    timestamp={issue.resolvedAt}
                    showConnector={false}
                  />
                )}
              </div>
            </div>

            {/* Actions */}
            {(showAcknowledge || showResolve) && (
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
                      Resolve
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

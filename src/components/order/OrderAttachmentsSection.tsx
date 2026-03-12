import type { BusinessEntity, OrderAttachment } from '@/lib/types'
import { OrderAttachments } from '@/components/OrderAttachments'

interface Props {
  attachments: OrderAttachment[]
  currentBusinessId: string
  buyerBusiness: BusinessEntity | null
  supplierBusiness: BusinessEntity | null
  onAddAttachment: () => void
  onViewAttachment: (index: number) => void
  onDeleteAttachment: (attachmentId: string) => void
}

export function OrderAttachmentsSection({
  attachments,
  currentBusinessId,
  buyerBusiness,
  supplierBusiness,
  onAddAttachment,
  onViewAttachment,
  onDeleteAttachment,
}: Props) {
  return (
    <div className="px-4 mb-3">
      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
        ATTACHMENTS
      </p>
      <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', padding: '14px 16px' }}>
        {attachments.length > 0 && buyerBusiness && supplierBusiness ? (
          <OrderAttachments
            attachments={attachments}
            currentBusinessId={currentBusinessId}
            buyerBusiness={buyerBusiness}
            supplierBusiness={supplierBusiness}
            onAddAttachment={onAddAttachment}
            onViewAttachment={onViewAttachment}
            onDeleteAttachment={(attachment) => onDeleteAttachment(attachment.id)}
          />
        ) : (
          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>No attachments</p>
        )}

        <button
          onClick={onAddAttachment}
          style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-primary)', marginTop: '8px', minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          + Add attachment
        </button>
      </div>
    </div>
  )
}

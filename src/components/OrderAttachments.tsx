import { useState, useRef } from 'react'
import type { OrderAttachment, BusinessEntity } from '@/lib/types'
import { Paperclip, Plus, Image, FilePdf, Note, Trash } from '@phosphor-icons/react'

interface OrderAttachmentsProps {
  attachments: OrderAttachment[]
  currentBusinessId: string
  buyerBusiness: BusinessEntity
  supplierBusiness: BusinessEntity
  onAddAttachment: () => void
  onViewAttachment: (index: number) => void
  onDeleteAttachment: (attachment: OrderAttachment) => void
}

export function OrderAttachments({
  attachments,
  currentBusinessId,
  buyerBusiness,
  supplierBusiness,
  onAddAttachment,
  onViewAttachment,
  onDeleteAttachment,
}: OrderAttachmentsProps) {
  const [longPressId, setLongPressId] = useState<string | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLongPressStart = (attachment: OrderAttachment) => {
    if (attachment.uploadedBy !== currentBusinessId) return
    longPressTimer.current = setTimeout(() => {
      setLongPressId(attachment.id)
    }, 500)
  }

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const getTypeLabel = (type: OrderAttachment['type']) => {
    switch (type) {
      case 'bill': return 'Bill'
      case 'payment_proof': return 'Payment Proof'
      case 'note': return 'Note'
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Paperclip size={14} className="text-muted-foreground" />
        <h2 className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Attachments</h2>
      </div>

      {attachments.length === 0 ? (
        <button
          onClick={onAddAttachment}
          className="w-full py-3 text-center text-[13px] text-muted-foreground border border-dashed border-border rounded-lg hover:border-foreground/30 transition-colors"
        >
          Add bill, payment proof, or notes
        </button>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {attachments.map((attachment, index) => (
              <div key={attachment.id} className="relative flex-shrink-0">
                <button
                  onClick={() => {
                    if (longPressId === attachment.id) return
                    onViewAttachment(index)
                  }}
                  onPointerDown={() => handleLongPressStart(attachment)}
                  onPointerUp={handleLongPressEnd}
                  onPointerLeave={handleLongPressEnd}
                  onPointerCancel={handleLongPressEnd}
                  className="w-[72px] h-[72px] rounded-lg overflow-hidden border border-border flex flex-col items-center justify-center gap-1 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  {attachment.noteText ? (
                    <>
                      <Note size={20} className="text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground px-1 truncate w-full text-center">
                        {attachment.noteText.slice(0, 20)}
                      </span>
                    </>
                  ) : attachment.fileType?.startsWith('image/') ? (
                    attachment.thumbnailUrl || attachment.fileUrl ? (
                      <img
                        src={attachment.thumbnailUrl || attachment.fileUrl!}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Image size={24} className="text-muted-foreground" />
                    )
                  ) : (
                    <>
                      <FilePdf size={24} className="text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground px-1 truncate w-full text-center">
                        {attachment.fileName || 'PDF'}
                      </span>
                    </>
                  )}
                </button>

                <span
                  className="absolute bottom-1 left-1 px-1 py-0.5 text-[8px] rounded bg-black/50 text-white leading-none"
                >
                  {getTypeLabel(attachment.type)}
                </span>

                {longPressId === attachment.id && (
                  <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setLongPressId(null)
                        onDeleteAttachment(attachment)
                      }}
                      className="p-2 bg-white rounded-full shadow-sm"
                    >
                      <Trash size={16} className="text-destructive" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={onAddAttachment}
              className="w-[72px] h-[72px] rounded-lg border border-dashed border-border flex items-center justify-center flex-shrink-0 hover:border-foreground/30 transition-colors"
            >
              <Plus size={20} className="text-muted-foreground" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

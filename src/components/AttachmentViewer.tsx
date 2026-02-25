import { useState, useRef } from 'react'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import { X, FilePdf, Note } from '@phosphor-icons/react'
import { format } from 'date-fns'
import type { OrderAttachment, BusinessEntity } from '@/lib/types'

interface AttachmentViewerProps {
  attachments: OrderAttachment[]
  initialIndex: number
  buyerBusiness: BusinessEntity
  supplierBusiness: BusinessEntity
  onClose: () => void
}

export function AttachmentViewer({
  attachments,
  initialIndex,
  buyerBusiness,
  supplierBusiness,
  onClose,
}: AttachmentViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const lastDistance = useRef<number | null>(null)

  const attachment = attachments[currentIndex]
  if (!attachment) return null

  const getUploaderName = (uploadedBy: string) => {
    if (uploadedBy === buyerBusiness.id) return buyerBusiness.businessName
    if (uploadedBy === supplierBusiness.id) return supplierBusiness.businessName
    return 'Unknown'
  }

  const getTypeLabel = (type: OrderAttachment['type']) => {
    switch (type) {
      case 'bill': return 'Bill'
      case 'payment_proof': return 'Payment Proof'
      case 'note': return 'Note'
    }
  }

  const handleSwipe = (_: any, info: PanInfo) => {
    if (scale > 1) return
    const threshold = 50
    if (info.offset.x < -threshold && currentIndex < attachments.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else if (info.offset.x > threshold && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      )

      if (lastDistance.current !== null) {
        const delta = distance / lastDistance.current
        setScale(prev => Math.max(1, Math.min(prev * delta, 4)))
      }
      lastDistance.current = distance
    }
  }

  const handleTouchEnd = () => {
    lastDistance.current = null
    if (scale < 1.1) setScale(1)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-[60] flex flex-col"
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/80"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-white/90 font-medium">{getTypeLabel(attachment.type)}</p>
          <p className="text-[11px] text-white/60">
            {getUploaderName(attachment.uploadedBy)} · {format(attachment.timestamp, 'MMM d, yyyy h:mm a')}
          </p>
        </div>
        <button onClick={onClose} className="p-2 text-white/80 hover:text-white ml-3">
          <X size={22} weight="bold" />
        </button>
      </div>

      {/* Content area */}
      <motion.div
        className="flex-1 flex items-center justify-center overflow-hidden"
        drag={scale <= 1 ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        onDragEnd={handleSwipe}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="w-full h-full flex items-center justify-center px-4"
          >
            {attachment.noteText ? (
              <div className="max-w-md w-full bg-white/10 rounded-xl p-6">
                <Note size={28} className="text-white/40 mb-3" />
                <p className="text-[15px] text-white leading-relaxed whitespace-pre-wrap">
                  {attachment.noteText}
                </p>
              </div>
            ) : attachment.fileType?.startsWith('image/') && attachment.fileUrl ? (
              <img
                src={attachment.fileUrl}
                alt={attachment.fileName || ''}
                className="max-w-full max-h-full object-contain"
                style={{ transform: `scale(${scale})`, transition: 'transform 0.1s ease-out' }}
                draggable={false}
              />
            ) : attachment.fileType === 'application/pdf' && attachment.fileUrl ? (
              <div className="flex flex-col items-center gap-4">
                <FilePdf size={64} className="text-white/60" />
                <p className="text-[14px] text-white/80">{attachment.fileName || 'Document.pdf'}</p>
                <a
                  href={attachment.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-[13px] text-white bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                >
                  Open PDF
                </a>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FilePdf size={48} className="text-white/40" />
                <p className="text-[13px] text-white/60">File not available</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Pagination dots */}
      {attachments.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          {attachments.map((_, idx) => (
            <div
              key={idx}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                idx === currentIndex ? 'bg-white' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

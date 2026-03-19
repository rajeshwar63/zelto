import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase-client'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'
import { AttachmentUploadBox, type SelectedFile } from '@/components/AttachmentUploadBox'
import { formatInrCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface Props {
  open: boolean
  orderId: string
  currentBusinessId: string
  paymentEventId: string
  amountPaid: number
  paymentTimestamp: number
  onClose: () => void
}

export function PaymentAttachmentBottomSheet({
  open,
  orderId,
  currentBusinessId,
  paymentEventId,
  amountPaid,
  paymentTimestamp,
  onClose,
}: Props) {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [uploadState, setUploadState] = useState<'empty' | 'selected' | 'uploading' | 'uploaded'>('empty')

  const handleFileSelect = (file: File) => {
    setSelectedFile({ file, previewName: file.name, sizeBytes: file.size })
    setUploadState('selected')
  }

  const handleRemove = () => {
    setSelectedFile(null)
    setUploadState('empty')
  }

  const handleSkip = () => {
    resetAndClose()
  }

  const handleUploadAndSave = async () => {
    if (!selectedFile) return
    setUploadState('uploading')
    try {
      const file = selectedFile.file
      const fileExt = file.name.split('.').pop()
      const storagePath = `${orderId}/payment_proof/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('order-attachments')
        .upload(storagePath, file)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('order-attachments')
        .getPublicUrl(storagePath)

      await dataStore.createOrderAttachment(orderId, 'payment_proof', currentBusinessId, {
        fileUrl: urlData.publicUrl,
        fileName: file.name,
        fileType: file.type,
        fileSizeBytes: file.size,
        storagePath,
        paymentEventId,
      })

      emitDataChange('attachments:changed')
      setUploadState('uploaded')
      toast.success('Payment proof saved')
      setTimeout(resetAndClose, 600)
    } catch (err) {
      console.error('Upload failed:', err)
      toast.error('Upload failed. Please try again.')
      setUploadState('selected')
    }
  }

  const resetAndClose = () => {
    setSelectedFile(null)
    setUploadState('empty')
    onClose()
  }

  const formattedDate = format(paymentTimestamp, 'd MMM yyyy')

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50"
            onClick={resetAndClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-muted rounded-full" />
            </div>

            <div className="px-4 pb-4">
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Payment recorded
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {formatInrCurrency(amountPaid)} marked as paid on {formattedDate}.
              </p>
              <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
                Attach proof? (optional)
              </p>

              <AttachmentUploadBox
                helperText="UTR screenshot, bank ref, or receipt"
                uploadState={uploadState}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                onRemove={handleRemove}
              />

              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleSkip}
                  disabled={uploadState === 'uploading'}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    backgroundColor: 'var(--bg-screen)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-button)',
                    minHeight: '44px',
                  }}
                >
                  Skip
                </button>
                <button
                  onClick={handleUploadAndSave}
                  disabled={!selectedFile || uploadState === 'uploading' || uploadState === 'uploaded'}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    backgroundColor: 'var(--brand-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-button)',
                    minHeight: '44px',
                    opacity: !selectedFile || uploadState === 'uploading' ? 0.4 : 1,
                  }}
                >
                  {uploadState === 'uploading' ? 'Uploading...' : 'Upload & save'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

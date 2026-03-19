import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase-client'
import { dataStore } from '@/lib/data-store'
import { emitDataChange } from '@/lib/data-events'
import { AttachmentUploadBox, type SelectedFile } from '@/components/AttachmentUploadBox'
import { toast } from 'sonner'

interface Props {
  open: boolean
  orderId: string
  currentBusinessId: string
  onClose: () => void
  onDeliveryConfirmed: () => void
}

export function DeliveryProofBottomSheet({ open, orderId, currentBusinessId, onClose, onDeliveryConfirmed }: Props) {
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

  const handleCancel = () => {
    resetState()
    onClose()
  }

  const handleConfirmDelivery = async () => {
    if (!selectedFile) return
    setUploadState('uploading')
    try {
      const file = selectedFile.file
      const fileExt = file.name.split('.').pop()
      const storagePath = `${orderId}/delivery_proof/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('order-attachments')
        .upload(storagePath, file)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('order-attachments')
        .getPublicUrl(storagePath)

      await dataStore.createOrderAttachment(orderId, 'delivery_proof', currentBusinessId, {
        fileUrl: urlData.publicUrl,
        fileName: file.name,
        fileType: file.type,
        fileSizeBytes: file.size,
        storagePath,
      })

      emitDataChange('attachments:changed')
      setUploadState('uploaded')

      // Delivery state transition is handled by the caller after this callback
      onDeliveryConfirmed()
      resetState()
    } catch (err) {
      console.error('Upload failed:', err)
      toast.error('Upload failed. Please try again.')
      setUploadState('selected')
    }
  }

  const resetState = () => {
    setSelectedFile(null)
    setUploadState('empty')
  }

  const canConfirm = !!selectedFile && uploadState !== 'uploading' && uploadState !== 'uploaded'

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50"
            onClick={handleCancel}
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
                Attach delivery proof
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                You're marking delivery on behalf of the buyer. Please attach a photo or signed challan.
              </p>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#EF4444', marginBottom: '16px' }}>
                Required
              </p>

              <AttachmentUploadBox
                helperText="Photo or delivery challan"
                uploadState={uploadState}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                onRemove={handleRemove}
              />

              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleCancel}
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
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelivery}
                  disabled={!canConfirm}
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
                    opacity: canConfirm ? 1 : 0.4,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {uploadState === 'uploading' ? 'Uploading...' : 'Confirm delivery'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

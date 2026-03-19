import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase-client'
import { dataStore } from '@/lib/data-store'
import { transitionOrderState } from '@/lib/interactions'
import { emitDataChange } from '@/lib/data-events'
import { AttachmentUploadBox, type SelectedFile } from '@/components/AttachmentUploadBox'
import { toast } from 'sonner'

interface Props {
  open: boolean
  orderId: string
  currentBusinessId: string
  onClose: () => void
}

export function DispatchBottomSheet({ open, orderId, currentBusinessId, onClose }: Props) {
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [uploadState, setUploadState] = useState<'empty' | 'selected' | 'uploading' | 'uploaded'>('empty')
  const [isConfirming, setIsConfirming] = useState(false)

  const parsedAmount = parseFloat(invoiceAmount)
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0
  const canConfirm = isAmountValid && !isConfirming

  const handleFileSelect = (file: File) => {
    setSelectedFile({ file, previewName: file.name, sizeBytes: file.size })
    setUploadState('selected')
  }

  const handleRemove = () => {
    setSelectedFile(null)
    setUploadState('empty')
  }

  const handleConfirmDispatch = async () => {
    if (!isAmountValid || isConfirming) return
    setIsConfirming(true)
    try {
      // 1. Write order_value + dispatched_at + state
      await transitionOrderState(orderId, 'Dispatched', currentBusinessId, parsedAmount)
      toast.success('Order dispatched')

      // 2. If file attached, upload and create attachment record
      if (selectedFile) {
        setUploadState('uploading')
        try {
          const file = selectedFile.file
          const fileExt = file.name.split('.').pop()
          const storagePath = `${orderId}/dispatch_note/${Date.now()}.${fileExt}`

          const { error: uploadError } = await supabase.storage
            .from('order-attachments')
            .upload(storagePath, file)

          if (uploadError) throw uploadError

          const { data: urlData } = supabase.storage
            .from('order-attachments')
            .getPublicUrl(storagePath)

          await dataStore.createOrderAttachment(orderId, 'dispatch_note', currentBusinessId, {
            fileUrl: urlData.publicUrl,
            fileName: file.name,
            fileType: file.type,
          })

          emitDataChange('attachments:changed')
          setUploadState('uploaded')
        } catch (uploadErr) {
          console.error('Attachment upload failed:', uploadErr)
          toast.error('Dispatch confirmed, but attachment upload failed.')
        }
      }

      resetAndClose()
    } catch (err) {
      console.error('Dispatch failed:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to dispatch order')
    } finally {
      setIsConfirming(false)
    }
  }

  const resetAndClose = () => {
    setInvoiceAmount('')
    setSelectedFile(null)
    setUploadState('empty')
    setIsConfirming(false)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50"
            onClick={isConfirming ? undefined : resetAndClose}
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
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>
                Mark as dispatched
              </h3>

              {/* Invoice amount input */}
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Invoice amount
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: '#FFFFFF',
                    border: '0.5px solid #E2E4EA',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    gap: '6px',
                  }}
                >
                  <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={invoiceAmount}
                    onChange={e => {
                      const val = e.target.value
                      if (val === '' || parseFloat(val) >= 0) setInvoiceAmount(val)
                    }}
                    placeholder="0.00"
                    min="0.01"
                    step="any"
                    autoFocus
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      fontSize: '16px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      backgroundColor: 'transparent',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>

              {/* Optional attachment */}
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Attach invoice or dispatch note (optional)
              </p>
              <AttachmentUploadBox
                helperText="Invoice or dispatch note"
                uploadState={uploadState}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                onRemove={handleRemove}
              />

              <div className="flex gap-3 mt-5">
                <button
                  onClick={resetAndClose}
                  disabled={isConfirming}
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
                  onClick={handleConfirmDispatch}
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
                    opacity: !canConfirm ? 0.4 : 1,
                  }}
                >
                  {isConfirming ? 'Confirming...' : 'Confirm dispatch'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

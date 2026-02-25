import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Image, FilePdf, Note, X } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase-client'
import type { AttachmentType } from '@/lib/types'
import { toast } from 'sonner'

interface AddAttachmentSheetProps {
  open: boolean
  orderId: string
  currentBusinessId: string
  onClose: () => void
  onAttachmentAdded: () => void
  onAddAttachment: (
    type: AttachmentType,
    options: {
      fileUrl?: string
      fileName?: string
      fileType?: string
      thumbnailUrl?: string
      noteText?: string
    }
  ) => Promise<void>
}

const ATTACHMENT_TAGS: { value: AttachmentType; label: string }[] = [
  { value: 'bill', label: 'Bill' },
  { value: 'payment_proof', label: 'Payment Proof' },
  { value: 'note', label: 'Note' },
]

export function AddAttachmentSheet({
  open,
  orderId,
  currentBusinessId,
  onClose,
  onAttachmentAdded,
  onAddAttachment,
}: AddAttachmentSheetProps) {
  const [uploading, setUploading] = useState(false)
  const [selectedTag, setSelectedTag] = useState<AttachmentType>('bill')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteText, setNoteText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `order-attachments/${orderId}/${currentBusinessId}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath)

      const fileUrl = urlData.publicUrl

      // For images, use the same URL as thumbnail (Supabase can transform)
      const thumbnailUrl = file.type.startsWith('image/') ? fileUrl : undefined

      await onAddAttachment(selectedTag, {
        fileUrl,
        fileName: file.name,
        fileType: file.type,
        thumbnailUrl,
      })

      onAttachmentAdded()
      onClose()
      toast.success('Attachment added')
    } catch (err) {
      console.error('Upload failed:', err)
      toast.error('Upload failed. Tap to retry.')
    } finally {
      setUploading(false)
    }
  }

  const handleImageSelect = () => {
    fileInputRef.current?.click()
  }

  const handlePdfSelect = () => {
    pdfInputRef.current?.click()
  }

  const handleNoteSubmit = async () => {
    if (!noteText.trim()) return
    setUploading(true)
    try {
      await onAddAttachment('note', {
        noteText: noteText.trim(),
      })
      setNoteText('')
      setShowNoteInput(false)
      onAttachmentAdded()
      onClose()
      toast.success('Note added')
    } catch (err) {
      toast.error('Failed to add note')
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    if (uploading) return
    setShowNoteInput(false)
    setNoteText('')
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
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 pb-safe"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-muted rounded-full" />
            </div>

            <div className="px-4 pb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-medium text-foreground">Add Attachment</h3>
              <button onClick={handleClose} className="p-1 text-muted-foreground">
                <X size={20} />
              </button>
            </div>

            {!showNoteInput && (
              <div className="px-4 pb-3">
                <p className="text-[11px] text-muted-foreground mb-2">Tag as:</p>
                <div className="flex gap-2">
                  {ATTACHMENT_TAGS.filter(t => t.value !== 'note').map(tag => (
                    <button
                      key={tag.value}
                      onClick={() => setSelectedTag(tag.value)}
                      className={`px-3 py-1.5 text-[12px] rounded-full border transition-colors ${
                        selectedTag === tag.value
                          ? 'border-foreground bg-foreground text-white'
                          : 'border-border text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-4 pb-4">
              {showNoteInput ? (
                <div className="space-y-3">
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Type your note..."
                    autoFocus
                    rows={3}
                    className="w-full px-3 py-2 text-[14px] border border-border rounded-lg resize-none outline-none focus:border-foreground/40"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowNoteInput(false); setNoteText('') }}
                      className="flex-1 px-3 py-2 text-[13px] rounded-lg bg-muted text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleNoteSubmit}
                      disabled={!noteText.trim() || uploading}
                      className="flex-1 px-3 py-2 text-[13px] rounded-lg text-white"
                      style={{
                        backgroundColor: '#1A1A2E',
                        opacity: !noteText.trim() || uploading ? 0.5 : 1,
                      }}
                    >
                      {uploading ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <button
                    onClick={handleImageSelect}
                    disabled={uploading}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Image size={22} className="text-foreground" />
                    <span className="text-[14px] text-foreground">Upload Image</span>
                  </button>

                  <button
                    onClick={handlePdfSelect}
                    disabled={uploading}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <FilePdf size={22} className="text-foreground" />
                    <span className="text-[14px] text-foreground">Upload PDF</span>
                  </button>

                  <button
                    onClick={() => setShowNoteInput(true)}
                    disabled={uploading}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Note size={22} className="text-foreground" />
                    <span className="text-[14px] text-foreground">Add Note</span>
                  </button>

                  {uploading && (
                    <div className="text-center py-2">
                      <p className="text-[12px] text-muted-foreground">Uploading...</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
                e.target.value = ''
              }}
            />
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
                e.target.value = ''
              }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, UploadSimple, FilePdf, Image, Trash, CheckCircle, Clock } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { supabase } from '@/lib/supabase-client'
import { calculateCredibility } from '@/lib/credibility'
import { toast } from 'sonner'
import type { BusinessDocument } from '@/lib/types'

const DOCUMENT_TYPES: { type: string; label: string; hasExpiry: boolean }[] = [
  { type: 'msme_udyam', label: 'MSME / Udyam Certificate', hasExpiry: false },
  { type: 'trade_licence', label: 'Trade Licence', hasExpiry: true },
  { type: 'fssai_licence', label: 'FSSAI Licence', hasExpiry: true },
  { type: 'pan_card', label: 'PAN Card', hasExpiry: false },
  { type: 'other', label: 'Other Document', hasExpiry: false },
]

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props {
  currentBusinessId: string
  onBack: () => void
}

export function ManageDocumentsScreen({ currentBusinessId, onBack }: Props) {
  const [documents, setDocuments] = useState<BusinessDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingType, setUploadingType] = useState<string | null>(null)
  const [pendingExpiry, setPendingExpiry] = useState<{ type: string; file: File } | null>(null)
  const [expiryDate, setExpiryDate] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    dataStore.getDocumentsByBusinessId(currentBusinessId)
      .then(docs => { setDocuments(docs); setLoading(false) })
      .catch(() => setLoading(false))
  }, [currentBusinessId])

  const handleDocumentRowTap = (docType: string, hasExpiry: boolean) => {
    const existing = documents.find(d => d.documentType === docType)
    if (existing) return

    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('data-doc-type', docType)
      fileInputRef.current.setAttribute('data-has-expiry', String(hasExpiry))
      fileInputRef.current.click()
    }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const docType = fileInputRef.current?.getAttribute('data-doc-type') || 'other'
    const hasExpiry = fileInputRef.current?.getAttribute('data-has-expiry') === 'true'

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB')
      return
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(file.type)) {
      toast.error('Only PDF, JPG, or PNG files allowed')
      return
    }

    if (hasExpiry) {
      setPendingExpiry({ type: docType, file })
      setExpiryDate('')
      return
    }

    await doUpload(docType, file, undefined)
  }

  const doUpload = async (docType: string, file: File, expiry: string | undefined) => {
    setUploadingType(docType)
    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const fileName = `${docType}_${Date.now()}.${ext}`
      const path = `${currentBusinessId}/${docType}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('business-documents')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('business-documents')
        .getPublicUrl(path)

      const doc = await dataStore.uploadBusinessDocument(currentBusinessId, {
        documentType: docType,
        fileName: file.name,
        fileUrl: publicUrl,
        fileSizeBytes: file.size,
        mimeType: file.type,
        expiryDate: expiry || undefined,
      })

      setDocuments(prev => [doc, ...prev])
      await calculateCredibility(currentBusinessId).catch(() => {})
      toast.success('Document uploaded')
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Upload failed. Please try again.')
    } finally {
      setUploadingType(null)
    }
  }

  const handleExpiryConfirm = async () => {
    if (!pendingExpiry) return
    const { type, file } = pendingExpiry
    const expiry = expiryDate || undefined
    setPendingExpiry(null)
    await doUpload(type, file, expiry)
  }

  const handleDeleteDocument = async (doc: BusinessDocument) => {
    try {
      await dataStore.deleteBusinessDocument(doc.id)
      setDocuments(prev => prev.filter(d => d.id !== doc.id))

      const path = `${currentBusinessId}/${doc.documentType}/${doc.fileName}`
      await supabase.storage.from('business-documents').remove([path]).catch(() => {})

      await calculateCredibility(currentBusinessId).catch(() => {})
      toast.success('Document removed')
    } catch {
      toast.error('Failed to remove document')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#F2F4F8', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      {/* Header */}
      <div style={{
        backgroundColor: '#0F1320',
        padding: '16px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={20} color="#fff" />
        </button>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Compliance Documents</h2>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        <p style={{ fontSize: '13px', color: '#8492A6', marginBottom: '20px' }}>
          Upload compliance documents to build credibility and let connections verify your business.
        </p>

        {loading ? (
          <p style={{ fontSize: '14px', color: '#8492A6', textAlign: 'center', marginTop: '40px' }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRadius: '14px', overflow: 'hidden', border: '1px solid #E8ECF2', backgroundColor: '#fff' }}>
            {DOCUMENT_TYPES.map((docDef, idx) => {
              const uploaded = documents.find(d => d.documentType === docDef.type)
              const isUploading = uploadingType === docDef.type
              const isLast = idx === DOCUMENT_TYPES.length - 1

              return (
                <div
                  key={docDef.type}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '14px 16px',
                    borderBottom: isLast ? 'none' : '1px solid #F2F4F8',
                    cursor: uploaded || isUploading ? 'default' : 'pointer',
                  }}
                  onClick={() => !uploaded && !isUploading && handleDocumentRowTap(docDef.type, docDef.hasExpiry)}
                >
                  {/* Icon */}
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '10px',
                    backgroundColor: uploaded ? '#DCFCE7' : '#F3F4F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '12px',
                    flexShrink: 0,
                  }}>
                    {uploaded ? (
                      uploaded.mimeType?.startsWith('image/') ? (
                        <Image size={18} color="#16A34A" />
                      ) : (
                        <FilePdf size={18} color="#16A34A" />
                      )
                    ) : (
                      <UploadSimple size={18} color="#8492A6" />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: '#1A1F2E' }}>
                        {docDef.label}
                      </span>
                    </div>

                    {uploaded && (
                      <div style={{ marginTop: '3px' }}>
                        <p style={{ fontSize: '12px', color: '#8492A6' }}>
                          {formatFileSize(uploaded.fileSizeBytes)} · {formatUploadDate(uploaded.uploadedAt)}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          {uploaded.verificationStatus === 'verified' ? (
                            <>
                              <CheckCircle size={12} color="#16A34A" weight="fill" />
                              <span style={{ fontSize: '11px', color: '#16A34A' }}>Verified</span>
                            </>
                          ) : (
                            <>
                              <Clock size={12} color="#8492A6" />
                              <span style={{ fontSize: '11px', color: '#8492A6' }}>Verification pending</span>
                            </>
                          )}
                        </div>
                        {uploaded.expiryDate && (
                          <p style={{ fontSize: '11px', color: '#8492A6', marginTop: '2px' }}>
                            Expires: {uploaded.expiryDate}
                          </p>
                        )}
                      </div>
                    )}

                    {isUploading && (
                      <p style={{ fontSize: '12px', color: '#4A6CF7', marginTop: '3px' }}>Uploading…</p>
                    )}

                    {!uploaded && !isUploading && (
                      <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>Tap to upload</p>
                    )}
                  </div>

                  {/* Delete button */}
                  {uploaded && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteDocument(uploaded) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#E53535', marginLeft: '4px' }}
                      aria-label={`Remove ${docDef.label}`}
                    >
                      <Trash size={16} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Expiry date modal */}
      {pendingExpiry && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px 16px 0 0', padding: '24px 16px', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#1A1F2E' }}>Expiry Date</h3>
            <p style={{ fontSize: '13px', color: '#8492A6', marginBottom: '16px' }}>
              Enter the expiry date for this document (optional).
            </p>
            <input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #E8ECF2', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '16px', backgroundColor: '#fff', color: '#1A1F2E' }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setPendingExpiry(null)}
                style={{ flex: 1, padding: '12px', border: '1px solid #E8ECF2', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff', cursor: 'pointer', color: '#1A1F2E' }}
              >
                Cancel
              </button>
              <button
                onClick={handleExpiryConfirm}
                style={{ flex: 2, padding: '12px', backgroundColor: '#4A6CF7', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, UploadSimple, FilePdf, Image, Trash, CheckCircle, Clock, Plus, PencilSimple, CalendarBlank } from '@phosphor-icons/react'
import { dataStore } from '@/lib/data-store'
import { supabase } from '@/lib/supabase-client'
import { calculateCredibility } from '@/lib/credibility'
import { toast } from 'sonner'
import type { BusinessDocument } from '@/lib/types'

const DOCUMENT_TYPES: { type: string; label: string }[] = [
  { type: 'msme_udyam', label: 'MSME / Udyam Certificate' },
  { type: 'trade_licence', label: 'Trade Licence' },
  { type: 'fssai_licence', label: 'FSSAI Licence' },
  { type: 'pan_card', label: 'PAN Card' },
  { type: 'other', label: 'Other Document' },
]

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function dateInputFromMs(ms: number): string {
  const d = new Date(ms)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface Props {
  currentBusinessId: string
  onBack: () => void
}

type BottomSheetMode =
  | { mode: 'upload'; docType: string; prefilledName: string; file: File }
  | { mode: 'add-document' }
  | { mode: 'add-document-file'; customName: string; file: File }
  | { mode: 'edit'; doc: BusinessDocument }

export function ManageDocumentsScreen({ currentBusinessId, onBack }: Props) {
  const [documents, setDocuments] = useState<BusinessDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingType, setUploadingType] = useState<string | null>(null)
  const [bottomSheet, setBottomSheet] = useState<BottomSheetMode | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [sheetExpiry, setSheetExpiry] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addDocFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    dataStore.getDocumentsByBusinessId(currentBusinessId)
      .then(docs => { setDocuments(docs); setLoading(false) })
      .catch(() => setLoading(false))
  }, [currentBusinessId])

  // --- Preset document slot tap ---
  const handleDocumentRowTap = (docType: string, label: string) => {
    const existing = documents.find(d => d.documentType === docType)
    if (existing) return

    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('data-doc-type', docType)
      fileInputRef.current.setAttribute('data-doc-label', label)
      fileInputRef.current.click()
    }
  }

  // --- File selected for a preset slot ---
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const docType = fileInputRef.current?.getAttribute('data-doc-type') || 'other'
    const docLabel = fileInputRef.current?.getAttribute('data-doc-label') || 'Other Document'

    if (!validateFile(file)) return

    setSheetName(docLabel)
    setSheetExpiry('')
    setBottomSheet({ mode: 'upload', docType, prefilledName: docLabel, file })
  }

  // --- "Add Document" flow ---
  const handleAddDocumentTap = () => {
    setSheetName('')
    setSheetExpiry('')
    setBottomSheet({ mode: 'add-document' })
  }

  const handleAddDocNameConfirm = () => {
    if (!sheetName.trim()) {
      toast.error('Please enter a document name')
      return
    }
    if (addDocFileRef.current) {
      addDocFileRef.current.click()
    }
  }

  const handleAddDocFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!validateFile(file)) return

    const customName = sheetName.trim()
    setBottomSheet({ mode: 'add-document-file', customName, file })
  }

  // --- Validation ---
  function validateFile(file: File): boolean {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB')
      return false
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(file.type)) {
      toast.error('Only PDF, JPG, or PNG files allowed')
      return false
    }
    return true
  }

  // --- Upload ---
  const handleUploadConfirm = async () => {
    if (!bottomSheet) return
    if (bottomSheet.mode === 'add-document') return

    const displayName = sheetName.trim()
    if (!displayName) {
      toast.error('Please enter a document name')
      return
    }

    let docType: string
    let file: File

    if (bottomSheet.mode === 'upload') {
      docType = bottomSheet.docType
      file = bottomSheet.file
    } else if (bottomSheet.mode === 'add-document-file') {
      docType = 'other'
      file = bottomSheet.file
    } else {
      return
    }

    setBottomSheet(null)
    setUploadingType(docType + '_' + Date.now()) // unique key for custom docs

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
        displayName,
        fileName: file.name,
        fileUrl: publicUrl,
        fileSizeBytes: file.size,
        mimeType: file.type,
        expiryDate: sheetExpiry || undefined,
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

  // --- Edit existing document ---
  const handleEditTap = (doc: BusinessDocument) => {
    setSheetName(doc.displayName || '')
    setSheetExpiry(doc.expiresAt ? dateInputFromMs(doc.expiresAt) : '')
    setBottomSheet({ mode: 'edit', doc })
  }

  const handleEditConfirm = async () => {
    if (!bottomSheet || bottomSheet.mode !== 'edit') return
    const { doc } = bottomSheet

    const displayName = sheetName.trim()
    if (!displayName) {
      toast.error('Please enter a document name')
      return
    }

    setBottomSheet(null)

    try {
      const updated = await dataStore.updateBusinessDocument(doc.id, {
        displayName,
        expiryDate: sheetExpiry || null,
      })
      setDocuments(prev => prev.map(d => d.id === doc.id ? updated : d))
      toast.success('Document updated')
    } catch (err) {
      console.error('Update error:', err)
      toast.error('Failed to update document')
    }
  }

  // --- Delete ---
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

  // --- Expiry display helpers ---
  function getExpiryDisplay(doc: BusinessDocument): { text: string; color: string } | null {
    if (!doc.expiresAt) return null
    const expiryMs = doc.expiresAt
    const now = Date.now()
    if (expiryMs > now) {
      return { text: `Valid until ${formatDate(expiryMs)}`, color: '#16A34A' }
    } else {
      return { text: `Expired ${formatDate(expiryMs)}`, color: '#E53535' }
    }
  }

  // --- Get custom (extra) documents not matching preset types ---
  const presetTypes = DOCUMENT_TYPES.map(d => d.type)
  const customDocuments = documents.filter(d => {
    // A document is "custom" if it's type 'other' but not the first 'other' matched by preset
    if (d.documentType === 'other') {
      const presetOtherDoc = documents.find(doc => doc.documentType === 'other')
      return d.id !== presetOtherDoc?.id
    }
    return !presetTypes.includes(d.documentType)
  })

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#F2F4F8', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
      <input
        ref={addDocFileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={handleAddDocFileSelected}
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
          Upload compliance documents to build trade protection and let connections verify your business.
        </p>

        {loading ? (
          <p style={{ fontSize: '14px', color: '#8492A6', textAlign: 'center', marginTop: '40px' }}>Loading…</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRadius: '14px', overflow: 'hidden', border: '1px solid #E8ECF2', backgroundColor: '#fff' }}>
              {DOCUMENT_TYPES.map((docDef, idx) => {
                const uploaded = documents.find(d => d.documentType === docDef.type)
                const isUploading = uploadingType === docDef.type
                const isLast = idx === DOCUMENT_TYPES.length - 1 && customDocuments.length === 0

                return (
                  <DocumentRow
                    key={docDef.type}
                    label={uploaded?.displayName || docDef.label}
                    uploaded={uploaded}
                    isUploading={isUploading}
                    isLast={isLast}
                    expiryDisplay={uploaded ? getExpiryDisplay(uploaded) : null}
                    onTap={() => !uploaded && !isUploading && handleDocumentRowTap(docDef.type, docDef.label)}
                    onEdit={uploaded ? () => handleEditTap(uploaded) : undefined}
                    onDelete={uploaded ? () => handleDeleteDocument(uploaded) : undefined}
                  />
                )
              })}

              {/* Custom-added documents */}
              {customDocuments.map((doc, idx) => {
                const isLast = idx === customDocuments.length - 1
                return (
                  <DocumentRow
                    key={doc.id}
                    label={doc.displayName || 'Custom Document'}
                    uploaded={doc}
                    isUploading={false}
                    isLast={isLast}
                    expiryDisplay={getExpiryDisplay(doc)}
                    onTap={() => {}}
                    onEdit={() => handleEditTap(doc)}
                    onDelete={() => handleDeleteDocument(doc)}
                  />
                )
              })}
            </div>

            {/* Add Document button */}
            <button
              onClick={handleAddDocumentTap}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '14px 16px',
                marginTop: '12px',
                backgroundColor: '#fff',
                border: '1px dashed #C5CDD8',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: '#4A6CF7',
              }}
            >
              <Plus size={18} weight="bold" />
              Add Document
            </button>
          </>
        )}
      </div>

      {/* Bottom Sheet */}
      {bottomSheet && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setBottomSheet(null) }}
        >
          <div style={{
            backgroundColor: '#fff', borderRadius: '16px 16px 0 0', padding: '24px 16px',
            width: '100%', maxWidth: '480px',
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          }}>
            {bottomSheet.mode === 'add-document' ? (
              /* Step 1 of Add Document: name input */
              <>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#1A1F2E' }}>Add Document</h3>

                <label style={{ fontSize: '13px', fontWeight: 500, color: '#4A5568', marginBottom: '6px', display: 'block' }}>
                  Document Name
                </label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={e => setSheetName(e.target.value)}
                  placeholder="e.g. Drug Licence, ISO Certificate"
                  autoFocus
                  style={inputStyle}
                />

                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <button onClick={() => setBottomSheet(null)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={handleAddDocNameConfirm} style={primaryBtnStyle}>Select File</button>
                </div>
              </>
            ) : bottomSheet.mode === 'upload' || bottomSheet.mode === 'add-document-file' ? (
              /* Upload sheet: name + expiry + file info */
              <>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#1A1F2E' }}>Upload Document</h3>

                <label style={{ fontSize: '13px', fontWeight: 500, color: '#4A5568', marginBottom: '6px', display: 'block' }}>
                  Document Name
                </label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={e => setSheetName(e.target.value)}
                  placeholder="Enter document name"
                  style={inputStyle}
                />

                <label style={{ fontSize: '13px', fontWeight: 500, color: '#4A5568', marginBottom: '6px', marginTop: '14px', display: 'block' }}>
                  Valid Until (optional)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="date"
                    value={sheetExpiry}
                    onChange={e => setSheetExpiry(e.target.value)}
                    style={{ ...inputStyle, paddingRight: '36px' }}
                  />
                  <CalendarBlank size={16} color="#8492A6" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', marginTop: '14px',
                  backgroundColor: '#F8F9FB', borderRadius: '8px',
                }}>
                  {bottomSheet.mode === 'upload' ? (
                    bottomSheet.file.type.startsWith('image/') ? <Image size={18} color="#8492A6" /> : <FilePdf size={18} color="#8492A6" />
                  ) : (
                    bottomSheet.file.type.startsWith('image/') ? <Image size={18} color="#8492A6" /> : <FilePdf size={18} color="#8492A6" />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', color: '#1A1F2E', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bottomSheet.file.name}
                    </p>
                    <p style={{ fontSize: '12px', color: '#8492A6', margin: 0 }}>
                      {formatFileSize(bottomSheet.file.size)}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <button onClick={() => setBottomSheet(null)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={handleUploadConfirm} style={primaryBtnStyle}>Upload</button>
                </div>
              </>
            ) : bottomSheet.mode === 'edit' ? (
              /* Edit sheet: rename + expiry */
              <>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#1A1F2E' }}>Edit Document</h3>

                <label style={{ fontSize: '13px', fontWeight: 500, color: '#4A5568', marginBottom: '6px', display: 'block' }}>
                  Document Name
                </label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={e => setSheetName(e.target.value)}
                  placeholder="Enter document name"
                  autoFocus
                  style={inputStyle}
                />

                <label style={{ fontSize: '13px', fontWeight: 500, color: '#4A5568', marginBottom: '6px', marginTop: '14px', display: 'block' }}>
                  Valid Until (optional)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="date"
                    value={sheetExpiry}
                    onChange={e => setSheetExpiry(e.target.value)}
                    style={{ ...inputStyle, paddingRight: '36px' }}
                  />
                  <CalendarBlank size={16} color="#8492A6" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <button onClick={() => setBottomSheet(null)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={handleEditConfirm} style={primaryBtnStyle}>Save</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Shared styles ---
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: '14px',
  border: '1px solid #E8ECF2', borderRadius: '8px',
  boxSizing: 'border-box', backgroundColor: '#fff', color: '#1A1F2E',
  outline: 'none',
}

const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '12px', border: '1px solid #E8ECF2', borderRadius: '8px',
  fontSize: '14px', backgroundColor: '#fff', cursor: 'pointer', color: '#1A1F2E',
}

const primaryBtnStyle: React.CSSProperties = {
  flex: 2, padding: '12px', backgroundColor: '#4A6CF7', color: '#fff',
  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
}

// --- DocumentRow component ---
function DocumentRow({
  label,
  uploaded,
  isUploading,
  isLast,
  expiryDisplay,
  onTap,
  onEdit,
  onDelete,
}: {
  label: string
  uploaded?: BusinessDocument
  isUploading: boolean
  isLast: boolean
  expiryDisplay: { text: string; color: string } | null
  onTap: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '14px 16px',
        borderBottom: isLast ? 'none' : '1px solid #F2F4F8',
        cursor: uploaded || isUploading ? 'default' : 'pointer',
      }}
      onClick={() => !uploaded && !isUploading && onTap()}
    >
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: '10px',
        backgroundColor: uploaded ? '#DCFCE7' : '#F3F4F6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginRight: '12px', flexShrink: 0,
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
            {label}
          </span>
        </div>

        {uploaded && (
          <div style={{ marginTop: '3px' }}>
            <p style={{ fontSize: '12px', color: '#8492A6', margin: 0 }}>
              {formatFileSize(uploaded.fileSizeBytes)}
              {expiryDisplay ? (
                <span style={{ color: expiryDisplay.color }}>
                  {' · '}{expiryDisplay.text}
                </span>
              ) : (
                <>{' · '}{formatDate(uploaded.uploadedAt)}</>
              )}
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
          </div>
        )}

        {isUploading && (
          <p style={{ fontSize: '12px', color: '#4A6CF7', marginTop: '3px' }}>Uploading…</p>
        )}

        {!uploaded && !isUploading && (
          <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>Tap to upload</p>
        )}
      </div>

      {/* Edit & Delete buttons */}
      {uploaded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#8492A6' }}
              aria-label="Edit document"
            >
              <PencilSimple size={16} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#E53535' }}
              aria-label="Remove document"
            >
              <Trash size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

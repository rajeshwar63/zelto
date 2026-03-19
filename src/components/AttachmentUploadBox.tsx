import { useRef } from 'react'
import { Paperclip, X, CheckCircle } from '@phosphor-icons/react'

export interface SelectedFile {
  file: File
  previewName: string
  sizeBytes: number
}

type UploadState = 'empty' | 'selected' | 'uploading' | 'uploaded'

interface Props {
  helperText: string
  uploadState: UploadState
  selectedFile: SelectedFile | null
  onFileSelect: (file: File) => void
  onRemove: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentUploadBox({ helperText, uploadState, selectedFile, onFileSelect, onRemove }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleBoxClick = () => {
    if (uploadState === 'empty') {
      fileInputRef.current?.click()
    }
  }

  return (
    <div>
      <div
        onClick={handleBoxClick}
        style={{
          border: `2px dashed ${uploadState === 'empty' ? 'var(--border-light)' : 'var(--brand-primary)'}`,
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: uploadState === 'empty' ? 'var(--bg-screen)' : 'rgba(var(--brand-primary-rgb, 26, 26, 46), 0.04)',
          cursor: uploadState === 'empty' ? 'pointer' : 'default',
          minHeight: '64px',
          transition: 'border-color 0.15s',
        }}
      >
        {uploadState === 'uploading' && (
          <>
            <div
              style={{
                width: '20px',
                height: '20px',
                border: '2px solid var(--border-light)',
                borderTop: '2px solid var(--brand-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
              }}
            />
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Uploading...</p>
          </>
        )}

        {uploadState === 'uploaded' && selectedFile && (
          <>
            <CheckCircle size={20} weight="fill" color="var(--status-delivered, #22C55E)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.previewName}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{formatBytes(selectedFile.sizeBytes)}</p>
            </div>
          </>
        )}

        {uploadState === 'selected' && selectedFile && (
          <>
            <Paperclip size={20} color="var(--brand-primary)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.previewName}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{formatBytes(selectedFile.sizeBytes)}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              style={{ padding: '4px', color: 'var(--text-secondary)', flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          </>
        )}

        {uploadState === 'empty' && (
          <>
            <Paperclip size={20} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>{helperText}</p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelect(file)
          e.target.value = ''
        }}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

import { useState } from 'react'
import { CaretLeft, X } from '@phosphor-icons/react'

interface Props {
  onBack: () => void
  onLogout: () => void
}

export function AccountScreen({ onBack, onLogout }: Props) {
  const [showChangeEmailModal, setShowChangeEmailModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  return (
    <div>
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} className="flex items-center text-foreground hover:text-muted-foreground">
            <CaretLeft size={20} weight="regular" />
          </button>
          <h1 className="text-[17px] text-foreground font-normal flex-1">Account</h1>
        </div>
      </div>

      <div className="px-4 py-4 border-b border-border">
        <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Security</h2>
        <button
          onClick={() => setShowChangeEmailModal(true)}
          className="w-full flex items-center justify-between py-3 border-b border-border hover:bg-muted/30 transition-colors"
        >
          <p className="text-[14px] text-foreground">Change Email</p>
          <span className="text-muted-foreground text-[14px]">›</span>
        </button>
      </div>

      <div className="px-4 py-4 border-b border-border">
        <button
          onClick={onLogout}
          className="w-full text-left py-3"
        >
          <p className="text-[14px]" style={{ color: '#D64545' }}>Log out</p>
        </button>
      </div>

      <div className="px-4 py-4">
        <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Danger Zone</h2>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="w-full flex items-center justify-between py-3 hover:bg-muted/30 transition-colors"
        >
          <p className="text-[14px]" style={{ color: '#D64545' }}>Delete Account</p>
          <span className="text-muted-foreground text-[14px]">›</span>
        </button>
      </div>

      {showChangeEmailModal && (
        <ChangeEmailModal onClose={() => setShowChangeEmailModal(false)} />
      )}

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => {
            setShowDeleteModal(false)
            // TODO: Call account deletion API endpoint when backend is available
          }}
        />
      )}
    </div>
  )
}

function ChangeEmailModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md rounded-t-2xl p-6"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-medium text-foreground">Change Email</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Enter new email address"
          className="w-full border border-border rounded-lg px-3 py-2 text-[14px] text-foreground outline-none focus:ring-1 focus:ring-foreground mb-4"
        />
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-lg bg-foreground text-white text-[14px] font-medium"
        >
          Send OTP
        </button>
      </div>
    </div>
  )
}

function DeleteAccountModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md rounded-t-2xl p-6"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-medium text-foreground">Delete Account</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <p className="text-[14px] text-muted-foreground mb-6">
          This will permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button
          onClick={onConfirm}
          className="w-full py-2.5 rounded-lg text-white text-[14px] font-medium mb-3"
          style={{ backgroundColor: '#D64545' }}
        >
          Delete Account
        </button>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-lg border border-border text-[14px] text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

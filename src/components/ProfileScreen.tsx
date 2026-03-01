import { useEffect, useState, useRef } from 'react'
import { dataStore } from '@/lib/data-store'
import { getAuthSession } from '@/lib/auth'
import type { BusinessEntity, UserAccount } from '@/lib/types'
import { CaretRight, Bell, PencilSimple, Check, X } from '@phosphor-icons/react'
import { SettingsItem } from './SettingsItem'
import { toast } from 'sonner'

interface Props {
  currentBusinessId: string
  onLogout: () => void
  onNavigateToBusinessDetails: () => void
  onNavigateToNotifications: () => void
  onNavigateToNotificationSettings: () => void
  onNavigateToAccount: () => void
  onNavigateToSupport: () => void
}

export function ProfileScreen({ currentBusinessId, onLogout, onNavigateToBusinessDetails, onNavigateToNotifications, onNavigateToNotificationSettings, onNavigateToAccount, onNavigateToSupport }: Props) {
  const [business, setBusiness] = useState<BusinessEntity | null>(null)
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshTimestamp, setRefreshTimestamp] = useState(Date.now())

  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [editedUsername, setEditedUsername] = useState('')
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const usernameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function loadData() {
      const session = await getAuthSession()
      if (!session) return

      const [biz, user, count] = await Promise.all([
        dataStore.getBusinessEntityById(currentBusinessId),
        dataStore.getUserAccountByEmail(session.email),
        dataStore.getUnreadNotificationCountByBusinessId(currentBusinessId),
      ])

      setBusiness(biz || null)
      setUserAccount(user || null)
      setUnreadCount(count)
      setLoading(false)
    }

    loadData()
  }, [currentBusinessId, refreshTimestamp])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setRefreshTimestamp(Date.now())
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    if (isEditingUsername && usernameInputRef.current) {
      usernameInputRef.current.focus()
      usernameInputRef.current.select()
    }
  }, [isEditingUsername])

  const hasBusinessDetails = business && (
    business.gstNumber ||
    business.businessAddress ||
    business.businessType ||
    business.website
  )

  if (loading || !business || !userAccount) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const handleShare = async () => {
    const shareMessage = `Connect with me on Zelto. My Zelto ID is ${business.zeltoId}`

    if (navigator.share) {
      try {
        await navigator.share({
          text: shareMessage,
        })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err)
        }
      }
    } else {
      await navigator.clipboard.writeText(shareMessage)
      alert('Zelto ID copied to clipboard')
    }
  }

  const handleStartEditUsername = () => {
    setEditedUsername(userAccount.username)
    setIsEditingUsername(true)
  }

  const handleCancelEditUsername = () => {
    setIsEditingUsername(false)
    setEditedUsername('')
  }

  const handleSaveUsername = async () => {
    const trimmed = editedUsername.trim()
    if (trimmed.length < 2 || trimmed.length > 50) {
      toast.error('Username must be 2-50 characters')
      return
    }

    if (trimmed === userAccount.username) {
      setIsEditingUsername(false)
      return
    }

    setIsSavingUsername(true)
    try {
      const updated = await dataStore.updateUsername(userAccount.id, trimmed)
      setUserAccount(updated)
      setIsEditingUsername(false)
      toast.success('Saved')
    } catch (err) {
      console.error('Failed to update username:', err)
      toast.error('Failed to update username')
    } finally {
      setIsSavingUsername(false)
    }
  }

  const handleUsernameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveUsername()
    } else if (e.key === 'Escape') {
      handleCancelEditUsername()
    }
  }

  const locationParts = [business.area, business.city].filter(Boolean)
  const locationStr = locationParts.join(', ')

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 className="text-[17px] text-foreground font-normal flex-1">Profile</h1>
          <button
            onClick={onNavigateToNotifications}
            className="relative flex items-center text-foreground hover:text-muted-foreground"
          >
            <Bell size={22} weight="regular" />
            {unreadCount > 0 && (
              <div
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-white text-[10px] font-medium px-1"
                style={{ backgroundColor: '#D64545' }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* User Info Section */}
      <div className="px-4 py-6 border-b border-border">
        <div className="flex items-center gap-2">
          {isEditingUsername ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                ref={usernameInputRef}
                type="text"
                value={editedUsername}
                onChange={(e) => setEditedUsername(e.target.value)}
                onKeyDown={handleUsernameKeyDown}
                disabled={isSavingUsername}
                maxLength={50}
                className="text-[17px] font-medium text-foreground bg-transparent border-b border-foreground outline-none flex-1 min-w-0 py-0.5"
              />
              <button
                onClick={handleSaveUsername}
                disabled={isSavingUsername}
                className="text-foreground hover:text-foreground/70 transition-colors p-1"
              >
                <Check size={18} weight="bold" />
              </button>
              <button
                onClick={handleCancelEditUsername}
                disabled={isSavingUsername}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-[17px] font-medium text-foreground">{userAccount.username}</h1>
              <button
                onClick={handleStartEditUsername}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <PencilSimple size={16} />
              </button>
            </>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground mt-1">{userAccount.email}</p>
      </div>

      {/* Business Section */}
      <div className="px-4 py-4 border-b border-border">
        <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Business
        </h2>
        <h3 className="text-[15px] font-medium text-foreground mb-1">{business.businessName}</h3>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[13px] text-muted-foreground font-mono">{business.zeltoId}</p>
          <button
            onClick={handleShare}
            className="text-[13px] text-foreground hover:text-foreground/70 transition-colors"
          >
            Share
          </button>
        </div>
        {(userAccount.role || locationStr) && (
          <p className="text-[13px] text-muted-foreground">
            {[
              userAccount.role ? userAccount.role.charAt(0).toUpperCase() + userAccount.role.slice(1) : null,
              locationStr,
            ].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Business Details Section */}
      <div className="px-4 py-4 border-b border-border">
        {!hasBusinessDetails ? (
          <button
            onClick={onNavigateToBusinessDetails}
            className="w-full flex items-center justify-between py-2"
          >
            <span className="text-[13px]" style={{ color: '#E8A020' }}>
              Add business details to build credibility
            </span>
            <CaretRight size={16} style={{ color: '#E8A020' }} />
          </button>
        ) : (
          <div>
            <div className="space-y-1 mb-2">
              {business.gstNumber && (
                <p className="text-[12px] text-muted-foreground">GST: {business.gstNumber}</p>
              )}
              {business.businessAddress && (
                <p className="text-[12px] text-muted-foreground">Address: {business.businessAddress}</p>
              )}
              {business.businessType && (
                <p className="text-[12px] text-muted-foreground">Type: {business.businessType}</p>
              )}
              {business.website && (
                <p className="text-[12px] text-muted-foreground">Website: {business.website}</p>
              )}
            </div>
            <button
              onClick={onNavigateToBusinessDetails}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Edit business details
            </button>
          </div>
        )}
      </div>

      {/* Manage Members (owner only) */}
      {userAccount.role === 'owner' && (
        <div className="px-4 py-4 border-b border-border">
          <SettingsItem title="Manage Members" onPress={() => {}} showDivider={false} />
        </div>
      )}

      {/* Settings Section */}
      <div className="px-4 py-4">
        <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Settings
        </h2>
        <div className="divide-y divide-border">
          <SettingsItem title="Notifications" onPress={onNavigateToNotificationSettings} />
          <SettingsItem title="Account" onPress={onNavigateToAccount} />
          <SettingsItem title="Help & Support" onPress={onNavigateToSupport} showDivider={false} />
        </div>
      </div>

      {/* Footer Links */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center justify-center gap-6">
          <a
            href="/privacy"
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Privacy Policy
          </a>
          <span className="text-muted-foreground text-[12px]">·</span>
          <a
            href="/terms"
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Terms of Service
          </a>
        </div>
      </div>

      {/* Logout */}
      <div className="px-4 pb-8 pt-4">
        <button
          onClick={onLogout}
          className="w-full text-center py-3"
        >
          <p className="text-[14px]" style={{ color: '#D64545' }}>Log out</p>
        </button>
      </div>
    </div>
  )
}

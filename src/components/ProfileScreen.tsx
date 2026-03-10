import { useEffect, useState, useRef } from 'react'
import { dataStore } from '@/lib/data-store'
import { CaretRight, Bell, PencilSimple, Check, X } from '@phosphor-icons/react'
import { SettingsItem } from './SettingsItem'
import { CredibilityBadge } from './CredibilityBadge'
import { toast } from 'sonner'
import { useProfileData } from '@/hooks/data/use-business-data'

interface Props {
  currentBusinessId: string
  onLogout: () => void
  onNavigateToBusinessDetails: () => void
  onNavigateToNotifications: () => void
  onNavigateToNotificationSettings: () => void
  onNavigateToAccount: () => void
  onNavigateToSupport: () => void
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

export function ProfileScreen({ currentBusinessId, onLogout, onNavigateToBusinessDetails, onNavigateToNotifications, onNavigateToNotificationSettings, onNavigateToAccount, onNavigateToSupport }: Props) {
  const { data, isInitialLoading: loading, refresh } = useProfileData(currentBusinessId)
  const business = data?.business ?? null
  const userAccount = data?.userAccount ?? null
  const unreadCount = data?.unreadCount ?? 0
  const credibility = data?.credibility ?? null
  const activityCounts = data?.activityCounts ?? null

  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [editedUsername, setEditedUsername] = useState('')
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const usernameInputRef = useRef<HTMLInputElement>(null)


  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void refresh(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [refresh])

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
      <div style={{ backgroundColor: 'var(--bg-screen)', minHeight: '100vh' }}>
        <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4">
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Profile</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
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
      await dataStore.updateUsername(userAccount.id, trimmed)
      void refresh(true)
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

  return (
    <div style={{ backgroundColor: 'var(--bg-screen)', minHeight: '100%' }}>
      {/* Header */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-header)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4">
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', flex: 1 }}>Profile</h1>
          <button
            onClick={onNavigateToNotifications}
            className="relative flex items-center"
            style={{ color: 'var(--text-primary)', minWidth: '44px', minHeight: '44px', justifyContent: 'center' }}
          >
            <Bell size={22} weight="regular" />
            {unreadCount > 0 && (
              <div
                className="absolute -top-1 -right-1 flex items-center justify-center"
                style={{
                  minWidth: '18px',
                  height: '18px',
                  borderRadius: 'var(--radius-badge)',
                  backgroundColor: 'var(--status-overdue)',
                  color: '#FFFFFF',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '0 4px',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Avatar + Business Name Section */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex flex-col items-center mb-4">
          <div
            className="flex items-center justify-center mb-3"
            style={{
              width: '64px',
              height: '64px',
              borderRadius: 'var(--radius-avatar)',
              background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-light))',
              boxShadow: '0 4px 12px rgba(74,108,247,0.3)',
              color: '#FFFFFF',
              fontSize: '22px',
              fontWeight: 700,
            }}
          >
            {getInitials(business.businessName)}
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>{business.businessName}</h2>
          {credibility && credibility.level !== 'none' && (
            <div className="mt-1">
              <CredibilityBadge level={credibility.level} />
            </div>
          )}
        </div>
      </div>

      {/* User Info Card */}
      <div className="px-4 mb-3">
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border-section)' }}>
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
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      backgroundColor: 'transparent',
                      borderBottom: '1px solid var(--brand-primary)',
                      outline: 'none',
                      flex: 1,
                      minWidth: 0,
                      padding: '2px 0',
                    }}
                  />
                  <button
                    onClick={handleSaveUsername}
                    disabled={isSavingUsername}
                    style={{ color: 'var(--brand-primary)', padding: '4px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Check size={18} weight="bold" />
                  </button>
                  <button
                    onClick={handleCancelEditUsername}
                    disabled={isSavingUsername}
                    style={{ color: 'var(--text-muted)', padding: '4px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{userAccount.username}</p>
                  <button
                    onClick={handleStartEditUsername}
                    style={{ color: 'var(--text-muted)', padding: '4px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <PencilSimple size={16} />
                  </button>
                </>
              )}
            </div>
            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>{userAccount.email}</p>
          </div>

          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border-section)' }}>
            <div className="flex items-center gap-2 mb-1">
              <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Zelto ID</p>
            </div>
            <div className="flex items-center gap-2">
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{business.zeltoId}</p>
              <button
                onClick={handleShare}
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-primary)', minHeight: '44px', display: 'flex', alignItems: 'center' }}
              >
                Share
              </button>
            </div>
          </div>

          {activityCounts && (
            <div style={{ padding: '13px 16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                {activityCounts.connectionCount} connection{activityCounts.connectionCount !== 1 ? 's' : ''} · {activityCounts.orderCount} order{activityCounts.orderCount !== 1 ? 's' : ''}
              </p>
              {business.formattedAddress && (
                <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {business.formattedAddress}
                </p>
              )}
              {business.phone && (
                <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {business.phone}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Business Details Card */}
      <div className="px-4 mb-3">
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
          BUSINESS DETAILS
        </p>
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          {!hasBusinessDetails ? (
            <button
              onClick={onNavigateToBusinessDetails}
              className="w-full flex items-center justify-between"
              style={{ padding: '13px 16px', minHeight: '44px' }}
            >
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-dispatched)' }}>
                  Add business details to build credibility
                </span>
                {credibility && (
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: '8px' }}>
                    {credibility.score}/100
                  </span>
                )}
              </div>
              <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
            </button>
          ) : (
            <div style={{ padding: '13px 16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                {business.gstNumber && (
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>GST: {business.gstNumber}</p>
                )}
                {business.businessAddress && (
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Address: {business.businessAddress}</p>
                )}
                {business.businessType && (
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Type: {business.businessType}</p>
                )}
                {business.website && (
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Website: {business.website}</p>
                )}
              </div>
              {credibility && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 overflow-hidden" style={{ height: '6px', backgroundColor: 'var(--border-light)', borderRadius: '3px' }}>
                    <div
                      style={{
                        height: '100%',
                        borderRadius: '3px',
                        width: `${credibility.score}%`,
                        backgroundColor: credibility.level === 'trusted' ? 'var(--status-delivered)'
                          : credibility.level === 'verified' ? 'var(--brand-primary)'
                          : 'var(--status-dispatched)',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>{credibility.score}/100</span>
                </div>
              )}
              <button
                onClick={onNavigateToBusinessDetails}
                style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand-primary)', marginTop: '8px', minHeight: '44px', display: 'flex', alignItems: 'center' }}
              >
                Edit business details
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Card */}
      <div className="px-4 mb-3">
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
          SETTINGS
        </p>
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          <SettingsItem title="Notifications" onPress={onNavigateToNotificationSettings} />
          <SettingsItem title="Account" onPress={onNavigateToAccount} />
          <SettingsItem title="Help & Support" onPress={onNavigateToSupport} showDivider={false} />
        </div>
      </div>

      {/* Footer Links */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid var(--border-light)' }}>
        <div className="flex items-center justify-center gap-6">
          <a
            href="/privacy"
            style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}
          >
            Privacy Policy
          </a>
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>·</span>
          <a
            href="/terms"
            style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}
          >
            Terms of Service
          </a>
        </div>
      </div>

      {/* Logout */}
      <div className="px-4 pb-24 pt-4">
        <button
          onClick={onLogout}
          className="w-full text-center"
          style={{ padding: '13px 16px', minHeight: '44px' }}
        >
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-overdue)' }}>Log out</p>
        </button>
      </div>
    </div>
  )
}

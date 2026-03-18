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
  onNavigateToManageDocuments?: () => void
  onNavigateToSelfTrustProfile?: () => void
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

// Points available for each missing item (for "To improve" list)
const MISSING_ITEM_POINTS: Record<string, number> = {
  'Phone number': 10,
  'GST number': 10,
  'Business address': 10,
  'Map location': 10,
  'Business type': 5,
  'Website': 5,
  'Business description': 5,
  'Active connections': 10,
  'Order history': 10,
  'Upload MSME certificate': 8,
  'Upload trade licence': 7,
}

export function ProfileScreen({ currentBusinessId, onLogout, onNavigateToBusinessDetails, onNavigateToNotifications, onNavigateToNotificationSettings, onNavigateToAccount, onNavigateToSupport, onNavigateToManageDocuments, onNavigateToSelfTrustProfile }: Props) {
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

  const isTrusted = credibility && credibility.score >= 70
  const missingItemsWithPoints = (credibility?.missingItems ?? [])
    .filter(item => MISSING_ITEM_POINTS[item] !== undefined)
    .map(item => ({ label: item, points: MISSING_ITEM_POINTS[item] }))

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

      {/* Your Trust Profile Card */}
      {credibility && (
        <div className="px-4 mb-3">
          <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-light)' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              YOUR TRUST PROFILE
            </p>

            {/* Score + bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    borderRadius: '3px',
                    width: `${credibility.score}%`,
                    background: 'linear-gradient(90deg, #4A6CF7, #22B573)',
                    transition: 'width 0.5s',
                  }}
                />
              </div>
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
                {credibility.score} / 100
              </span>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <CredibilityBadge level={credibility.level} />
            </div>

            {isTrusted ? (
              /* State B — complete */
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  Your profile is complete. Other businesses can verify you with confidence.
                </p>
                {onNavigateToSelfTrustProfile && (
                  <button
                    onClick={onNavigateToSelfTrustProfile}
                    style={{ width: '100%', padding: '12px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
                  >
                    Preview My Trust Profile →
                  </button>
                )}
              </div>
            ) : (
              /* State A — incomplete */
              <div>
                {/* Completed items */}
                {credibility.completedItems.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                    {credibility.completedItems.slice(0, 6).map(item => (
                      <span
                        key={item}
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: '#16A34A',
                          backgroundColor: '#DCFCE7',
                          padding: '2px 8px',
                          borderRadius: '100px',
                        }}
                      >
                        ✓ {item}
                      </span>
                    ))}
                  </div>
                )}

                {/* To improve */}
                {missingItemsWithPoints.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      To improve:
                    </p>
                    {missingItemsWithPoints.slice(0, 4).map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px', paddingBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>○ {item.label}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand-primary)' }}>+{item.points} pts</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={onNavigateToBusinessDetails}
                  style={{ width: '100%', padding: '12px', backgroundColor: 'var(--brand-primary)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
                >
                  Complete Your Profile →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Business Details Card */}
      <div className="px-4 mb-3">
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
          BUSINESS
        </p>
        <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          {!hasBusinessDetails ? (
            <button
              onClick={onNavigateToBusinessDetails}
              className="w-full flex items-center justify-between"
              style={{ padding: '13px 16px', minHeight: '44px' }}
            >
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-dispatched)' }}>
                Edit Business Details →
              </span>
              <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
            </button>
          ) : (
            <div>
              <button
                onClick={onNavigateToBusinessDetails}
                className="w-full flex items-center justify-between"
                style={{ padding: '13px 16px', minHeight: '44px', borderBottom: '1px solid var(--border-section)' }}
              >
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{business.businessName}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: '1px' }}>{business.zeltoId}</p>
                </div>
                <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
              </button>

              <button
                onClick={onNavigateToBusinessDetails}
                className="w-full flex items-center justify-between"
                style={{ padding: '13px 16px', minHeight: '44px', borderBottom: '1px solid var(--border-section)' }}
              >
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Edit Business Details</span>
                <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
              </button>

              <button
                onClick={onNavigateToManageDocuments}
                className="w-full flex items-center justify-between"
                style={{ padding: '13px 16px', minHeight: '44px', borderBottom: '1px solid var(--border-section)' }}
              >
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Manage Documents</span>
                <CaretRight size={16} style={{ color: 'var(--text-muted)' }} />
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

/**
 * ProfileScreen — revamped per spec section 3.
 *
 * Layout (top to bottom):
 *   - Dark header (#0F1320) with "Profile" title and bell icon
 *   - Hero card (dark, business info + trust badge + zelto code + share)
 *   - Trust Profile CTA card (blue gradient border)
 *   - YOU section (username + email)
 *   - BUSINESS section (Business details + Members rows)
 *   - SETTINGS section
 *   - Footer + Logout
 *
 * Removed per spec:
 *   - Credibility progress bar (score/100)
 *   - Inline credibility badge from profile
 *   - "Add business details to build credibility" CTA
 *   - Inline business details card
 */

import { useEffect, useState, useRef } from 'react'
import { dataStore } from '@/lib/data-store'
import { Bell, PencilSimple, Check, X, CaretRight, ShareNetwork, ShieldCheck, Users, Warning } from '@phosphor-icons/react'
import { TrustBadge } from './TrustBadge'
import { toast } from 'sonner'
import { useProfileData } from '@/hooks/data/use-business-data'
import type { UserAccount } from '@/lib/types'

interface Props {
  currentBusinessId: string
  onLogout: () => void
  onNavigateToNotifications: () => void
  onNavigateToNotificationSettings: () => void
  onNavigateToAccount: () => void
  onNavigateToSupport: () => void
  onNavigateToManageDocuments?: () => void
  onNavigateToSelfTrustProfile?: () => void
  onNavigateToMembers?: () => void
  onNavigateToTeam?: () => void
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: '11px',
      fontWeight: 700,
      color: '#8492A6',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: '8px',
      paddingLeft: '4px',
    }}>
      {children}
    </p>
  )
}

interface RowProps {
  icon: React.ReactNode
  iconBg: string
  title: string
  subtitle?: string
  onPress?: () => void
  showDivider?: boolean
  badge?: React.ReactNode
}

function MenuRow({ icon, iconBg, title, subtitle, onPress, showDivider = true, badge }: RowProps) {
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-3 text-left"
      style={{
        padding: '12px 16px',
        minHeight: '52px',
        borderBottom: showDivider ? '1px solid var(--border-section)' : 'none',
        background: 'none',
        cursor: onPress ? 'pointer' : 'default',
      }}
    >
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '10px',
        backgroundColor: iconBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>{title}</p>
        {subtitle && (
          <p style={{ fontSize: '11px', fontWeight: 500, color: '#8492A6', marginTop: '1px' }}>{subtitle}</p>
        )}
      </div>
      {badge && <div style={{ marginRight: '4px' }}>{badge}</div>}
      {onPress && <CaretRight size={16} color="#8492A6" />}
    </button>
  )
}

export function ProfileScreen({
  currentBusinessId,
  onLogout,
  onNavigateToNotifications,
  onNavigateToNotificationSettings,
  onNavigateToAccount,
  onNavigateToSupport,
  onNavigateToSelfTrustProfile,
  onNavigateToMembers,
  onNavigateToTeam,
}: Props) {
  const { data, isInitialLoading: loading, refresh } = useProfileData(currentBusinessId)
  const business = data?.business ?? null
  const userAccount = data?.userAccount ?? null
  const unreadCount = data?.unreadCount ?? 0
  const credibility = data?.credibility ?? null

  const [members, setMembers] = useState<UserAccount[]>([])
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [editedUsername, setEditedUsername] = useState('')
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const usernameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    dataStore.getUserAccountsByBusinessId(currentBusinessId)
      .then(setMembers)
      .catch(() => {})
  }, [currentBusinessId])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void refresh(true)
        dataStore.getUserAccountsByBusinessId(currentBusinessId).then(setMembers).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [refresh, currentBusinessId])

  useEffect(() => {
    if (isEditingUsername && usernameInputRef.current) {
      usernameInputRef.current.focus()
      usernameInputRef.current.select()
    }
  }, [isEditingUsername])

  if (loading || !business || !userAccount) {
    return (
      <div style={{ backgroundColor: '#F2F4F8', minHeight: '100vh' }}>
        <div className="sticky top-0 z-10" style={{ backgroundColor: '#0F1320', paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="h-11 flex items-center px-4">
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>Profile</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#8492A6' }}>Loading...</p>
        </div>
      </div>
    )
  }

  const handleShare = async () => {
    const shareMessage = `${business.businessName} is on Zelto — view their Trust Profile: zeltoapp.com/trust/${business.zeltoId}`
    const shareUrl = `https://zeltoapp.com/trust/${business.zeltoId}`

    if (navigator.share) {
      try {
        await navigator.share({ text: shareMessage, url: shareUrl })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err)
        }
      }
    } else {
      await navigator.clipboard.writeText(shareMessage)
      toast.success('Link copied to clipboard')
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
    if (e.key === 'Enter') { e.preventDefault(); handleSaveUsername() }
    else if (e.key === 'Escape') { handleCancelEditUsername() }
  }

  // Doc alert logic
  const now = Date.now()
  const thirtyDays = 30 * 24 * 60 * 60 * 1000

  // Compute expiring/expired doc count from credibility missing items as a proxy
  // (actual doc expiry will come from business_documents once that table is live)
  const hasDocWarning = false // placeholder — will be driven by business_documents query
  const docWarningText = '' // placeholder

  const businessTypeAndCity = [business.businessType, business.city].filter(Boolean).join(' · ')

  return (
    <div style={{ backgroundColor: '#F2F4F8', minHeight: '100%', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── HEADER ── */}
      <div style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingTop: 'env(safe-area-inset-top)' }}>

        {/* Title bar */}
        <div className="flex items-center px-4" style={{ height: '44px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0F1320', letterSpacing: '-0.02em', flex: 1 }}>
            Profile
          </h1>
          <button
            onClick={onNavigateToNotifications}
            className="relative flex items-center justify-center"
            style={{ color: '#0F1320', minWidth: '44px', minHeight: '44px' }}
          >
            <Bell size={22} weight="regular" />
            {unreadCount > 0 && (
              <div
                className="absolute flex items-center justify-center"
                style={{
                  top: '2px',
                  right: '2px',
                  minWidth: '16px',
                  height: '16px',
                  borderRadius: '100px',
                  backgroundColor: '#E53535',
                  color: '#FFFFFF',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '0 3px',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </button>
        </div>

        {/* ── HERO CARD ── */}
        <div className="px-4 pb-3">
          <div style={{
            backgroundColor: '#F7F8FA',
            border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: '18px',
            padding: '14px',
          }}>
            {/* Avatar + business info */}
            <div className="flex items-start gap-3 mb-3">
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #4A6CF7, #6B8AFF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#FFFFFF',
                fontSize: '18px',
                fontWeight: 700,
              }}>
                {getInitials(business.businessName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#0F1320', lineHeight: '1.2' }}>
                  {business.businessName}
                </p>
                {businessTypeAndCity && (
                  <p style={{ fontSize: '12px', color: '#8492A6', marginTop: '2px' }}>
                    {businessTypeAndCity}
                  </p>
                )}
                {credibility && credibility.level !== 'none' && (
                  <div style={{ marginTop: '6px' }}>
                    <TrustBadge level={credibility.level} variant="light" />
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.07)', marginBottom: '12px' }} />

            {/* Zelto code + share */}
            <div className="flex items-center justify-between">
              <span style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '11px',
                color: '#B0BAC9',
                letterSpacing: '0.05em',
              }}>
                {business.zeltoId}
              </span>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#4A6CF7',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(74,108,247,0.08)',
                  border: '1px solid rgba(74,108,247,0.2)',
                  minHeight: '32px',
                }}
              >
                <ShareNetwork size={14} />
                Share
              </button>
            </div>
          </div>
        </div>

        {/* ── TRUST PROFILE CTA ── */}
        <div className="px-4 pb-4">
          <button
            onClick={onNavigateToSelfTrustProfile}
            className="w-full flex items-center gap-3 text-left"
            style={{
              backgroundColor: 'rgba(74,108,247,0.06)',
              border: '1px solid rgba(74,108,247,0.2)',
              borderRadius: '14px',
              padding: '12px 14px',
              minHeight: '60px',
            }}
          >
            {/* Shield icon */}
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(74,108,247,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ShieldCheck size={18} color="#7B8FF7" weight="fill" />
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#0F1320' }}>
                Your Trust Profile
              </p>
              <p style={{ fontSize: '11px', color: '#8492A6', marginTop: '1px' }}>
                Identity · Compliance docs
              </p>
              {hasDocWarning && (
                <div className="flex items-center gap-1 mt-1.5">
                  <Warning size={12} color="#E67E00" />
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#E67E00',
                    backgroundColor: 'rgba(230,126,0,0.2)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}>
                    {docWarningText}
                  </span>
                </div>
              )}
            </div>

            <CaretRight size={16} color="#B0BAC9" />
          </button>
        </div>
      </div>

      {/* ── GREY BACKGROUND CONTENT ── */}
      <div style={{ padding: '20px 16px 0' }}>

        {/* YOU section */}
        <SectionLabel>YOU</SectionLabel>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ padding: '13px 16px' }}>
            <div className="flex items-center gap-3">
              {/* User avatar */}
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                backgroundColor: '#F2F4F8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#8492A6' }}>
                  {userAccount.username.slice(0, 2).toUpperCase()}
                </span>
              </div>

              {/* Username (editable) */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditingUsername ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={usernameInputRef}
                      type="text"
                      value={editedUsername}
                      onChange={(e) => setEditedUsername(e.target.value)}
                      onKeyDown={handleUsernameKeyDown}
                      disabled={isSavingUsername}
                      maxLength={50}
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#1A1F2E',
                        backgroundColor: 'transparent',
                        borderBottom: '1px solid #4A6CF7',
                        outline: 'none',
                        flex: 1,
                        minWidth: 0,
                        padding: '2px 0',
                      }}
                    />
                    <button
                      onClick={handleSaveUsername}
                      disabled={isSavingUsername}
                      style={{ color: '#4A6CF7', padding: '4px', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Check size={16} weight="bold" />
                    </button>
                    <button
                      onClick={handleCancelEditUsername}
                      disabled={isSavingUsername}
                      style={{ color: '#8492A6', padding: '4px', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>
                        {userAccount.username}
                      </p>
                      <p style={{ fontSize: '11px', fontWeight: 500, color: '#8492A6', marginTop: '1px' }}>
                        {userAccount.email}
                      </p>
                    </div>
                    <button
                      onClick={handleStartEditUsername}
                      style={{ color: '#8492A6', padding: '6px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <PencilSimple size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BUSINESS section */}
        <SectionLabel>BUSINESS</SectionLabel>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
          <MenuRow
            icon={<Users size={18} color="#4A6CF7" weight="bold" />}
            iconBg="#EEF0FF"
            title="Team"
            subtitle={
              members.length === 0
                ? 'No members yet'
                : members.length === 1
                  ? '1 member'
                  : `${members.length} members`
            }
            onPress={onNavigateToTeam}
            showDivider={false}
          />
        </div>

        {/* SETTINGS section */}
        <SectionLabel>SETTINGS</SectionLabel>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
          <MenuRow
            icon={<Bell size={18} color="#E67E00" weight="bold" />}
            iconBg="#FFF4E0"
            title="Notifications"
            onPress={onNavigateToNotificationSettings}
          />
          <MenuRow
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" fill="#4A6CF7"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="#4A6CF7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            iconBg="#EEF0FF"
            title="Account"
            onPress={onNavigateToAccount}
          />
          <MenuRow
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="#8492A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            iconBg="#F2F4F8"
            title="Help & Support"
            onPress={onNavigateToSupport}
            showDivider={false}
          />
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-6 py-4">
          <a href="/privacy" style={{ fontSize: '12px', fontWeight: 500, color: '#8492A6' }}>
            Privacy Policy
          </a>
          <span style={{ color: '#8492A6', fontSize: '12px' }}>·</span>
          <a href="/terms" style={{ fontSize: '12px', fontWeight: 500, color: '#8492A6' }}>
            Terms of Service
          </a>
        </div>

        {/* Logout button */}
        <div style={{ paddingBottom: '100px' }}>
          <button
            onClick={onLogout}
            className="w-full"
            style={{
              padding: '13px 16px',
              minHeight: '48px',
              backgroundColor: '#E53535',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Log out</p>
          </button>
        </div>
      </div>
    </div>
  )
}

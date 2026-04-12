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
import { Bell, PencilSimple, Check, X, CaretRight, ShareNetwork, ShieldCheck, Users, Receipt } from '@phosphor-icons/react'
import { TrustBadge } from './TrustBadge'
import { toast } from 'sonner'
import { useProfileData } from '@/hooks/data/use-business-data'
import { computeTrustScore } from '@/lib/trust-score'
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
  onNavigateToInvoiceSettings?: () => void
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
  onNavigateToInvoiceSettings,
}: Props) {
  const { data, isInitialLoading: loading, refresh } = useProfileData(currentBusinessId)
  const business = data?.business ?? null
  const userAccount = data?.userAccount ?? null
  const unreadCount = data?.unreadCount ?? 0
  const credibility = data?.credibility ?? null
  const activityCounts = data?.activityCounts ?? null

  const [members, setMembers] = useState<UserAccount[]>([])
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [editedUsername, setEditedUsername] = useState('')
  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const usernameInputRef = useRef<HTMLInputElement>(null)
  const [trustNudgeText, setTrustNudgeText] = useState('View your trust profile')
  const [trustScorePotential, setTrustScorePotential] = useState(0)

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

  useEffect(() => {
    if (!currentBusinessId) return
    let cancelled = false

    computeTrustScore(currentBusinessId).then(breakdown => {
      if (cancelled) return
      setTrustNudgeText(breakdown.nudgeText)
      const current = breakdown.total
      let target = 100
      if (current < 20) target = 20
      else if (current < 45) target = 45
      else if (current < 70) target = 70

      setTrustScorePotential(Math.min(target - current, 50))
    }).catch(() => {
      // Silently fail — CTA still renders with default text
    })

    return () => { cancelled = true }
  }, [currentBusinessId])

  if (loading || !business || !userAccount) {
    return (
      <div style={{ backgroundColor: '#F2F4F8', minHeight: '100vh' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px 12px',
          paddingTop: 'max(16px, env(safe-area-inset-top))',
        }}>
          <span style={{ color: '#0F1320', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>
            Profile
          </span>
        </div>
        <div className="flex items-center justify-center py-16">
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#8492A6' }}>Loading...</p>
        </div>
      </div>
    )
  }

  const handleShare = async () => {
    const shareMessage = `Connect with ${business.businessName} on Zelto — ID: ${business.zeltoId}`

    if (navigator.share) {
      try {
        await navigator.share({ text: shareMessage })
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

  const businessTypeAndCity = [business.businessType, business.city].filter(Boolean).join(' · ')

  return (
    <div style={{ backgroundColor: '#F2F4F8', minHeight: '100%', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── LIGHT TOP BAR ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px 12px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
      }}>
        <span style={{ color: '#0F1320', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>
          Profile
        </span>
        <button
          onClick={onNavigateToNotifications}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '12px',
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <Bell size={18} color="#0F1320" weight="bold" />
          {unreadCount > 0 && (
            <div style={{
              position: 'absolute',
              top: '5px',
              right: '5px',
              width: '8px',
              height: '8px',
              borderRadius: '4px',
              backgroundColor: '#E53535',
              border: '2px solid #FFFFFF',
            }} />
          )}
        </button>
      </div>

      {/* ── DARK BUSINESS CARD ── */}
      <div style={{ padding: '0 14px 16px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #0F1320 0%, #1A2140 100%)',
          borderRadius: '20px',
          padding: '20px 18px 16px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Subtle dot pattern */}
          <div style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.03,
            backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }} />

          <div style={{ position: 'relative' }}>
            {/* Business name + badge */}
            <div className="flex items-start gap-3.5 mb-3.5">
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '15px',
                background: 'linear-gradient(135deg, #4A6CF7, #6B8AFF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 700,
                color: '#FFFFFF',
                flexShrink: 0,
                boxShadow: '0 4px 16px rgba(74,108,247,0.3)',
              }}>
                {getInitials(business.businessName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ color: '#FFFFFF', fontSize: '17px', fontWeight: 600 }}>
                    {business.businessName}
                  </span>
                  {credibility && credibility.level !== 'none' && (
                    <TrustBadge level={credibility.level} size="sm" />
                  )}
                </div>
                {businessTypeAndCity && (
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginTop: '3px' }}>
                    {businessTypeAndCity}
                  </p>
                )}
              </div>
            </div>

            {/* Zelto ID — Prominent Identity Row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(74,108,247,0.1)',
              border: '1px solid rgba(74,108,247,0.18)',
              borderRadius: '10px',
              padding: '9px 12px',
              marginBottom: '14px',
            }}>
              <span style={{
                fontFamily: '"DM Mono", "JetBrains Mono", "SF Mono", monospace',
                fontSize: '14px',
                fontWeight: 600,
                color: '#FFFFFF',
                letterSpacing: '0.1em',
              }}>
                {business.zeltoId}
              </span>
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '7px',
                  padding: '5px 12px',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <ShareNetwork size={12} />
                Share
              </button>
            </div>

            {/* Stats Row */}
            <div style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {[
                { val: activityCounts?.connectionCount ?? 0, label: 'connections' },
                { val: activityCounts?.orderCount ?? 0, label: 'orders' },
                { val: credibility?.score ?? 0, label: 'trust score', sub: '/100', highlight: true },
              ].map((s, i) => (
                <div key={s.label} style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 0',
                  borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}>
                  <p style={{
                    color: s.highlight ? '#6B8AFF' : '#FFFFFF',
                    fontSize: '18px',
                    fontWeight: 600,
                    margin: 0,
                    lineHeight: 1,
                  }}>
                    {s.val}
                    {s.sub && (
                      <span style={{ fontSize: '11px', fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}>
                        {s.sub}
                      </span>
                    )}
                  </p>
                  <p style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '10px',
                    margin: '3px 0 0',
                    letterSpacing: '0.02em',
                  }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── TRUST SCORE CTA ── */}
      <div className="px-4 pb-4">
        <button
          onClick={onNavigateToSelfTrustProfile}
          className="w-full text-left"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1.5px solid rgba(74,108,247,0.15)',
            padding: '16px',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle radial glow */}
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '120px',
            height: '120px',
            background: 'radial-gradient(circle at 100% 0%, rgba(74,108,247,0.06) 0%, transparent 70%)',
          }} />

          <div className="flex items-center gap-3 mb-2.5">
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(74,108,247,0.12), rgba(74,108,247,0.04))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ShieldCheck size={20} color="#4A6CF7" weight="fill" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#0F1320', margin: 0, lineHeight: 1.2 }}>
                Improve your trust score
              </p>
              <p style={{ fontSize: '12px', color: '#8492A6', margin: '2px 0 0' }}>
                {trustNudgeText}
              </p>
            </div>
            {trustScorePotential > 0 && (
              <div style={{
                background: 'rgba(34,181,115,0.08)',
                border: '1px solid rgba(34,181,115,0.15)',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#22B573',
                flexShrink: 0,
              }}>
                +{trustScorePotential} pts
              </div>
            )}
          </div>

          {/* Mini progress bar */}
          <div className="flex items-center gap-2">
            <div style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: '#F2F4F8', overflow: 'hidden' }}>
              <div style={{
                width: `${credibility?.score ?? 0}%`,
                height: '100%',
                borderRadius: '2px',
                background: 'linear-gradient(90deg, #4A6CF7, #6B8AFF)',
              }} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#4A6CF7' }}>
              {credibility?.score ?? 0}
            </span>
            <span style={{ fontSize: '11px', color: '#8492A6' }}>/100</span>
          </div>
        </button>
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
          />
          <MenuRow
            icon={<Receipt size={18} color="#22C55E" weight="bold" />}
            iconBg="#ECFDF5"
            title="Invoice settings"
            subtitle="Items, bank details, numbering"
            onPress={onNavigateToInvoiceSettings}
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

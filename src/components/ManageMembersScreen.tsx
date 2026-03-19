import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { getAuthSession } from '@/lib/auth'
import type { UserAccount } from '@/lib/types'
import { toast } from 'sonner'
import { ArrowLeft, Link, UserMinus } from '@phosphor-icons/react'

interface Props {
  currentBusinessId: string
  onBack: () => void
}

const INVITE_BASE_URL = 'https://zeltoapp.com/join'

export function ManageMembersScreen({ currentBusinessId, onBack }: Props) {
  const [members, setMembers] = useState<UserAccount[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<UserAccount | null>(null)

  useEffect(() => {
    async function load() {
      const session = await getAuthSession()
      if (!session) return

      const [membersList, currentUser] = await Promise.all([
        dataStore.getUserAccountsByBusinessId(currentBusinessId),
        dataStore.getUserAccountByEmail(session.email),
      ])

      setMembers(membersList)

      if (currentUser) {
        setCurrentUserId(currentUser.id)
        setCurrentUserRole(currentUser.role)

        if (currentUser.role === 'owner') {
          try {
            const token = await dataStore.getOrCreateMemberInvite(
              currentBusinessId,
              currentUser.id
            )
            setInviteToken(token)
          } catch {
            // Non-fatal
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [currentBusinessId])

  const inviteLink = inviteToken ? `${INVITE_BASE_URL}/${inviteToken}` : null
  const isOwner = currentUserRole === 'owner'

  const handleShareInvite = async () => {
    if (!inviteLink) return
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join my business on Zelto',
          text: 'Use this link to join my team on Zelto:',
          url: inviteLink,
        })
      } else {
        await navigator.clipboard.writeText(inviteLink)
        toast.success('Invite link copied!')
      }
    } catch {
      try {
        await navigator.clipboard.writeText(inviteLink)
        toast.success('Invite link copied!')
      } catch {
        toast.error('Could not copy link')
      }
    }
  }

  const handleCopyInvite = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      toast.success('Invite link copied!')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleConfirmRemove = async () => {
    if (!confirmRemoveMember || !currentUserId) return
    setRemovingMemberId(confirmRemoveMember.id)
    setConfirmRemoveMember(null)
    try {
      await dataStore.removeBusinessMember(currentUserId, confirmRemoveMember.id, currentBusinessId)
      setMembers(prev => prev.filter(m => m.id !== confirmRemoveMember.id))
      toast.success(`${confirmRemoveMember.username} removed from team`)
    } catch (err) {
      console.error('Remove member error:', err)
      toast.error('Failed to remove member')
    } finally {
      setRemovingMemberId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#F2F4F8', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
        <div style={{ backgroundColor: '#0F1320', padding: '16px', paddingTop: 'max(16px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} color="#fff" />
          </button>
          <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Members</h1>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: '14px', color: '#8492A6' }}>Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#F2F4F8', zIndex: 50, display: 'flex', flexDirection: 'column' }}>

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
        <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Team Members</h1>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Invite section — owners only */}
        {isOwner && inviteLink && (
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#8492A6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              ADD TEAM MEMBER
            </p>
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '14px',
              padding: '16px',
              border: '1px solid #E8ECF2',
            }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E', marginBottom: '4px' }}>
                Invite via link
              </p>
              <p style={{ fontSize: '12px', color: '#8492A6', marginBottom: '14px' }}>
                Share this link to add someone to your team. The link is valid for 7 days.
              </p>

              {/* Link display */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#F2F4F8',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '12px',
              }}>
                <Link size={13} color="#8492A6" style={{ flexShrink: 0 }} />
                <span style={{
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#1A1F2E',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {inviteLink}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleCopyInvite}
                  style={{
                    flex: 1,
                    padding: '11px',
                    border: '1px solid #E8ECF2',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1A1F2E',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Copy link
                </button>
                <button
                  onClick={handleShareInvite}
                  style={{
                    flex: 1,
                    padding: '11px',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#fff',
                    backgroundColor: '#4A6CF7',
                    cursor: 'pointer',
                  }}
                >
                  Share
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Members list */}
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#8492A6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            ACTIVE MEMBERS ({members.length})
          </p>
          <div style={{ backgroundColor: '#fff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #E8ECF2' }}>
            {members.map((member, idx) => (
              <div
                key={member.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderBottom: idx < members.length - 1 ? '1px solid #F2F4F8' : 'none',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: '10px',
                  backgroundColor: member.role === 'owner' ? '#EEF0FF' : '#F2F4F8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginRight: '12px',
                }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: member.role === 'owner' ? '#4A6CF7' : '#8492A6' }}>
                    {member.username.slice(0, 2).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>
                    {member.username}
                    {member.id === currentUserId && (
                      <span style={{ fontSize: '11px', color: '#8492A6', marginLeft: '6px', fontWeight: 400 }}>(You)</span>
                    )}
                  </p>
                  <p style={{ fontSize: '11px', color: '#8492A6', marginTop: '1px' }}>{member.email}</p>
                </div>

                {/* Role + remove */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: member.role === 'owner' ? '#4A6CF7' : '#8492A6',
                    backgroundColor: member.role === 'owner' ? '#EEF0FF' : '#F2F4F8',
                    padding: '3px 8px',
                    borderRadius: '100px',
                  }}>
                    {member.role === 'owner' ? 'Owner' : 'Member'}
                  </span>

                  {isOwner && member.id !== currentUserId && member.role !== 'owner' && (
                    <button
                      onClick={() => setConfirmRemoveMember(member)}
                      disabled={removingMemberId === member.id}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: removingMemberId === member.id ? 'not-allowed' : 'pointer',
                        padding: '4px',
                        color: removingMemberId === member.id ? '#ccc' : '#E53535',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      aria-label={`Remove ${member.username}`}
                    >
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm remove dialog */}
      {confirmRemoveMember && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px 32px',
            width: '100%',
            maxWidth: '480px',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F2E', marginBottom: '8px' }}>
              Remove {confirmRemoveMember.username}?
            </h3>
            <p style={{ fontSize: '13px', color: '#8492A6', marginBottom: '24px', lineHeight: '1.5' }}>
              They will lose access to this business immediately and will need to be re-invited to rejoin.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setConfirmRemoveMember(null)}
                style={{
                  flex: 1,
                  padding: '13px',
                  border: '1px solid #E8ECF2',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1A1F2E',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemove}
                style={{
                  flex: 1,
                  padding: '13px',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: '#E53535',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

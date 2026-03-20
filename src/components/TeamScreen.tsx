import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { getLocalAuthSessionSync } from '@/lib/auth'
import { useTeamRoleContext } from '@/contexts/TeamRoleContext'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Info } from '@phosphor-icons/react'

interface TeamMember {
  user_account_id: string
  name: string
  email: string
  role: 'admin' | 'member'
  joined_at: string
}

interface PendingInvite {
  id: string
  email: string | null
  invite_type: 'link' | 'email'
  role: 'admin' | 'member'
  created_at: string
}

interface Props {
  currentBusinessId: string
  onBack: () => void
  onNavigateToInvite: () => void
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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

export function TeamScreen({ currentBusinessId, onBack, onNavigateToInvite }: Props) {
  const { isAdmin } = useTeamRoleContext()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [actionSheet, setActionSheet] = useState<TeamMember | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null)
  const [processing, setProcessing] = useState(false)

  const session = getLocalAuthSessionSync()
  const currentUserId = session?.userId

  async function loadData() {
    try {
      // Fetch active members via RPC
      const { data: membersData, error: membersError } = await supabase.rpc('get_team_members')
      if (membersError) throw membersError
      setMembers(membersData || [])

      // Fetch pending invites (admin only)
      if (isAdmin) {
        const { data: invitesData } = await supabase
          .from('business_invites')
          .select('id, email, invite_type, role, created_at, expires_at')
          .eq('business_entity_id', currentBusinessId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })

        // Filter out expired ones
        const now = new Date()
        const pending = (invitesData || []).filter(inv => new Date(inv.expires_at) > now)
        setPendingInvites(pending)
      }
    } catch (err) {
      console.error('Failed to load team data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [currentBusinessId, isAdmin])

  const admins = members.filter(m => m.role === 'admin')
  const membersList = members.filter(m => m.role === 'member')

  const handlePromote = async (member: TeamMember) => {
    setProcessing(true)
    setActionSheet(null)
    try {
      const { error } = await supabase.rpc('promote_to_admin', {
        target_user_account_id: member.user_account_id,
      })
      if (error) throw error
      toast.success(`${member.name} is now an Admin`)
      void loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to promote'
      toast.error(msg)
    } finally {
      setProcessing(false)
    }
  }

  const handleDemote = async (member: TeamMember) => {
    setProcessing(true)
    setActionSheet(null)
    try {
      const { error } = await supabase.rpc('demote_to_member', {
        target_user_account_id: member.user_account_id,
      })
      if (error) {
        if (error.message?.includes('cannot_demote_last_admin') || error.message?.includes('last admin')) {
          toast.error('Cannot demote the last Admin. Promote someone else first.')
        } else {
          throw error
        }
        return
      }
      toast.success(`${member.name} is now a Member`)
      void loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to demote'
      toast.error(msg)
    } finally {
      setProcessing(false)
    }
  }

  const handleRemove = async () => {
    if (!confirmRemove) return
    setProcessing(true)
    setConfirmRemove(null)
    try {
      const { error } = await supabase.rpc('remove_team_member', {
        target_user_account_id: confirmRemove.user_account_id,
      })
      if (error) {
        if (error.message?.includes('cannot_remove_admin')) {
          toast.error('Cannot remove an Admin. Demote them to Member first.')
        } else {
          throw error
        }
        return
      }
      toast.success(`${confirmRemove.name} removed from team`)
      void loadData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member'
      toast.error(msg)
    } finally {
      setProcessing(false)
    }
  }

  const handleMemberTap = (member: TeamMember) => {
    if (!isAdmin) return
    if (member.user_account_id === currentUserId) return
    setActionSheet(member)
  }

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#F2F4F8', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
        <Header onBack={onBack} isAdmin={false} onInvite={() => {}} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: '14px', color: '#8492A6' }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#F2F4F8', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <Header onBack={onBack} isAdmin={isAdmin} onInvite={onNavigateToInvite} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px' }}>

        {/* Member-only info notice */}
        {!isAdmin && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: '#EEF0FF',
            borderRadius: '10px',
            marginBottom: '16px',
          }}>
            <Info size={16} color="#4A6CF7" />
            <p style={{ fontSize: '12px', color: '#4A6CF7', fontWeight: 500 }}>
              Only Admins can manage team members
            </p>
          </div>
        )}

        {/* Admins section */}
        <SectionHeader label="Admins" count={admins.length} />
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #E8ECF2', marginBottom: '16px' }}>
          {admins.map((member, idx) => (
            <MemberRow
              key={member.user_account_id}
              member={member}
              isCurrentUser={member.user_account_id === currentUserId}
              showDivider={idx < admins.length - 1}
              onTap={isAdmin ? () => handleMemberTap(member) : undefined}
            />
          ))}
          {admins.length === 0 && <EmptyRow text="No admins" />}
        </div>

        {/* Members section */}
        <SectionHeader label="Members" count={membersList.length} />
        <div style={{ backgroundColor: '#fff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #E8ECF2', marginBottom: '16px' }}>
          {membersList.map((member, idx) => (
            <MemberRow
              key={member.user_account_id}
              member={member}
              isCurrentUser={member.user_account_id === currentUserId}
              showDivider={idx < membersList.length - 1}
              onTap={isAdmin ? () => handleMemberTap(member) : undefined}
            />
          ))}
          {membersList.length === 0 && <EmptyRow text="No members yet" />}
        </div>

        {/* Pending invites (admin only) */}
        {isAdmin && pendingInvites.length > 0 && (
          <>
            <SectionHeader label="Pending" count={pendingInvites.length} />
            <div style={{ backgroundColor: '#fff', borderRadius: '14px', overflow: 'hidden', border: '1px solid #E8ECF2', marginBottom: '16px' }}>
              {pendingInvites.map((invite, idx) => (
                <div
                  key={invite.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '14px 16px',
                    borderBottom: idx < pendingInvites.length - 1 ? '1px solid #F2F4F8' : 'none',
                  }}
                >
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: '10px',
                    backgroundColor: '#F2F4F8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginRight: '12px',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#B0BAC9' }}>?</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>
                      {invite.invite_type === 'email' && invite.email ? invite.email : 'Invited via link'}
                    </p>
                    <p style={{ fontSize: '11px', color: '#8492A6', marginTop: '1px' }}>
                      {timeAgo(invite.created_at)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#D97706',
                      backgroundColor: '#FFF8ED',
                      padding: '3px 8px',
                      borderRadius: '100px',
                    }}>
                      Pending
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Action sheet for admin actions */}
      {actionSheet && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setActionSheet(null)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '20px 20px 0 0',
              padding: '20px 20px 32px',
              width: '100%',
              maxWidth: '480px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A1F2E', marginBottom: '16px' }}>
              {actionSheet.name}
            </p>

            {actionSheet.role === 'member' && (
              <>
                <ActionButton
                  label="Make Admin"
                  onClick={() => handlePromote(actionSheet)}
                  disabled={processing}
                />
                <ActionButton
                  label="Remove from team"
                  onClick={() => { setActionSheet(null); setConfirmRemove(actionSheet) }}
                  destructive
                  disabled={processing}
                />
              </>
            )}

            {actionSheet.role === 'admin' && (
              <ActionButton
                label="Demote to Member"
                onClick={() => handleDemote(actionSheet)}
                disabled={processing}
              />
            )}

            <button
              onClick={() => setActionSheet(null)}
              style={{
                width: '100%',
                padding: '13px',
                border: '1px solid #E8ECF2',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#8492A6',
                backgroundColor: '#fff',
                cursor: 'pointer',
                marginTop: '8px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirm remove dialog */}
      {confirmRemove && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px 32px',
            width: '100%',
            maxWidth: '480px',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A1F2E', marginBottom: '8px' }}>
              Remove {confirmRemove.name}?
            </h3>
            <p style={{ fontSize: '13px', color: '#8492A6', marginBottom: '24px', lineHeight: '1.5' }}>
              They will lose access to this business immediately and will need to be re-invited to rejoin.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setConfirmRemove(null)}
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
                onClick={handleRemove}
                disabled={processing}
                style={{
                  flex: 1,
                  padding: '13px',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: '#E53535',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  opacity: processing ? 0.6 : 1,
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

function Header({ onBack, isAdmin, onInvite }: { onBack: () => void; isAdmin: boolean; onInvite: () => void }) {
  return (
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
      <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0, flex: 1 }}>Team</h1>
      {isAdmin && (
        <button
          onClick={onInvite}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 14px',
            borderRadius: '100px',
            backgroundColor: '#4A6CF7',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            color: '#fff',
          }}
        >
          <Plus size={14} weight="bold" />
          Invite
        </button>
      )}
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
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
      {label} · {count}
    </p>
  )
}

function MemberRow({ member, isCurrentUser, showDivider, onTap }: {
  member: TeamMember
  isCurrentUser: boolean
  showDivider: boolean
  onTap?: () => void
}) {
  return (
    <button
      onClick={onTap}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '14px 16px',
        borderBottom: showDivider ? '1px solid #F2F4F8' : 'none',
        width: '100%',
        background: 'none',
        border: 'none',
        borderBottomStyle: showDivider ? 'solid' : undefined,
        borderBottomWidth: showDivider ? '1px' : undefined,
        borderBottomColor: showDivider ? '#F2F4F8' : undefined,
        cursor: onTap ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 38,
        height: 38,
        borderRadius: '10px',
        backgroundColor: member.role === 'admin' ? '#EEF0FF' : '#F2F4F8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginRight: '12px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: member.role === 'admin' ? '#4A6CF7' : '#8492A6' }}>
          {getInitials(member.name)}
        </span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1A1F2E' }}>
          {member.name}
          {isCurrentUser && (
            <span style={{ fontSize: '11px', color: '#8492A6', marginLeft: '6px', fontWeight: 400 }}>(you)</span>
          )}
        </p>
        <p style={{ fontSize: '11px', color: '#8492A6', marginTop: '1px' }}>{member.email}</p>
      </div>

      {/* Role badge */}
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        color: member.role === 'admin' ? '#4A6CF7' : '#8492A6',
        backgroundColor: member.role === 'admin' ? '#EEF0FF' : '#F2F4F8',
        padding: '3px 8px',
        borderRadius: '100px',
        flexShrink: 0,
      }}>
        {member.role === 'admin' ? 'Admin' : 'Member'}
      </span>
    </button>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: '20px 16px', textAlign: 'center' }}>
      <p style={{ fontSize: '13px', color: '#B0BAC9' }}>{text}</p>
    </div>
  )
}

function ActionButton({ label, onClick, destructive, disabled }: {
  label: string
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '14px',
        border: 'none',
        borderRadius: '12px',
        fontSize: '14px',
        fontWeight: 600,
        color: destructive ? '#E53535' : '#1A1F2E',
        backgroundColor: destructive ? '#FEF2F2' : '#F2F4F8',
        cursor: disabled ? 'not-allowed' : 'pointer',
        marginBottom: '8px',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}

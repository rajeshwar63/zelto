import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { getAuthSession } from '@/lib/auth'
import type { UserAccount } from '@/lib/types'
import { toast } from 'sonner'
import { Link, Trash } from '@phosphor-icons/react'

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

        // Generate invite link only for owners
        if (currentUser.role === 'owner') {
          try {
            const token = await dataStore.getOrCreateMemberInvite(
              currentBusinessId,
              currentUser.id
            )
            setInviteToken(token)
          } catch {
            // Non-fatal — invite section just won't render
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [currentBusinessId])

  const inviteLink = inviteToken ? `${INVITE_BASE_URL}/${inviteToken}` : null

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

  const isOwner = currentUserRole === 'owner'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </button>
        <h1 className="text-base font-semibold text-foreground">Members</h1>
      </div>

      {/* Invite section — owners only */}
      {isOwner && inviteLink && (
        <div className="px-4 py-4 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Invite team members
          </p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Share this link to add someone to your business. The link is valid for 7 days.
          </p>
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2.5 mb-3">
            <Link size={13} className="text-muted-foreground flex-shrink-0" />
            <span className="text-[12px] font-mono text-foreground flex-1 truncate">
              {inviteLink}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyInvite}
              className="flex-1 text-[13px] font-medium text-foreground bg-muted rounded-lg py-2 text-center transition-colors hover:bg-muted/80"
            >
              Copy link
            </button>
            <button
              onClick={handleShareInvite}
              className="flex-1 text-[13px] font-semibold text-white rounded-lg py-2 text-center transition-colors"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Share
            </button>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="px-4 py-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Active Members ({members.length})
        </p>
        <div className="space-y-1">
          {members.map(member => (
            <div
              key={member.id}
              className="flex items-center justify-between py-2.5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-foreground">
                  {member.username}
                  {member.id === currentUserId && (
                    <span className="text-[12px] text-muted-foreground ml-1.5">(You)</span>
                  )}
                </p>
                <p className="text-[12px] text-muted-foreground">{member.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-muted-foreground capitalize">
                  {member.role === 'owner' ? 'Owner' : 'Member'}
                </span>
                {/* Remove button — owners only, not for self */}
                {isOwner && member.id !== currentUserId && member.role !== 'owner' && (
                  <button
                    className="text-destructive/60 hover:text-destructive transition-colors"
                    aria-label={`Remove ${member.username}`}
                    onClick={() => toast.error('Member removal coming soon')}
                  >
                    <Trash size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

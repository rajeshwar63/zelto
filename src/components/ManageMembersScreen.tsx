import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { getAuthSession } from '@/lib/auth'
import type { UserAccount, BusinessEntity } from '@/lib/types'
import { toast } from 'sonner'

interface Props {
  currentBusinessId: string
  onBack: () => void
}

function getRoleLabel(role: string): string {
  if (role === 'owner') return 'Manager'
  if (role === 'admin') return 'Admin'
  return 'Member'
}

export function ManageMembersScreen({ currentBusinessId, onBack }: Props) {
  const [business, setBusiness] = useState<BusinessEntity | null>(null)
  const [members, setMembers] = useState<UserAccount[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const session = await getAuthSession()
      if (!session) return
      const [biz, membersList, currentUser] = await Promise.all([
        dataStore.getBusinessEntityById(currentBusinessId),
        dataStore.getUserAccountsByBusinessId(currentBusinessId),
        dataStore.getUserAccountByEmail(session.email),
      ])
      setBusiness(biz || null)
      setMembers(membersList)
      setCurrentUserId(currentUser?.id || null)
      setLoading(false)
    }
    load()
  }, [currentBusinessId])

  const handleShare = async () => {
    if (!business) return
    const text = `Join ${business.businessName} on Zelto. Use code: ${business.zeltoId}`
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(business.zeltoId)
        toast.success('Zelto code copied!')
      }
    } catch {
      await navigator.clipboard.writeText(business.zeltoId)
      toast.success('Zelto code copied!')
    }
  }

  if (loading || !business) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </button>
        <h1 className="text-base font-semibold text-foreground">Members</h1>
      </div>

      {/* Invite section */}
      <div className="px-4 py-4 border-b border-border">
        <p className="text-xs text-muted-foreground mb-2">
          Share your Zelto code to invite team members:
        </p>
        <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
          <span className="text-sm font-mono font-medium text-foreground">{business.zeltoId}</span>
          <button
            onClick={handleShare}
            className="text-xs font-medium text-foreground underline underline-offset-2"
          >
            Share
          </button>
        </div>
      </div>

      {/* Members list */}
      <div className="px-4 py-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Active Members ({members.length})
        </p>
        <div className="space-y-3">
          {members.map(member => (
            <div key={member.id} className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {member.username}
                  {member.id === currentUserId && (
                    <span className="text-xs text-muted-foreground ml-1">(You)</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {getRoleLabel(member.role)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

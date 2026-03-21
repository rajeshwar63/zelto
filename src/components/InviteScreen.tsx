import { useState } from 'react'
import { supabaseDirect } from '@/lib/supabase-client'

function getAccessToken(): string | null {
  try {
    const session = JSON.parse(localStorage.getItem('sb-app-auth-token') || '{}')
    return session?.access_token ?? null
  } catch {
    return null
  }
}
import { toast } from 'sonner'
import { ArrowLeft, Link, ShareNetwork, Envelope } from '@phosphor-icons/react'

interface Props {
  currentBusinessId: string
  onBack: () => void
}

type InviteRole = 'member' | 'admin'

export function InviteScreen({ currentBusinessId, onBack }: Props) {
  const [role, setRole] = useState<InviteRole>('member')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [email, setEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)

  const generateLink = async (selectedRole: InviteRole) => {
    setGeneratingLink(true)
    try {
      const token = getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const { data, error } = await supabaseDirect.functions.invoke('create-invite', {
        body: { type: 'link', role: selectedRole },
        headers: { Authorization: `Bearer ${token}` },
      })

      if (error) throw new Error(data?.error || error.message || 'Failed to generate invite link')

      if (data?.inviteUrl) {
        setInviteUrl(data.inviteUrl)
      } else {
        throw new Error('No invite URL returned')
      }
    } catch (err) {
      console.error('Failed to generate invite link:', err)
      toast.error('Failed to generate invite link')
    } finally {
      setGeneratingLink(false)
    }
  }

  const handleRoleChange = (newRole: InviteRole) => {
    setRole(newRole)
    setInviteUrl(null)
    void generateLink(newRole)
  }

  // Generate initial link on mount
  useState(() => {
    void generateLink('member')
  })

  const handleCopy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      toast.success('Link copied!')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleShare = async () => {
    if (!inviteUrl) return
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join my team on Zelto',
          text: 'Use this link to join our business on Zelto:',
          url: inviteUrl,
        })
      } else {
        await navigator.clipboard.writeText(inviteUrl)
        toast.success('Link copied!')
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(inviteUrl!)
          toast.success('Link copied!')
        } catch {
          toast.error('Could not share link')
        }
      }
    }
  }

  const handleSendEmail = async () => {
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Enter a valid email address')
      return
    }

    setSendingEmail(true)
    try {
      const token = getAccessToken()
      if (!token) throw new Error('Not authenticated')
      const { data, error } = await supabaseDirect.functions.invoke('create-invite', {
        body: { type: 'email', role, email: trimmed },
        headers: { Authorization: `Bearer ${token}` },
      })

      if (error) throw new Error(data?.error || error.message || 'Failed to send invite')

      toast.success('Invite sent!')
      setEmail('')
    } catch (err) {
      console.error('Failed to send invite:', err)
      toast.error('Failed to send invite')
    } finally {
      setSendingEmail(false)
    }
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
        <h1 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Invite</h1>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Role selector */}
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#8492A6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', paddingLeft: '4px' }}>
            ROLE
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <RoleButton
              label="Member"
              description="Can view & create orders"
              active={role === 'member'}
              onClick={() => handleRoleChange('member')}
            />
            <RoleButton
              label="Admin"
              description="Full access"
              active={role === 'admin'}
              onClick={() => handleRoleChange('admin')}
            />
          </div>
        </div>

        {/* Share invite link card */}
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#8492A6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', paddingLeft: '4px' }}>
            SHARE INVITE LINK
          </p>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '14px',
            padding: '16px',
            border: '1px solid #E8ECF2',
          }}>
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
                color: generatingLink ? '#B0BAC9' : '#1A1F2E',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {generatingLink ? 'Generating...' : (inviteUrl || 'app.zeltoapp.com/join/...')}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleCopy}
                disabled={!inviteUrl || generatingLink}
                style={{
                  flex: 1,
                  padding: '11px',
                  border: '1px solid #E8ECF2',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#1A1F2E',
                  backgroundColor: '#fff',
                  cursor: !inviteUrl ? 'not-allowed' : 'pointer',
                  opacity: !inviteUrl ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                Copy
              </button>
              <button
                onClick={handleShare}
                disabled={!inviteUrl || generatingLink}
                style={{
                  flex: 1,
                  padding: '11px',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: '#4A6CF7',
                  cursor: !inviteUrl ? 'not-allowed' : 'pointer',
                  opacity: !inviteUrl ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <ShareNetwork size={14} />
                Share
              </button>
            </div>

            <p style={{ fontSize: '11px', color: '#B0BAC9', marginTop: '10px' }}>
              Link is reusable — multiple people can join with it.
            </p>
          </div>
        </div>

        {/* Invite by email card */}
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#8492A6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', paddingLeft: '4px' }}>
            INVITE BY EMAIL
          </p>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '14px',
            padding: '16px',
            border: '1px solid #E8ECF2',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#F2F4F8',
              borderRadius: '8px',
              padding: '2px 12px',
              marginBottom: '12px',
            }}>
              <Envelope size={16} color="#8492A6" style={{ flexShrink: 0 }} />
              <input
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSendEmail() }}
                style={{
                  flex: 1,
                  fontSize: '13px',
                  color: '#1A1F2E',
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: '10px 0',
                }}
              />
            </div>

            <button
              onClick={handleSendEmail}
              disabled={sendingEmail || !email.trim()}
              style={{
                width: '100%',
                padding: '12px',
                border: 'none',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: '#4A6CF7',
                cursor: sendingEmail || !email.trim() ? 'not-allowed' : 'pointer',
                opacity: sendingEmail || !email.trim() ? 0.5 : 1,
              }}
            >
              {sendingEmail ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoleButton({ label, description, active, onClick }: {
  label: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '12px',
        borderRadius: '12px',
        border: active ? '2px solid #4A6CF7' : '1px solid #E8ECF2',
        backgroundColor: active ? '#EEF0FF' : '#fff',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <p style={{ fontSize: '13px', fontWeight: 700, color: active ? '#4A6CF7' : '#1A1F2E' }}>
        {label}
      </p>
      <p style={{ fontSize: '11px', color: active ? '#6B8AFF' : '#8492A6', marginTop: '2px' }}>
        {description}
      </p>
    </button>
  )
}

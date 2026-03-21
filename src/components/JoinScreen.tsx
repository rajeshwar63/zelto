import { useEffect, useState } from 'react'
import { supabaseDirect } from '@/lib/supabase-client'
import { getLocalAuthSessionSync, setAuthSession } from '@/lib/auth'
import type { AuthSession } from '@/lib/auth'
import { toast } from 'sonner'

interface Props {
  inviteCode: string
  onJoinSuccess: (businessId: string, businessName: string) => void
  onError: (errorCode: string) => void
  onNeedsLogin: (inviteCode: string) => void
}

const ERROR_MESSAGES: Record<string, string> = {
  already_has_business: "You're already part of a business on Zelto. One business per account for now.",
  invite_expired: 'This invite link has expired. Ask the person who shared it to send a new one.',
  invite_already_used: 'This invite has already been used.',
  invite_revoked: 'This invite has been revoked.',
  email_mismatch: 'This invite was sent to a different email address.',
  already_member: "You're already a member of this business.",
}

export function JoinScreen({ inviteCode, onJoinSuccess, onError, onNeedsLogin }: Props) {
  const [status, setStatus] = useState<'checking' | 'accepting' | 'error'>('checking')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    void handleJoin()
  }, [inviteCode])

  async function handleJoin() {
    // Check if logged in
    const localSession = getLocalAuthSessionSync()
    if (!localSession) {
      onNeedsLogin(inviteCode)
      return
    }

    setStatus('accepting')

    try {
      const response = await supabaseDirect.functions.invoke('accept-invite', {
        body: { inviteCode, userId: localSession.userId },
      })

      if (response.error) {
        // Check if there's error data in the response
        const errorData = response.data
        if (errorData?.error) {
          handleInviteError(errorData.error)
          return
        }
        throw response.error
      }

      const data = response.data
      if (!data) throw new Error('No response from accept-invite')

      // Handle error responses from the Edge Function
      if (data.error) {
        handleInviteError(data.error)
        return
      }

      // Success: update local session
      const businessId = data.businessEntityId
      const businessName = data.businessName

      if (businessId) {
        const updatedSession: AuthSession = {
          ...localSession,
          businessId,
        }
        await setAuthSession(updatedSession)
      }

      onJoinSuccess(businessId || localSession.businessId, businessName || 'the business')
    } catch (err) {
      console.error('Accept invite error:', err)
      setStatus('error')
      setErrorMessage('Something went wrong. Please try again.')
    }
  }

  function handleInviteError(errorCode: string) {
    // If already a member, just navigate to dashboard
    if (errorCode === 'already_member') {
      onJoinSuccess('', '')
      toast.info("You're already a member of this business.")
      return
    }

    setStatus('error')
    setErrorMessage(ERROR_MESSAGES[errorCode] || 'Could not accept invite. Please try again.')
    onError(errorCode)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F2F4F8',
      padding: '24px',
    }}>
      {status === 'checking' || status === 'accepting' ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#1A1F2E', marginBottom: '8px' }}>
            Joining team...
          </p>
          <p style={{ fontSize: '13px', color: '#8492A6' }}>Please wait</p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#1A1F2E', marginBottom: '12px' }}>
            Could not join
          </p>
          <p style={{ fontSize: '13px', color: '#8492A6', lineHeight: '1.5' }}>
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  )
}

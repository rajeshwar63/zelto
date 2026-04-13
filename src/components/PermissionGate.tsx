import { useTeamRoleContext } from '@/contexts/TeamRoleContext'
import { ShieldWarning } from '@phosphor-icons/react'

type GateAction = 'business_settings' | 'manage_connections' | 'manage_team'

const GATE_MESSAGES: Record<GateAction, string> = {
  business_settings: 'Only Admins can edit business settings.',
  manage_connections: 'Only Admins can add or manage connections.',
  manage_team: 'Only Admins can manage team members.',
}

const GATE_SUFFIX = 'Ask an Admin to make changes or promote you.'

interface Props {
  action: GateAction
  children: React.ReactNode
}

export function PermissionGate({ action, children }: Props) {
  const { isAdmin, loading } = useTeamRoleContext()

  if (loading) return <>{children}</>
  if (isAdmin) return <>{children}</>

  // Member view: show gate banner + dimmed children
  return (
    <div>
      {/* Gate banner */}
      <div style={{
        margin: '12px 16px',
        padding: '12px 14px',
        backgroundColor: '#FFF8ED',
        border: '1px solid #F5DEB3',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
      }}>
        <ShieldWarning size={18} color="#D97706" weight="fill" style={{ flexShrink: 0, marginTop: '1px' }} />
        <div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', lineHeight: '1.4' }}>
            {GATE_MESSAGES[action]}
          </p>
          <p style={{ fontSize: '12px', color: '#B45309', marginTop: '2px', lineHeight: '1.4' }}>
            {GATE_SUFFIX}
          </p>
        </div>
      </div>

      {/* Dimmed + disabled children */}
      <div style={{ opacity: 0.5, pointerEvents: 'none' }}>
        {children}
      </div>
    </div>
  )
}

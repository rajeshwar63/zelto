import { createContext, useContext } from 'react'
import { useTeamRole, type TeamRoleState } from '@/hooks/use-team-role'

const TeamRoleContext = createContext<TeamRoleState>({
  role: null,
  isAdmin: false,
  isMember: false,
  loading: true,
  refresh: async () => {},
})

export function TeamRoleProvider({ children }: { children: React.ReactNode }) {
  const teamRole = useTeamRole()
  return (
    <TeamRoleContext.Provider value={teamRole}>
      {children}
    </TeamRoleContext.Provider>
  )
}

export function useTeamRoleContext(): TeamRoleState {
  return useContext(TeamRoleContext)
}

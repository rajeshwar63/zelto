import { useEffect, useState } from 'react'
import { ConnectionsScreen } from '@/components/ConnectionsScreen'
import { ConnectionDetailScreen } from '@/components/ConnectionDetailScreen'
import { AttentionScreen } from '@/components/AttentionScreen'
import { StatusScreen } from '@/components/StatusScreen'
import { ProfileScreen } from '@/components/ProfileScreen'
import { LoginScreen } from '@/components/LoginScreen'
import { SignupScreen } from '@/components/SignupScreen'
import { OTPScreen } from '@/components/OTPScreen'
import { AdminApp } from '@/components/admin/AdminApp'
import { PrivacyPolicyScreen } from '@/components/PrivacyPolicyScreen'
import { TermsScreen } from '@/components/TermsScreen'
import { AddConnectionScreen } from '@/components/AddConnectionScreen'
import { PaymentTermsSetupScreen } from '@/components/PaymentTermsSetupScreen'
import { BusinessDetailsScreen } from '@/components/BusinessDetailsScreen'
import { NotificationHistoryScreen } from '@/components/NotificationHistoryScreen'
import { NotificationSettingsScreen } from '@/components/NotificationSettingsScreen'
import { AccountScreen } from '@/components/AccountScreen'
import { HelpSupportScreen } from '@/components/HelpSupportScreen'
import { List, ChartBar, Bell, User } from '@phosphor-icons/react'
import { getAuthSession, logout } from '@/lib/auth'
import { setupBackButtonHandler } from '@/lib/capacitor'
import { attentionEngine } from '@/lib/attention-engine'
import { updateTabLastSeen, updateConnectionLastSeen, hasUnreadAttentionItems, hasAnyUnreadConnections, hasUnreadConnectionActivity } from '@/lib/unread-tracker'
import { dataStore } from '@/lib/data-store'

type Tab = 'status' | 'connections' | 'attention' | 'profile'
type Screen = 
  | { type: 'tab'; tab: Tab } 
  | { type: 'connection-detail'; connectionId: string; selectedOrderId?: string } 
  | { type: 'add-connection' }
  | { type: 'payment-terms-setup'; connectionId: string; businessName: string; returnTo?: 'connection-detail' | 'connections' }
  | { type: 'business-details' }
  | { type: 'notifications' }
  | { type: 'profile-notifications' }
  | { type: 'profile-account' }
  | { type: 'profile-support' }
type AuthScreen = 'login' | 'signup' | { type: 'otp'; phoneNumber: string; businessName?: string; isSignup: boolean; sessionInfo: string }

function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(false)
  const [isPrivacyRoute, setIsPrivacyRoute] = useState(false)
  const [isTermsRoute, setIsTermsRoute] = useState(false)
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(null)
  const [navigationStack, setNavigationStack] = useState<Screen[]>([{ type: 'tab', tab: 'connections' }])
  const [authScreen, setAuthScreen] = useState<AuthScreen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [hasUnreadAttention, setHasUnreadAttention] = useState(false)
  const [hasUnreadConnections, setHasUnreadConnections] = useState(false)
  const [unreadConnectionIds, setUnreadConnectionIds] = useState<Set<string>>(new Set())
  
  const screen = navigationStack[navigationStack.length - 1]

  useEffect(() => {
    checkRoute()
    window.addEventListener('popstate', checkRoute)
    return () => window.removeEventListener('popstate', checkRoute)
  }, [])

  useEffect(() => {
    if (!isAdminRoute) {
      const initializeApp = async () => {
        try {
          const session = await getAuthSession()
          if (session) {
            setCurrentBusinessId(session.businessId)
            setAuthScreen(null)
          } else {
            setAuthScreen('signup')
          }
        } catch (err) {
          console.error('Failed to initialize app:', err)
          setError(err instanceof Error ? err.message : 'Failed to initialize app data')
        } finally {
          setIsCheckingAuth(false)
        }
      }
      initializeApp()
    }
  }, [isAdminRoute])

  const checkRoute = () => {
    setIsAdminRoute(window.location.pathname === '/admin')
    setIsPrivacyRoute(window.location.pathname === '/privacy')
    setIsTermsRoute(window.location.pathname === '/terms')
  }

  useEffect(() => {
    if (!currentBusinessId) return
    let cancelled = false
    const currentScreen = navigationStack[navigationStack.length - 1]
    const isOnAttention = currentScreen.type === 'tab' && currentScreen.tab === 'attention'
    const isOnConnections = currentScreen.type === 'tab' && currentScreen.tab === 'connections'
    async function checkUnread() {
      const items = await attentionEngine.getAttentionItems(currentBusinessId!)
      if (cancelled) return
      const allRequests = await dataStore.getAllConnectionRequests()
      if (cancelled) return
      const hasPendingRequests = allRequests.some(
        r => r.receiverBusinessId === currentBusinessId && r.status === 'Pending'
      )
      if (!isOnAttention) {
        setHasUnreadAttention(hasUnreadAttentionItems(currentBusinessId!, items) || hasPendingRequests)
      }
      if (!isOnConnections) {
        setHasUnreadConnections(hasAnyUnreadConnections(currentBusinessId!, items))
      }
      const connIds = [...new Set(items.map(item => item.connectionId))]
      const unread = new Set(connIds.filter(id => hasUnreadConnectionActivity(currentBusinessId!, id, items)))
      setUnreadConnectionIds(unread)
    }
    checkUnread()
    return () => { cancelled = true }
  }, [currentBusinessId, navigationStack])

  useEffect(() => {
    return setupBackButtonHandler(() => {
      setNavigationStack(stack => {
        if (stack.length > 1) {
          return stack.slice(0, -1)
        }
        return stack
      })
    })
  }, [])

  const handleLogout = async () => {
    await logout()
    setCurrentBusinessId(null)
    setAuthScreen('login')
    setNavigationStack([{ type: 'tab', tab: 'connections' }])
  }

  const handleLoginSubmit = (phoneNumber: string, sessionInfo: string) => {
    setAuthScreen({ type: 'otp', phoneNumber, isSignup: false, sessionInfo })
  }

  const handleSignupSubmit = (phoneNumber: string, businessName: string, sessionInfo: string) => {
    setAuthScreen({ type: 'otp', phoneNumber, businessName, isSignup: true, sessionInfo })
  }

  const handleOTPSuccess = async (businessId: string) => {
    setCurrentBusinessId(businessId)
    setAuthScreen(null)
  }

  const handleOTPBack = () => {
    setAuthScreen('login')
  }

  if (isAdminRoute) {
    return <AdminApp />
  }

  if (isPrivacyRoute) {
    return <PrivacyPolicyScreen />
  }

  if (isTermsRoute) {
    return <TermsScreen />
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md">
          <p className="text-sm font-medium text-destructive mb-2">Error loading app</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (authScreen) {
    if (authScreen === 'login') {
      return <LoginScreen onLogin={handleLoginSubmit} onSwitchToSignup={() => setAuthScreen('signup')} />
    }
    if (authScreen === 'signup') {
      return <SignupScreen onSignup={handleSignupSubmit} onSwitchToLogin={() => setAuthScreen('login')} />
    }
    if (typeof authScreen === 'object' && authScreen.type === 'otp') {
      return (
        <OTPScreen
          phoneNumber={authScreen.phoneNumber}
          businessName={authScreen.businessName}
          isSignup={authScreen.isSignup}
          sessionInfo={authScreen.sessionInfo}
          onSuccess={handleOTPSuccess}
          onBack={handleOTPBack}
        />
      )
    }
  }

  if (!currentBusinessId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const navigateToConnection = (connectionId: string, orderId?: string) => {
    if (currentBusinessId) {
      updateConnectionLastSeen(currentBusinessId, connectionId)
    }
    setNavigationStack(stack => [...stack, { type: 'connection-detail', connectionId, selectedOrderId: orderId }])
  }

  const navigateBack = () => {
    setNavigationStack(stack => {
      if (stack.length > 1) {
        return stack.slice(0, -1)
      }
      return stack
    })
  }

  const navigateToTab = (tab: Tab) => {
    if (currentBusinessId) {
      if (tab === 'attention') {
        updateTabLastSeen(currentBusinessId, 'attention')
        setHasUnreadAttention(false)
      } else if (tab === 'connections') {
        updateTabLastSeen(currentBusinessId, 'connections')
        setHasUnreadConnections(false)
      }
    }
    setNavigationStack([{ type: 'tab', tab }])
  }

  const navigateToAddConnection = () => {
    setNavigationStack(stack => [...stack, { type: 'add-connection' }])
  }

  const handleAddConnectionSuccess = () => {
    navigateBack()
  }

  const navigateToPaymentTermsSetup = (connectionId: string, businessName: string) => {
    setNavigationStack(stack => [...stack, { type: 'payment-terms-setup', connectionId, businessName, returnTo: 'connection-detail' }])
  }

  const handlePaymentTermsSaved = () => {
    navigateBack()
  }

  const handlePaymentTermsBack = () => {
    navigateBack()
  }

  const navigateToBusinessDetails = () => {
    setNavigationStack(stack => [...stack, { type: 'business-details' }])
  }

  const navigateToNotifications = () => {
    setNavigationStack(stack => [...stack, { type: 'notifications' }])
  }

  const navigateToProfileNotifications = () => {
    setNavigationStack(stack => [...stack, { type: 'profile-notifications' }])
  }

  const navigateToProfileAccount = () => {
    setNavigationStack(stack => [...stack, { type: 'profile-account' }])
  }

  const navigateToProfileSupport = () => {
    setNavigationStack(stack => [...stack, { type: 'profile-support' }])
  }

  const handleBusinessDetailsSaved = () => {
    navigateBack()
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-auto pb-16">
        {screen.type === 'profile-notifications' ? (
          <NotificationSettingsScreen onBack={navigateBack} />
        ) : screen.type === 'profile-account' ? (
          <AccountScreen onBack={navigateBack} onLogout={handleLogout} />
        ) : screen.type === 'profile-support' ? (
          <HelpSupportScreen onBack={navigateBack} />
        ) : screen.type === 'notifications' ? (
          <NotificationHistoryScreen
            currentBusinessId={currentBusinessId}
            onBack={navigateBack}
            onNavigateToConnection={navigateToConnection}
          />
        ) : screen.type === 'business-details' ? (
          <BusinessDetailsScreen
            currentBusinessId={currentBusinessId}
            onBack={navigateBack}
            onSave={handleBusinessDetailsSaved}
          />
        ) : screen.type === 'add-connection' ? (
          <AddConnectionScreen
            currentBusinessId={currentBusinessId}
            onBack={navigateBack}
            onSuccess={handleAddConnectionSuccess}
          />
        ) : screen.type === 'payment-terms-setup' ? (
          <PaymentTermsSetupScreen
            connectionId={screen.connectionId}
            businessName={screen.businessName}
            currentBusinessId={currentBusinessId}
            onSave={handlePaymentTermsSaved}
            onBack={handlePaymentTermsBack}
          />
        ) : screen.type === 'connection-detail' ? (
          <ConnectionDetailScreen
            connectionId={screen.connectionId}
            currentBusinessId={currentBusinessId}
            selectedOrderId={screen.selectedOrderId}
            onBack={navigateBack}
            onNavigateToPaymentTermsSetup={navigateToPaymentTermsSetup}
          />
        ) : screen.type === 'tab' && screen.tab === 'status' ? (
          <StatusScreen currentBusinessId={currentBusinessId} onNavigateToConnection={navigateToConnection} />
        ) : screen.type === 'tab' && screen.tab === 'connections' ? (
          <ConnectionsScreen
            currentBusinessId={currentBusinessId}
            onSelectConnection={navigateToConnection}
            onAddConnection={navigateToAddConnection}
            unreadConnectionIds={unreadConnectionIds}
          />
        ) : screen.type === 'tab' && screen.tab === 'attention' ? (
          <AttentionScreen 
            currentBusinessId={currentBusinessId} 
            onNavigateToConnections={() => navigateToTab('connections')}
            onNavigateToConnection={navigateToConnection}
          />
        ) : screen.type === 'tab' && screen.tab === 'profile' ? (
          <ProfileScreen 
            currentBusinessId={currentBusinessId} 
            onLogout={handleLogout}
            onNavigateToBusinessDetails={navigateToBusinessDetails}
            onNavigateToNotifications={navigateToNotifications}
            onNavigateToNotificationSettings={navigateToProfileNotifications}
            onNavigateToAccount={navigateToProfileAccount}
            onNavigateToSupport={navigateToProfileSupport}
          />
        ) : null}
      </div>

      {screen.type === 'tab' && (
        <div className="bottom-nav fixed bottom-0 left-0 right-0 bg-background border-t border-border">
          <div className="flex items-center justify-around h-14">
            <TabButton
              label="Status"
              icon={<ChartBar weight="regular" size={22} />}
              active={screen.tab === 'status'}
              onClick={() => navigateToTab('status')}
            />
            <TabButton
              label="Connections"
              icon={<List weight="regular" size={22} />}
              active={screen.tab === 'connections'}
              onClick={() => navigateToTab('connections')}
              hasUnread={hasUnreadConnections}
            />
            <TabButton
              label="Attention"
              icon={<Bell weight="regular" size={22} />}
              active={screen.tab === 'attention'}
              onClick={() => navigateToTab('attention')}
              hasUnread={hasUnreadAttention}
            />
            <TabButton
              label="Profile"
              icon={<User weight="regular" size={22} />}
              active={screen.tab === 'profile'}
              onClick={() => navigateToTab('profile')}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({
  label,
  icon,
  active,
  onClick,
  hasUnread,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  hasUnread?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-0.5 py-1 px-3 min-w-[70px] relative"
    >
      <span className={active ? 'text-foreground' : 'text-muted-foreground'}>
        {icon}
        {hasUnread && !active && (
          <span
            className="absolute top-0.5 right-4 w-2 h-2 rounded-full"
            style={{ backgroundColor: '#D64545' }}
          />
        )}
      </span>
      <span
        className={`text-[10px] ${
          active ? 'text-foreground font-medium' : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>
    </button>
  )
}

export default App

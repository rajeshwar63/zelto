import { useEffect, useState, useRef } from 'react'
import { ConnectionsScreen } from '@/components/ConnectionsScreen'
import { ConnectionDetailScreen } from '@/components/ConnectionDetailScreen'
import { DashboardScreen } from '@/components/DashboardScreen'
import { OrdersScreen } from '@/components/OrdersScreen'
import { OrderDetailScreen } from '@/components/OrderDetailScreen'
import { ProfileScreen } from '@/components/ProfileScreen'
import { WelcomeScreen } from '@/components/WelcomeScreen'
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
import { ReportIssueScreen } from '@/components/ReportIssueScreen'
import { House, Users, Package, User, Bell } from '@phosphor-icons/react'
import { AttentionScreen } from '@/components/AttentionScreen'
import { getAuthState, getLocalAuthSessionSync, logout, clearAuthSession } from '@/lib/auth'
import { registerPushNotifications, removeDeviceTokens } from '@/lib/push-notifications'
import { supabase } from '@/lib/supabase-client'
import { setupBackButtonHandler } from '@/lib/capacitor'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { attentionEngine } from '@/lib/attention-engine'
import { updateTabLastSeen, updateConnectionLastSeen, hasAnyUnreadConnections, hasUnreadConnectionActivity } from '@/lib/unread-tracker'

import { behaviourEngine } from '@/lib/behaviour-engine'
import { BusinessSetupScreen } from '@/components/BusinessSetupScreen'
import { useDataListener } from '@/lib/data-events'


type Tab = 'dashboard' | 'orders' | 'attention' | 'connections' | 'profile'
type Screen =
  | { type: 'tab'; tab: Tab; filter?: string }
  | { type: 'connection-detail'; connectionId: string; selectedOrderId?: string }
  | { type: 'order-detail'; orderId: string; connectionId: string; initialIssueId?: string }
  | { type: 'add-connection' }
  | { type: 'payment-terms-setup'; connectionId: string; businessName: string; returnTo?: 'connection-detail' | 'connections' }
  | { type: 'business-details' }
  | { type: 'notifications' }
  | { type: 'profile-notifications' }
  | { type: 'profile-account' }
  | { type: 'profile-support' }
  | { type: 'report-issue'; orderId: string; connectionId: string }
type AuthScreen = 'welcome' | { type: 'otp'; email: string; signupData?: { name: string; businessName: string } } | { type: 'business_setup'; email: string }

function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(false)
  const [isPrivacyRoute, setIsPrivacyRoute] = useState(false)
  const [isTermsRoute, setIsTermsRoute] = useState(false)
  const [bootstrappedSession] = useState(() => getLocalAuthSessionSync())
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(bootstrappedSession?.businessId ?? null)
  const [navigationStack, setNavigationStack] = useState<Screen[]>([{ type: 'tab', tab: 'dashboard' }])
  const [authScreen, setAuthScreen] = useState<AuthScreen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(!bootstrappedSession)

  const [hasUnreadConnections, setHasUnreadConnections] = useState(false)
  const [unreadConnectionIds, setUnreadConnectionIds] = useState<Set<string>>(new Set())
  
  const screen = navigationStack[navigationStack.length - 1]
  const activeTabScreen = [...navigationStack].reverse().find((stackScreen): stackScreen is Extract<Screen, { type: 'tab' }> => stackScreen.type === 'tab')
  const activeTab = activeTabScreen?.tab ?? 'dashboard'
  const ordersInitialFilter = activeTabScreen?.tab === 'orders' ? activeTabScreen.filter : undefined

  useEffect(() => {
    checkRoute()
    window.addEventListener('popstate', checkRoute)
    return () => window.removeEventListener('popstate', checkRoute)
  }, [])

  useEffect(() => {
    if (isAdminRoute) return

    let cancelled = false

    const initializeApp = async () => {
      try {
        const authState = await getAuthState()
        if (cancelled) return

        if (authState.status === 'authenticated') {
          setCurrentBusinessId(authState.session.businessId)
          setAuthScreen(null)
          registerPushNotifications(authState.session.businessId).catch(console.error)
          return
        }

        await clearAuthSession()
        if (cancelled) return

        setCurrentBusinessId(null)
        if (authState.status === 'needs_business_setup') {
          setAuthScreen({ type: 'business_setup', email: authState.email })
        } else {
          setAuthScreen('welcome')
        }
      } catch (err) {
        console.error('Failed to initialize app:', err)
        if (!bootstrappedSession) {
          setError(err instanceof Error ? err.message : 'Failed to initialize app data')
        }
      } finally {
        if (!cancelled) {
          setIsCheckingAuth(false)
        }
      }
    }

    void initializeApp()

    return () => {
      cancelled = true
    }
  }, [isAdminRoute, bootstrappedSession])

  const checkRoute = () => {
    setIsAdminRoute(window.location.pathname === '/admin')
    setIsPrivacyRoute(window.location.pathname === '/privacy')
    setIsTermsRoute(window.location.pathname === '/terms')
  }

  async function checkUnread() {
    if (!currentBusinessId) return
    const currentScreen = navigationStack[navigationStack.length - 1]
    const isOnConnections = currentScreen.type === 'tab' && currentScreen.tab === 'connections'
    const items = await attentionEngine.getAttentionItems(currentBusinessId)
    if (!isOnConnections) {
      setHasUnreadConnections(hasAnyUnreadConnections(currentBusinessId, items))
    }
    const connIds = [...new Set(items.map(item => item.connectionId))]
    const unread = new Set(connIds.filter(id => hasUnreadConnectionActivity(currentBusinessId, id, items)))
    setUnreadConnectionIds(unread)
  }

  const checkUnreadRef = useRef(checkUnread)
  checkUnreadRef.current = checkUnread

  useEffect(() => {
    if (!currentBusinessId) return
    void checkUnread()
  }, [currentBusinessId, navigationStack])

  // Periodic behaviour engine recalculation (every 20 minutes)
  useEffect(() => {
    if (!currentBusinessId) return

    // Run once on login
    behaviourEngine.recalculateAllConnectionStates().catch(console.error)

    const interval = setInterval(() => {
      behaviourEngine.recalculateAllConnectionStates().catch(console.error)
    }, 20 * 60 * 1000)

    return () => clearInterval(interval)
  }, [currentBusinessId])

  useDataListener(
    ['orders:changed', 'payments:changed', 'connections:changed', 'connection-requests:changed', 'notifications:changed'],
    () => { checkUnreadRef.current() }
  )

  // Refresh notification count when a push notification arrives while the app is open
  useEffect(() => {
    if (!currentBusinessId || !Capacitor.isNativePlatform()) return

    let handle: Awaited<ReturnType<typeof PushNotifications.addListener>> | null = null

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received:', notification)
      checkUnreadRef.current()
    }).then(h => { handle = h })

    return () => { handle?.remove() }
  }, [currentBusinessId])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          await clearAuthSession()
          setCurrentBusinessId(null)
          setAuthScreen('welcome')
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

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
    await removeDeviceTokens()
    await logout()
    setCurrentBusinessId(null)
    setAuthScreen('welcome')
    setNavigationStack([{ type: 'tab', tab: 'dashboard' }])
  }

  const handleWelcomeSubmit = (data: { name: string; businessName: string; email: string }) => {
    setAuthScreen({ type: 'otp', email: data.email, signupData: { name: data.name, businessName: data.businessName } })
  }

  const handleLoginOnly = (email: string) => {
    setAuthScreen({ type: 'otp', email })
  }

  const handleOTPSuccess = async (businessId: string) => {
    setCurrentBusinessId(businessId)
    setAuthScreen(null)
    registerPushNotifications(businessId).catch(console.error)
  }

  const handleOTPBack = () => {
    setAuthScreen('welcome')
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
    if (authScreen === 'welcome') {
      return <WelcomeScreen onContinue={handleWelcomeSubmit} onLoginOnly={handleLoginOnly} />
    }
    if (typeof authScreen === 'object' && authScreen.type === 'otp') {
      return (
        <OTPScreen
          email={authScreen.email}
          signupData={authScreen.signupData}
          onSuccess={handleOTPSuccess}
          onBack={handleOTPBack}
        />
      )
    }
    if (typeof authScreen === 'object' && authScreen.type === 'business_setup') {
      return (
        <BusinessSetupScreen
          email={authScreen.email}
          onComplete={(businessId) => {
            setCurrentBusinessId(businessId)
            setAuthScreen(null)
          }}
        />
      )
    }
    return null
  }

  if (!currentBusinessId) {
    return <WelcomeScreen onContinue={handleWelcomeSubmit} onLoginOnly={handleLoginOnly} />
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
      if (tab === 'connections') {
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

  const navigateToOrderDetail = (orderId: string, connectionId: string) => {
    navigateToConnection(connectionId, orderId)
  }

  const navigateToReportIssue = (orderId: string, connectionId: string) => {
    setNavigationStack(stack => [...stack, { type: 'report-issue', orderId, connectionId }])
  }

  const navigateToIssueDetail = (connectionId: string, orderId: string, issueId: string) => {
    setNavigationStack(stack => [...stack, { type: 'order-detail', orderId, connectionId, initialIssueId: issueId }])
  }

  const navigateToTabWithFilter = (tab: Tab, filter?: string) => {
    if (currentBusinessId) {
      if (tab === 'connections') {
        updateTabLastSeen(currentBusinessId, 'connections')
        setHasUnreadConnections(false)
      }
    }
    setNavigationStack([{ type: 'tab', tab, filter }])
  }

  const handleBusinessDetailsSaved = () => {
    navigateBack()
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-screen)' }}>
      <div className="flex-1 overflow-auto pb-16">
        {activeTab === 'dashboard' ? (
          <DashboardScreen
            currentBusinessId={currentBusinessId}
            isActive={activeTab === 'dashboard'}
            onNavigateToOrders={(filter) => navigateToTabWithFilter('orders', filter)}
            onNavigateToConnection={navigateToConnection}
            onNavigateToProfile={() => navigateToTab('profile')}
            onNavigateToAttention={(filter) => navigateToTabWithFilter('attention', filter)}
          />
        ) : activeTab === 'attention' ? (
          <AttentionScreen
            currentBusinessId={currentBusinessId}
            isActive={activeTab === 'attention'}
            onNavigateToConnections={() => navigateToTab('connections')}
            onNavigateToIssue={navigateToIssueDetail}
          />
        ) : activeTab === 'connections' ? (
          <ConnectionsScreen
            currentBusinessId={currentBusinessId}
            isActive={activeTab === 'connections'}
            onSelectConnection={navigateToConnection}
            onAddConnection={navigateToAddConnection}
            unreadConnectionIds={unreadConnectionIds}
          />
        ) : activeTab === 'orders' ? (
          <OrdersScreen
            currentBusinessId={currentBusinessId}
            isActive={activeTab === 'orders'}
            onSelectOrder={navigateToOrderDetail}
            initialFilter={ordersInitialFilter}
          />
        ) : (
          <ProfileScreen
            currentBusinessId={currentBusinessId}
            onLogout={handleLogout}
            onNavigateToBusinessDetails={navigateToBusinessDetails}
            onNavigateToNotifications={navigateToNotifications}
            onNavigateToNotificationSettings={navigateToProfileNotifications}
            onNavigateToAccount={navigateToProfileAccount}
            onNavigateToSupport={navigateToProfileSupport}
          />
        )}

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
        ) : screen.type === 'report-issue' ? (
          <ReportIssueScreen
            orderId={screen.orderId}
            currentBusinessId={currentBusinessId}
            onBack={navigateBack}
            onSuccess={() => {
              navigateBack()
            }}
          />
        ) : screen.type === 'order-detail' ? (
          <OrderDetailScreen
            orderId={screen.orderId}
            connectionId={screen.connectionId}
            currentBusinessId={currentBusinessId}
            onBack={navigateBack}
            onReportIssue={navigateToReportIssue}
            initialIssueId={screen.initialIssueId}
          />
        ) : screen.type === 'connection-detail' ? (
          <ConnectionDetailScreen
            connectionId={screen.connectionId}
            currentBusinessId={currentBusinessId}
            selectedOrderId={screen.selectedOrderId}
            onBack={navigateBack}
            onNavigateToPaymentTermsSetup={navigateToPaymentTermsSetup}
            onReportIssue={navigateToReportIssue}
          />
        ) : null}
      </div>

      {screen.type === 'tab' && (
        <div className="bottom-nav fixed bottom-0 left-0 right-0" style={{ backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border-light)' }}>
          <div className="flex items-center justify-around" style={{ height: '80px', paddingTop: '10px' }}>
            <TabButton
              label="Home"
              icon={<House weight="regular" size={22} />}
              active={activeTab === 'dashboard'}
              onClick={() => navigateToTab('dashboard')}
            />
            <TabButton
              label="Connections"
              icon={<Users weight="regular" size={22} />}
              active={activeTab === 'connections'}
              onClick={() => navigateToTab('connections')}
              hasUnread={hasUnreadConnections}
            />
            <TabButton
              label="Orders"
              icon={<Package weight="regular" size={22} />}
              active={activeTab === 'orders'}
              onClick={() => navigateToTab('orders')}
            />
            <TabButton
              label="Disputes"
              icon={<Bell weight="regular" size={22} />}
              active={activeTab === 'attention'}
              onClick={() => navigateToTab('attention')}
            />
            <TabButton
              label="Profile"
              icon={<User weight="regular" size={22} />}
              active={activeTab === 'profile'}
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
      className="flex flex-col items-center justify-center gap-0.5 py-1 px-3 relative"
      style={{ minWidth: '70px', minHeight: '44px' }}
    >
      <span className="relative" style={{ color: active ? 'var(--brand-primary)' : 'var(--text-secondary)', filter: active ? 'none' : 'grayscale(1)', opacity: active ? 1 : 0.5 }}>
        {icon}
        {hasUnread && !active && (
          <span
            className="absolute rounded-full"
            style={{ width: '8px', height: '8px', backgroundColor: 'var(--status-overdue)', top: '-2px', right: '-4px', border: '2px solid var(--bg-card)' }}
          />
        )}
      </span>
      <span
        style={{
          fontSize: '10px',
          fontWeight: active ? 700 : 500,
          color: active ? 'var(--brand-primary)' : 'var(--text-secondary)',
        }}
      >
        {label}
      </span>
    </button>
  )
}

export default App

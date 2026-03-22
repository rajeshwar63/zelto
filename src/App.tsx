import * as Sentry from '@sentry/react'
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
import { DeleteAccountScreen } from '@/components/DeleteAccountScreen'
import { ManageConnectionsScreen } from '@/components/ManageConnectionsScreen'
import { PaymentTermsSetupScreen } from '@/components/PaymentTermsSetupScreen'
import { BusinessDetailsScreen } from '@/components/BusinessDetailsScreen'
import { TrustProfileScreen, type TrustProfileScreenMode } from '@/components/TrustProfileScreen'
import { NotificationHistoryScreen } from '@/components/NotificationHistoryScreen'
import { NotificationSettingsScreen } from '@/components/NotificationSettingsScreen'
import { AccountScreen } from '@/components/AccountScreen'
import { HelpSupportScreen } from '@/components/HelpSupportScreen'
import { ReportIssueScreen } from '@/components/ReportIssueScreen'
import { House, Users, Package, User, Bell } from '@phosphor-icons/react'
import { AttentionScreen } from '@/components/AttentionScreen'
import { IncomingRequestsScreen } from '@/components/IncomingRequestsScreen'
import { getAuthState, getLocalAuthSessionSync, logout, clearAuthSession } from '@/lib/auth'
import { PlaceOrderScreen } from '@/components/PlaceOrderScreen'
import { ManageMembersScreen } from '@/components/ManageMembersScreen'
import { ManageDocumentsScreen } from '@/components/ManageDocumentsScreen'
import { TeamScreen } from '@/components/TeamScreen'
import { InviteScreen } from '@/components/InviteScreen'
import { JoinScreen } from '@/components/JoinScreen'
import { ItemMasterScreen } from '@/components/ItemMasterScreen'
import { ItemCreateScreen } from '@/components/ItemCreateScreen'
import { InvoiceSettingsScreen } from '@/components/InvoiceSettingsScreen'
import { InvoiceCreateScreen } from '@/components/InvoiceCreateScreen'
import { InvoiceViewScreen } from '@/components/InvoiceViewScreen'
import { TeamRoleProvider } from '@/contexts/TeamRoleContext'
import { PermissionGate } from '@/components/PermissionGate'
import { toast } from 'sonner'
import { registerPushNotifications, removeDeviceTokens } from '@/lib/push-notifications'
import { supabase } from '@/lib/supabase-client'
import { setupBackButtonHandler } from '@/lib/capacitor'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { attentionEngine } from '@/lib/attention-engine'
import { dataStore } from '@/lib/data-store'
import { updateTabLastSeen, updateConnectionLastSeen, hasAnyUnreadConnections, hasUnreadConnectionActivity } from '@/lib/unread-tracker'

import { behaviourEngine } from '@/lib/behaviour-engine'
import { BusinessSetupScreen } from '@/components/BusinessSetupScreen'
import { useDataListener, emitDataChange } from '@/lib/data-events'


type Tab = 'dashboard' | 'orders' | 'attention' | 'connections' | 'profile'
type OrdersTabParams = {
  role?: 'all' | 'buying' | 'selling'
  chip?: 'new' | 'accepted' | 'placed' | 'dispatched' | 'delivered' | 'paid' | 'overdue'
  dateToday?: boolean
}

type Screen =
  | { type: 'tab'; tab: Tab; filter?: string; ordersParams?: OrdersTabParams }
  | { type: 'connection-detail'; connectionId: string }
  | { type: 'order-detail'; orderId: string; connectionId: string; initialIssueId?: string; mode?: 'connection' | 'issue' }
  | { type: 'manage-connections'; initialTab?: 'sent' | 'received' | 'archived' }
  | { type: 'payment-terms-setup'; connectionId: string; businessName: string; returnTo?: 'connection-detail' | 'connections' }
  | { type: 'business-details' }
  | { type: 'manage-documents' }
  | { type: 'notifications' }
  | { type: 'profile-notifications' }
  | { type: 'profile-account' }
  | { type: 'profile-support' }
  | { type: 'report-issue'; orderId: string; connectionId: string }
  | { type: 'incoming-requests' }
  | { type: 'trust-profile'; targetBusinessId: string; screenMode: TrustProfileScreenMode; connectionRequestId?: string; connectionId?: string; initialTab?: 'identity' | 'docs' }
  | { type: 'manage-members' }
  | { type: 'team' }
  | { type: 'invite' }
  | { type: 'place-order'; prefilledConnectionId?: string | null }
  | { type: 'invoice-settings' }
  | { type: 'item-master' }
  | { type: 'item-create'; itemId?: string }
  | { type: 'invoice-create'; orderId: string; connectionId: string }
  | { type: 'invoice-view'; invoiceId: string }
type AuthScreen = 'welcome' | { type: 'otp'; email: string; signupData?: { name: string; businessName: string } } | { type: 'business_setup'; email: string }
type TabShellScreen = Extract<Screen, { type: 'tab' }>
type DetailScreen = Exclude<Screen, { type: 'tab' }>

function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(false)
  const [isPrivacyRoute, setIsPrivacyRoute] = useState(false)
  const [isTermsRoute, setIsTermsRoute] = useState(false)
  const [isDeleteAccountRoute, setIsDeleteAccountRoute] = useState(false)
  const [bootstrappedSession] = useState(() => getLocalAuthSessionSync())
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(bootstrappedSession?.businessId ?? null)
  const [navigationStack, setNavigationStack] = useState<Screen[]>([{ type: 'tab', tab: 'dashboard' }])
  const [authScreen, setAuthScreen] = useState<AuthScreen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(!bootstrappedSession)

  const [hasUnreadConnections, setHasUnreadConnections] = useState(false)
  const [unreadConnectionIds, setUnreadConnectionIds] = useState<Set<string>>(new Set())
  const [pendingInviteToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('invite')
  })
  const [joinInviteCode] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/join\/([A-Za-z0-9]+)$/)
    return match ? match[1] : null
  })
  
  const screen = navigationStack[navigationStack.length - 1]
  const activeTabScreen = [...navigationStack].reverse().find((stackScreen): stackScreen is TabShellScreen => stackScreen.type === 'tab')

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
    setIsDeleteAccountRoute(window.location.pathname === '/delete-account')
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

  // Set Sentry user context when business/user changes
  useEffect(() => {
    if (!currentBusinessId) {
      Sentry.setUser(null)
      return
    }
    const session = getLocalAuthSessionSync()
    if (!session) return
    dataStore.getBusinessEntityById(currentBusinessId).then((business) => {
      Sentry.setUser({
        id: session.userId,
        username: business?.zeltoId ?? currentBusinessId,
      })
    }).catch(() => {
      Sentry.setUser({ id: session.userId })
    })
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
    // If there's a pending invite token, attempt to accept it first
    if (pendingInviteToken) {
      const session = getLocalAuthSessionSync()
      if (session) {
        try {
          const result = await dataStore.acceptMemberInvite(pendingInviteToken, session.userId)
          // Update the local session to reflect the new business context
          const updatedSession = { ...session, businessId: result.businessId }
          localStorage.setItem('zelto:local-auth-session', JSON.stringify(updatedSession))
          setCurrentBusinessId(result.businessId)
          setAuthScreen(null)
          registerPushNotifications(result.businessId).catch(console.error)
          toast.success(`You've joined ${result.businessName}`)
          return
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not join the business'
          toast.error(msg)
          // Fall through to normal login with own business
        }
      }
    }
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

  if (isDeleteAccountRoute) {
    return <DeleteAccountScreen />
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

  // Handle /join/{code} route
  if (joinInviteCode && !isCheckingAuth) {
    if (authScreen || !currentBusinessId) {
      // Not logged in — redirect to login with invite code preserved
      if (authScreen === 'welcome' || !currentBusinessId) {
        return <WelcomeScreen onContinue={handleWelcomeSubmit} onLoginOnly={handleLoginOnly} />
      }
    } else {
      // Logged in — show join flow
      return (
        <JoinScreen
          inviteCode={joinInviteCode}
          onJoinSuccess={(businessId, businessName) => {
            if (businessId) {
              setCurrentBusinessId(businessId)
            }
            if (businessName) {
              toast.success(`You've joined ${businessName}`)
            }
            // Clear /join/ from URL
            window.history.replaceState({}, '', '/')
            setNavigationStack([{ type: 'tab', tab: 'dashboard' }])
            // Force re-render by clearing joinInviteCode effect
            window.location.href = '/'
          }}
          onError={() => {
            window.history.replaceState({}, '', '/')
          }}
          onNeedsLogin={() => {
            setAuthScreen('welcome')
          }}
        />
      )
    }
  }

  if (!currentBusinessId) {
    return <WelcomeScreen onContinue={handleWelcomeSubmit} onLoginOnly={handleLoginOnly} />
  }

  const navigateToConnection = (connectionId: string, orderId?: string) => {
    if (currentBusinessId) {
      updateConnectionLastSeen(currentBusinessId, connectionId)
    }
    if (orderId) {
      setNavigationStack(stack => [...stack, { type: 'order-detail', orderId, connectionId, mode: 'connection' }])
    } else {
      setNavigationStack(stack => [...stack, { type: 'connection-detail', connectionId }])
    }
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

  const navigateToManageConnections = () => {
    setNavigationStack(stack => [...stack, { type: 'manage-connections' }])
  }

  const navigateToManageConnectionsReceived = () => {
    setNavigationStack(stack => [...stack, { type: 'manage-connections', initialTab: 'received' }])
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

  const navigateToPlaceOrder = (prefilledConnectionId?: string | null) => {
    setNavigationStack(stack => [...stack, { type: 'place-order', prefilledConnectionId }])
  }

  const navigateToManageDocuments = () => {
    setNavigationStack(stack => [...stack, { type: 'manage-documents' }])
  }

  const navigateToManageMembers = () => {
    setNavigationStack(stack => [...stack, { type: 'manage-members' }])
  }

  const navigateToTeam = () => {
    setNavigationStack(stack => [...stack, { type: 'team' }])
  }

  const navigateToInvite = () => {
    setNavigationStack(stack => [...stack, { type: 'invite' }])
  }

  const navigateToSupplierDocs = (targetBusinessId: string, connectionId: string) => {
    setNavigationStack(stack => [...stack, {
      type: 'trust-profile',
      targetBusinessId,
      screenMode: { action: 'view-connection', audience: 'connection-review' },
      connectionId,
      initialTab: 'docs',
    }])
  }

  const navigateToTrustProfile = (
    targetBusinessId: string,
    screenMode: TrustProfileScreenMode,
    connectionRequestId?: string,
    connectionId?: string
  ) => {
    setNavigationStack(stack => [...stack, { type: 'trust-profile', targetBusinessId, screenMode, connectionRequestId, connectionId }])
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
    setNavigationStack(stack => [...stack, { type: 'order-detail', orderId, connectionId, mode: 'issue' }])
  }

  const navigateToConnectionOrderDetail = (orderId: string, connectionId: string) => {
    setNavigationStack(stack => [...stack, { type: 'order-detail', orderId, connectionId, mode: 'connection' }])
  }

  const navigateToReportIssue = (orderId: string, connectionId: string) => {
    setNavigationStack(stack => [...stack, { type: 'report-issue', orderId, connectionId }])
  }

  const navigateToIssueDetail = (connectionId: string, orderId: string, issueId: string) => {
    setNavigationStack(stack => [...stack, { type: 'order-detail', orderId, connectionId, initialIssueId: issueId, mode: 'issue' }])
  }

  const navigateToIncomingRequests = () => {
    setNavigationStack(stack => [...stack, { type: 'incoming-requests' }])
  }

  const navigateToInvoiceSettings = () => {
    setNavigationStack(stack => [...stack, { type: 'invoice-settings' }])
  }

  const navigateToItemMaster = () => {
    setNavigationStack(stack => [...stack, { type: 'item-master' }])
  }

  const navigateToItemCreate = (itemId?: string) => {
    setNavigationStack(stack => [...stack, { type: 'item-create', itemId }])
  }

  const navigateToInvoiceCreate = (orderId: string, connectionId: string) => {
    setNavigationStack(stack => [...stack, { type: 'invoice-create', orderId, connectionId }])
  }

  const navigateToInvoiceView = (invoiceId: string) => {
    setNavigationStack(stack => [...stack, { type: 'invoice-view', invoiceId }])
  }

  const navigateToTabWithFilter = (tab: Tab, filter?: string, ordersParams?: OrdersTabParams) => {
    if (currentBusinessId) {
      if (tab === 'connections') {
        updateTabLastSeen(currentBusinessId, 'connections')
        setHasUnreadConnections(false)
      }
    }
    setNavigationStack([{ type: 'tab', tab, filter, ordersParams }])
  }

  const handleBusinessDetailsSaved = () => {
    navigateBack()
  }

  const renderDetailScreen = (detailScreen: DetailScreen) => {
    if (detailScreen.type === 'incoming-requests') {
      return (
        <IncomingRequestsScreen
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onNavigateToConnections={() => navigateToTab('connections')}
          onNavigateToTrustProfile={(targetBusinessId, requestId) =>
            navigateToTrustProfile(targetBusinessId, { action: 'accept-request', audience: 'connection-review' }, requestId)
          }
        />
      )
    }
    if (detailScreen.type === 'profile-notifications') {
      return <NotificationSettingsScreen onBack={navigateBack} />
    }
    if (detailScreen.type === 'profile-account') {
      return (
        <AccountScreen
          onBack={navigateBack}
          onLogout={handleLogout}
          onDeleteAccount={handleLogout}
        />
      )
    }
    if (detailScreen.type === 'profile-support') {
      return <HelpSupportScreen onBack={navigateBack} />
    }
    if (detailScreen.type === 'notifications') {
      return (
        <NotificationHistoryScreen
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onNavigateToConnection={navigateToConnection}
        />
      )
    }
    if (detailScreen.type === 'business-details') {
      return (
        <PermissionGate action="business_settings">
          <BusinessDetailsScreen
            currentBusinessId={currentBusinessId}
            onBack={navigateBack}
            onSave={handleBusinessDetailsSaved}
            onNavigateToDocuments={navigateToManageDocuments}
          />
        </PermissionGate>
      )
    }
    if (detailScreen.type === 'manage-documents') {
      return (
        <ManageDocumentsScreen
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
        />
      )
    }
    if (detailScreen.type === 'manage-members') {
      return (
        <ManageMembersScreen
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
        />
      )
    }
    if (detailScreen.type === 'team') {
      return (
        <TeamScreen
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onNavigateToInvite={navigateToInvite}
        />
      )
    }
    if (detailScreen.type === 'invite') {
      return (
        <InviteScreen
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
        />
      )
    }
    if (detailScreen.type === 'trust-profile') {
      return (
        <TrustProfileScreen
          targetBusinessId={detailScreen.targetBusinessId}
          currentBusinessId={currentBusinessId}
          screenMode={detailScreen.screenMode}
          connectionRequestId={detailScreen.connectionRequestId}
          connectionId={detailScreen.connectionId}
          initialTab={detailScreen.initialTab}
          onBack={navigateBack}
          onNavigateToEditBusiness={
            detailScreen.screenMode.audience === 'self-profile-ready'
              ? (scrollToDocuments?: boolean) => {
                  if (scrollToDocuments) {
                    setNavigationStack(stack => [...stack, { type: 'manage-documents' }])
                  } else {
                    setNavigationStack(stack => [...stack, { type: 'business-details' }])
                  }
                }
              : undefined
          }
          onRequestSent={() => { navigateBack(); emitDataChange('connections:changed') }}
          onRequestAccepted={() => { navigateBack(); emitDataChange('connections:changed') }}
          onRequestDeclined={() => { navigateBack(); emitDataChange('connections:changed') }}
        />
      )
    }
    if (detailScreen.type === 'manage-connections') {
      return (
        <ManageConnectionsScreen
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onSuccess={handleAddConnectionSuccess}
          initialTab={detailScreen.initialTab}
          onNavigateToTrustProfile={(targetBusinessId) =>
            navigateToTrustProfile(targetBusinessId, { action: 'send-request', audience: 'connection-review' })
          }
        />
      )
    }
    if (detailScreen.type === 'payment-terms-setup') {
      return (
        <PaymentTermsSetupScreen
          connectionId={detailScreen.connectionId}
          businessName={detailScreen.businessName}
          currentBusinessId={currentBusinessId}
          onSave={handlePaymentTermsSaved}
          onBack={handlePaymentTermsBack}
        />
      )
    }
    if (detailScreen.type === 'report-issue') {
      return (
        <ReportIssueScreen
          orderId={detailScreen.orderId}
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onSuccess={() => {
            navigateBack()
          }}
        />
      )
    }
    if (detailScreen.type === 'order-detail') {
      return (
        <OrderDetailScreen
          orderId={detailScreen.orderId}
          connectionId={detailScreen.connectionId}
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onReportIssue={navigateToReportIssue}
          initialIssueId={detailScreen.initialIssueId}
          mode={detailScreen.mode ?? 'issue'}
          onNavigateToInvoiceCreate={navigateToInvoiceCreate}
          onNavigateToInvoiceView={navigateToInvoiceView}
        />
      )
    }
    if (detailScreen.type === 'place-order') {
      return (
        <PlaceOrderScreen
          prefilledConnectionId={detailScreen.prefilledConnectionId}
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onOrderCreated={(orderId, connectionId) => {
            // Replace PlaceOrderScreen with OrderDetailScreen (no back entry to place-order)
            setNavigationStack(stack => [
              ...stack.slice(0, -1),
              { type: 'order-detail', orderId, connectionId, mode: 'connection' },
            ])
          }}
        />
      )
    }
    if (detailScreen.type === 'invoice-settings') {
      return (
        <InvoiceSettingsScreen
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onNavigateToBusinessDetails={navigateToBusinessDetails}
          onNavigateToItemMaster={navigateToItemMaster}
        />
      )
    }
    if (detailScreen.type === 'item-master') {
      return (
        <ItemMasterScreen
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onNavigateToItemCreate={() => navigateToItemCreate()}
          onNavigateToItemEdit={(itemId) => navigateToItemCreate(itemId)}
        />
      )
    }
    if (detailScreen.type === 'item-create') {
      return (
        <ItemCreateScreen
          currentBusinessId={currentBusinessId}
          itemId={detailScreen.itemId}
          onBack={navigateBack}
        />
      )
    }
    if (detailScreen.type === 'invoice-create') {
      return (
        <InvoiceCreateScreen
          orderId={detailScreen.orderId}
          connectionId={detailScreen.connectionId}
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
          onInvoiceCreated={(invoiceId) => {
            // Replace InvoiceCreateScreen with InvoiceViewScreen
            setNavigationStack(stack => [
              ...stack.slice(0, -1),
              { type: 'invoice-view', invoiceId },
            ])
          }}
        />
      )
    }
    if (detailScreen.type === 'invoice-view') {
      return (
        <InvoiceViewScreen
          invoiceId={detailScreen.invoiceId}
          currentBusinessId={currentBusinessId}
          onBack={navigateBack}
        />
      )
    }
    return (
      <ConnectionDetailScreen
        connectionId={detailScreen.connectionId}
        currentBusinessId={currentBusinessId}
        onBack={navigateBack}
        onNavigateToPaymentTermsSetup={navigateToPaymentTermsSetup}
        onOpenOrderDetail={navigateToConnectionOrderDetail}
        onNavigateToPlaceOrder={navigateToPlaceOrder}
        onNavigateToTrustProfile={(targetBusinessId, connectionId) =>
          navigateToTrustProfile(targetBusinessId, { action: 'view-connection', audience: 'connection-review' }, undefined, connectionId)
        }
      />
    )
  }

  return (
    <TeamRoleProvider>
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: 24,
          gap: 16,
        }}>
          <p style={{ fontSize: 16, textAlign: 'center', color: 'var(--text-primary)' }}>
            Something went wrong. Please restart the app.
          </p>
          <button
            onClick={resetError}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              background: 'var(--accent-blue)',
              color: '#fff',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}
    >
      <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-screen)' }}>
        {screen.type === 'tab' ? (
          <TabShell
            currentBusinessId={currentBusinessId}
            activeTabScreen={screen}
            hasUnreadConnections={hasUnreadConnections}
            unreadConnectionIds={unreadConnectionIds}
            onNavigateToTab={navigateToTab}
            onNavigateToTabWithFilter={navigateToTabWithFilter}
            onNavigateToConnection={navigateToConnection}
            onNavigateToOrderDetail={navigateToOrderDetail}
            onNavigateToIssueDetail={navigateToIssueDetail}
            onNavigateToAddConnection={navigateToManageConnections}
            onNavigateToIncomingRequests={navigateToIncomingRequests}
            onNavigateToManageConnectionsReceived={navigateToManageConnectionsReceived}
            onLogout={handleLogout}
            onNavigateToNotifications={navigateToNotifications}
            onNavigateToProfileNotifications={navigateToProfileNotifications}
            onNavigateToProfileAccount={navigateToProfileAccount}
            onNavigateToProfileSupport={navigateToProfileSupport}
            onNavigateToManageDocuments={navigateToManageDocuments}
            onNavigateToManageMembers={navigateToManageMembers}
            onNavigateToTeam={navigateToTeam}
            onNavigateToTrustProfile={navigateToTrustProfile}
            onNavigateToSupplierDocs={navigateToSupplierDocs}
            onNavigateToPlaceOrder={navigateToPlaceOrder}
            onNavigateToInvoiceSettings={navigateToInvoiceSettings}
          />
        ) : (
          <div className="h-full flex flex-col">{renderDetailScreen(screen)}</div>
        )}
      </div>
    </Sentry.ErrorBoundary>
    </TeamRoleProvider>
  )
}

function TabShell({
  currentBusinessId,
  activeTabScreen,
  hasUnreadConnections,
  unreadConnectionIds,
  onNavigateToTab,
  onNavigateToTabWithFilter,
  onNavigateToConnection,
  onNavigateToOrderDetail,
  onNavigateToIssueDetail,
  onNavigateToAddConnection,
  onNavigateToIncomingRequests,
  onNavigateToManageConnectionsReceived,
  onLogout,
  onNavigateToNotifications,
  onNavigateToProfileNotifications,
  onNavigateToProfileAccount,
  onNavigateToProfileSupport,
  onNavigateToManageDocuments,
  onNavigateToManageMembers,
  onNavigateToTeam,
  onNavigateToTrustProfile,
  onNavigateToSupplierDocs,
  onNavigateToPlaceOrder,
  onNavigateToInvoiceSettings,
}: {
  currentBusinessId: string
  activeTabScreen: TabShellScreen
  hasUnreadConnections: boolean
  unreadConnectionIds: Set<string>
  onNavigateToTab: (tab: Tab) => void
  onNavigateToTabWithFilter: (tab: Tab, filter?: string, ordersParams?: OrdersTabParams) => void
  onNavigateToConnection: (connectionId: string, orderId?: string) => void
  onNavigateToOrderDetail: (orderId: string, connectionId: string) => void
  onNavigateToIssueDetail: (connectionId: string, orderId: string, issueId: string) => void
  onNavigateToAddConnection: () => void
  onNavigateToIncomingRequests: () => void
  onNavigateToManageConnectionsReceived: () => void
  onLogout: () => Promise<void>
  onNavigateToNotifications: () => void
  onNavigateToProfileNotifications: () => void
  onNavigateToProfileAccount: () => void
  onNavigateToProfileSupport: () => void
  onNavigateToManageDocuments?: () => void
  onNavigateToManageMembers?: () => void
  onNavigateToTeam?: () => void
  onNavigateToTrustProfile?: (targetBusinessId: string, screenMode: TrustProfileScreenMode, connectionRequestId?: string, connectionId?: string) => void
  onNavigateToSupplierDocs?: (targetBusinessId: string, connectionId: string) => void
  onNavigateToPlaceOrder: (prefilledConnectionId?: string | null) => void
  onNavigateToInvoiceSettings?: () => void
}) {
  return (
    <>
      <div className="flex-1 overflow-auto pb-16">
        {activeTabScreen.tab === 'dashboard' ? (
          <DashboardScreen
            currentBusinessId={currentBusinessId}
            isActive
            onNavigateToOrders={(filter, ordersParams) => onNavigateToTabWithFilter('orders', filter, ordersParams)}
            onNavigateToConnection={onNavigateToConnection}
            onNavigateToProfile={() => onNavigateToTab('profile')}
            onNavigateToConnections={(filter) => onNavigateToTabWithFilter('connections', filter)}
            onNavigateToAttention={(filter) => onNavigateToTabWithFilter('attention', filter)}
            onNavigateToManageConnections={onNavigateToManageConnectionsReceived}
            onNavigateToSupplierDocs={onNavigateToSupplierDocs}
          />
        ) : activeTabScreen.tab === 'attention' ? (
          <AttentionScreen
            currentBusinessId={currentBusinessId}
            isActive
            onNavigateToIssue={onNavigateToIssueDetail}
          />
        ) : activeTabScreen.tab === 'connections' ? (
          <ConnectionsScreen
            currentBusinessId={currentBusinessId}
            isActive
            onSelectConnection={onNavigateToConnection}
            onAddConnection={onNavigateToAddConnection}
            onNavigateToIncomingRequests={onNavigateToIncomingRequests}
            unreadConnectionIds={unreadConnectionIds}
            onNavigateToPlaceOrder={onNavigateToPlaceOrder}
          />
        ) : activeTabScreen.tab === 'orders' ? (
          <OrdersScreen
            currentBusinessId={currentBusinessId}
            isActive
            onSelectOrder={onNavigateToOrderDetail}
            initialFilter={activeTabScreen.filter}
            initialParams={activeTabScreen.ordersParams}
            onNavigateToPlaceOrder={onNavigateToPlaceOrder}
          />
        ) : (
          <ProfileScreen
            currentBusinessId={currentBusinessId}
            onLogout={onLogout}
            onNavigateToNotifications={onNavigateToNotifications}
            onNavigateToNotificationSettings={onNavigateToProfileNotifications}
            onNavigateToAccount={onNavigateToProfileAccount}
            onNavigateToSupport={onNavigateToProfileSupport}
            onNavigateToManageDocuments={onNavigateToManageDocuments}
            onNavigateToMembers={onNavigateToManageMembers}
            onNavigateToTeam={onNavigateToTeam}
            onNavigateToSelfTrustProfile={
              onNavigateToTrustProfile
                ? () => onNavigateToTrustProfile(currentBusinessId, { action: 'view-connection', audience: 'self-profile-ready' })
                : undefined
            }
            onNavigateToInvoiceSettings={onNavigateToInvoiceSettings}
          />
        )}
      </div>

      <div className="bottom-nav fixed bottom-0 left-0 right-0" style={{ backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border-light)' }}>
        <div className="flex items-center justify-around" style={{ height: '80px', paddingTop: '10px' }}>
          <TabButton
            label="Home"
            icon={<House weight="regular" size={22} />}
            active={activeTabScreen.tab === 'dashboard'}
            onClick={() => onNavigateToTab('dashboard')}
          />
          <TabButton
            label="Connections"
            icon={<Users weight="regular" size={22} />}
            active={activeTabScreen.tab === 'connections'}
            onClick={() => onNavigateToTab('connections')}
            hasUnread={hasUnreadConnections}
          />
          <TabButton
            label="Orders"
            icon={<Package weight="regular" size={22} />}
            active={activeTabScreen.tab === 'orders'}
            onClick={() => onNavigateToTab('orders')}
          />
          <TabButton
            label="Disputes"
            icon={<Bell weight="regular" size={22} />}
            active={activeTabScreen.tab === 'attention'}
            onClick={() => onNavigateToTab('attention')}
          />
          <TabButton
            label="Profile"
            icon={<User weight="regular" size={22} />}
            active={activeTabScreen.tab === 'profile'}
            onClick={() => onNavigateToTab('profile')}
          />
        </div>
      </div>
    </>
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

import { useEffect, useState } from 'react'
import { dataStore } from '@/lib/data-store'
import { formatDistanceToNow } from 'date-fns'
import type { Notification } from '@/lib/types'
import { CaretLeft } from '@phosphor-icons/react'

interface Props {
  currentBusinessId: string
  onBack: () => void
  onNavigateToConnection: (connectionId: string, orderId?: string) => void
}

export function NotificationHistoryScreen({ currentBusinessId, onBack, onNavigateToConnection }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const loadNotifications = async () => {
    setLoading(true)
    const allNotifications = await dataStore.getNotificationsByBusinessId(currentBusinessId)
    setNotifications(allNotifications)
    setLoading(false)
  }

  useEffect(() => {
    loadNotifications()
  }, [currentBusinessId])

  const handleMarkAllAsRead = async () => {
    await dataStore.markAllNotificationsAsRead(currentBusinessId)
    await loadNotifications()
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.readAt) {
      await dataStore.markNotificationAsRead(notification.id)
      await loadNotifications()
    }
    
    // Navigate to the relevant connection/order
    const orderId = ['OrderPlaced', 'OrderDispatched', 'OrderDeclined', 'PaymentRecorded', 'IssueRaised'].includes(notification.type)
      ? notification.relatedEntityId
      : undefined
    
    onNavigateToConnection(notification.connectionId, orderId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const unreadCount = notifications.filter(n => !n.readAt).length

  return (
    <div className="h-full flex flex-col">
      <div className="sticky top-0 bg-white z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-11 flex items-center px-4 gap-2">
          <button onClick={onBack} className="flex items-center text-foreground hover:text-muted-foreground">
            <CaretLeft size={20} weight="regular" />
          </button>
          <h1 className="text-[17px] text-foreground font-normal flex-1">Notifications</h1>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="text-[13px] text-foreground hover:text-muted-foreground"
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((notification) => {
              const isUnread = !notification.readAt
              return (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/30 ${
                    isUnread ? 'bg-muted/20' : ''
                  }`}
                  style={isUnread ? { borderLeft: '3px solid #E8A020' } : {}}
                >
                  <p className={`text-[14px] leading-snug mb-1 ${isUnread ? 'font-medium text-foreground' : 'text-foreground'}`}>
                    {notification.message}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

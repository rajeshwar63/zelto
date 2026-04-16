// Service worker for Web Push notifications (iOS PWA + desktop browsers)
// This file must be served from the root scope (/) for push to work.

self.addEventListener('push', (event) => {
  self.registration.showNotification('[DEBUG] push fired', { body: 'has data: ' + !!event.data });
  let data = { title: 'Zelto', body: '' }

  if (event.data) {
    try {
      data = event.data.json()
    } catch (_e) {
      data.body = event.data.text()
    }
  }

  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/favicon-96x96.png',
    tag: data.tag || 'zelto-notification',
    renotify: true,
    data: data.data || {},
  }

  self.registration.showNotification('[DEBUG] about to call showNotification', { body: JSON.stringify(data).slice(0, 100) });
  event.waitUntil(
    self.registration.showNotification(data.title || 'Zelto', options).then(() => {
      // Notify open client windows so they can refresh in-app state
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
        for (const client of cls) {
          client.postMessage({ type: 'PUSH_RECEIVED', data: data.data || {} })
        }
      })
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const notifData = event.notification.data || {}
  const notifType = notifData.type || ''
  const entityId = notifData.related_entity_id || ''

  // Determine the deep-link URL based on notification type
  const orderTypes = [
    'OrderPlaced',
    'OrderAccepted',
    'OrderDispatched',
    'OrderDelivered',
    'OrderCancelled',
  ]
  const connectionTypes = ['ConnectionAccepted', 'ConnectionRequested']

  let targetUrl = '/'
  if (orderTypes.includes(notifType) && entityId) {
    targetUrl = '/orders/' + entityId
  } else if (connectionTypes.includes(notifType)) {
    targetUrl = '/connections'
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing window and navigate it to the target URL
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then((focused) => focused.navigate(targetUrl))
        }
      }
      // Otherwise open a new window at the target URL
      return clients.openWindow(targetUrl)
    }),
  )
})

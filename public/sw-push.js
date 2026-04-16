// Service worker for Web Push notifications (iOS PWA + desktop browsers)
// This file must be served from the root scope (/) for push to work.

self.addEventListener('push', (event) => {
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

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing window if available
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      // Otherwise open a new one
      return clients.openWindow('/')
    }),
  )
})

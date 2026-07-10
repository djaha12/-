/* Service worker Ателье (M11): только Web Push — без offline-кэша,
   чтобы не устаревали страницы. Обновляется сразу (skipWaiting). */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  // userVisibleOnly обязывает что-то показать даже на пустой payload
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data = { title: event.data.text() }
    }
  }
  const title = data.title || 'Ателье'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client
            .focus()
            .then((c) => (url && 'navigate' in c ? c.navigate(url) : c))
        }
      }
      return self.clients.openWindow(url || '/')
    }),
  )
})

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'TrackMyRead';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    data: data,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      if (windowClients.length > 0) {
        return windowClients[0].focus();
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

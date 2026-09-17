self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'TrackMyRead', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'TrackMyRead';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
    data: data,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// F-22: keep this mapping in sync with getDestination() in src/pages/NotificationsPage.jsx —
// a service worker cannot import from src/, so the mapping is duplicated here.
function urlForNotification(d) {
  d = d || {};
  switch (d.type) {
    case 'new_follower':
    case 'post_liked':
    case 'post_commented':      return d.actor_id ? `/profile/${d.actor_id}` : '/notifications';
    case 'book_completed':
    case 'book_added':          return '/home';
    case 'reading_streak_reminder': return '/insights';
    case 'group_invite':
    case 'group_join_request':
    case 'group_join_approved': return d.group_id ? `/groups/${d.group_id}` : '/groups';
    case 'group_join_rejected': return '/groups';
    default:                    return '/notifications';   // admin_broadcast and anything unknown: the inbox shows the message
  }
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(urlForNotification(event.notification.data), self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        await w.focus();
        if ('navigate' in w) { try { await w.navigate(url); return; } catch { /* uncontrolled client */ } }
      }
    }
    await self.clients.openWindow(url);
  })());
});

// Service Worker for Native Web Push and Offline Mobile Shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const options = {
      body: payload.body || 'You have a new operational task assigned.',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      vibrate: [150, 50, 150],
      tag: payload.taskId || 'task-update',
      renotify: true,
      data: {
        url: payload.url || '/employee',
        taskId: payload.taskId,
      },
      actions: [
        { action: 'open', title: 'Open Task' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    event.waitUntil(
      self.registration.showNotification(payload.title || 'Task Assigned', options)
    );
  } catch (err) {
    console.error('Service worker push event error:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/employee';

  if (event.action === 'dismiss') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const targetPath = targetUrl.split('?')[0];
      for (const client of clientList) {
        if (client.url.includes(targetPath) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Service Worker for handling background notifications
// This runs in the background and can show notifications even when the app is closed

self.addEventListener('install', (event) => {
  console.log('Notification Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Notification Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification);
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  // Handle different actions
  if (action === 'accept' && data.type === 'ride_request') {
    // Handle ride request acceptance
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          // Send message to the main app
          clients[0].postMessage({
            type: 'ACCEPT_RIDE_REQUEST',
            rideId: data.rideId
          });
          return clients[0].focus();
        } else {
          // Open the app if no client is available
          return self.clients.openWindow(data.url || '/');
        }
      })
    );
  } else if (action === 'reply' && data.type === 'message') {
    // Handle message reply
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({
            type: 'OPEN_CHAT',
            rideId: data.rideId
          });
          return clients[0].focus();
        } else {
          return self.clients.openWindow(data.url || '/');
        }
      })
    );
  } else if (action === 'view' || !action) {
    // Default action - open the relevant page
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          // Focus existing window and navigate
          clients[0].postMessage({
            type: 'NAVIGATE',
            url: data.url || '/'
          });
          return clients[0].focus();
        } else {
          // Open new window
          return self.clients.openWindow(data.url || '/');
        }
      })
    );
  }
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event.notification);
  
  // Track notification dismissal if needed
  const data = event.notification.data || {};
  
  // You can send analytics or update read status here
  if (data.type === 'message') {
    // Mark message as seen
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({
            type: 'MARK_MESSAGE_SEEN',
            rideId: data.rideId
          });
        }
      })
    );
  }
});

// Handle background sync for sending messages while offline
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-message-sync') {
    event.waitUntil(syncMessages());
  }
});

// Handle push messages (for future server-sent notifications)
self.addEventListener('push', (event) => {
  console.log('Push message received:', event);
  
  if (!event.data) {
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('Error parsing push data:', e);
    return;
  }

  const title = data.title || 'OnGoPool';
  const options = {
    body: data.body || 'New notification',
    icon: data.icon || '/youware-icon-192x192.png',
    badge: '/youware-icon-72x72.png',
    tag: data.tag || 'default',
    data: data.data || {},
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Sync messages when back online
async function syncMessages() {
  try {
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      clients[0].postMessage({
        type: 'SYNC_OFFLINE_MESSAGES'
      });
    }
  } catch (error) {
    console.error('Error syncing messages:', error);
  }
}

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SHOW_NOTIFICATION':
      showNotification(payload);
      break;
    case 'CLEAR_NOTIFICATIONS':
      clearNotifications(payload.tag);
      break;
    case 'UPDATE_BADGE':
      updateBadge(payload.count);
      break;
    default:
      console.log('Unknown message type:', type);
  }
});

// Show notification from main thread
async function showNotification(notificationData) {
  const { title, options } = notificationData;
  
  try {
    await self.registration.showNotification(title, options);
  } catch (error) {
    console.error('Error showing notification:', error);
  }
}

// Clear notifications by tag
async function clearNotifications(tag) {
  try {
    const notifications = await self.registration.getNotifications({ tag });
    notifications.forEach(notification => notification.close());
  } catch (error) {
    console.error('Error clearing notifications:', error);
  }
}

// Update badge count (for future PWA features)
function updateBadge(count) {
  if ('setAppBadge' in navigator) {
    navigator.setAppBadge(count);
  }
}

// Handle background tasks
self.addEventListener('backgroundfetch', (event) => {
  console.log('Background fetch:', event);
  // Handle background data fetching if needed
});

// Periodic background sync (for future features)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-notifications') {
    event.waitUntil(updateNotifications());
  }
});

async function updateNotifications() {
  // Fetch latest ride updates, messages, etc. in the background
  // This would sync with your backend API
  console.log('Updating notifications in background');
}
/* Service worker: shows push notifications and routes taps back into the app. */
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Lynq', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Lynq', {
      body: data.body || '新しいメッセージがあります',
      tag: data.room ? `room-${data.room}` : undefined,
      renotify: !!data.room,
      icon: '/icon-192.png',
      badge: '/badge.png',
      timestamp: data.ts || Date.now(),
      vibrate: data.call ? [200, 100, 200, 100, 200] : [80],
      requireInteraction: !!data.call,
      data: { room: data.room || null },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const room = event.notification.data && event.notification.data.room;
  const url = room ? `/?r=${encodeURIComponent(room)}` : '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
    if (client) {
      await client.focus();
      if (room) client.postMessage({ type: 'open', room });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// Browsers may rotate a subscription; hand the new one to the server.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const old = event.oldSubscription;
    const key = old && old.options && old.options.applicationServerKey;
    const sub = event.newSubscription
      || (key && await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    if (!sub || !old) return;
    await fetch('/api/push/renew', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: sub.toJSON() }),
    });
  })());
});

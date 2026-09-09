'use strict';
/* ===== VaultOne Service Worker — background reminder notifications ===== */

const SW_VERSION = 'v1';

// Map of scheduled timers: reminderKey -> timeoutId
const _timers = new Map();

function reminderKey(r) {
  return r.id + '|' + r.date + 'T' + (r.time || '09:00');
}

function scheduleNotification(r) {
  const key = reminderKey(r);
  // Cancel any existing timer for this key
  if (_timers.has(key)) { clearTimeout(_timers.get(key)); _timers.delete(key); }

  const due = new Date(`${r.date}T${r.time || '09:00'}`);
  if (isNaN(due.getTime())) return;
  const delay = due.getTime() - Date.now();

  if (delay < 0) {
    // Already overdue — fire immediately if within last 10 minutes
    if (delay >= -600000) {
      self.registration.showNotification(r.title || 'Reminder', {
        body: r.description || `Due: ${r.date} ${r.time || '09:00'}`,
        icon: 'VaultOne.png',
        badge: 'VaultOne.png',
        tag: key,
        renotify: false,
        data: { reminderId: r.id }
      }).catch(() => {});
    }
    return;
  }

  const id = setTimeout(() => {
    _timers.delete(key);
    self.registration.showNotification(r.title || 'Reminder', {
      body: r.description || `Due: ${r.date} ${r.time || '09:00'}`,
      icon: 'VaultOne.png',
      badge: 'VaultOne.png',
      tag: key,
      renotify: false,
      data: { reminderId: r.id }
    }).catch(() => {});
  }, delay);

  _timers.set(key, id);
}

function cancelNotification(r) {
  const key = reminderKey(r);
  if (_timers.has(key)) { clearTimeout(_timers.get(key)); _timers.delete(key); }
  // Also dismiss any visible notification with this tag
  self.registration.getNotifications({ tag: key }).then(notifs => notifs.forEach(n => n.close())).catch(() => {});
}

// ── Message handler (called from page via postMessage) ──────────────────────
self.addEventListener('message', e => {
  const { type, reminder, reminders } = e.data || {};

  if (type === 'SCHEDULE' && reminder) {
    scheduleNotification(reminder);
  }
  if (type === 'CANCEL' && reminder) {
    cancelNotification(reminder);
  }
  // Bulk reschedule — sent on page load with all pending reminders
  if (type === 'SCHEDULE_ALL' && Array.isArray(reminders)) {
    // Clear all existing timers first
    _timers.forEach(id => clearTimeout(id));
    _timers.clear();
    reminders.forEach(scheduleNotification);
  }
});

// ── Notification click — focus the app tab ──────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('VaultOne') || c.url.includes('iVault') || c.url.includes('index')) {
          return c.focus();
        }
      }
      return clients.openWindow('index.html');
    })
  );
});

// ── Install / activate ───────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// Service Worker for Research Agent PWA
// Version 1.0.2 - Fixed development file caching

const CACHE_NAME = 'research-agent-v1.0.2';
const RUNTIME_CACHE = 'runtime-cache-v1.0.2';

// Assets to cache on install (critical for offline functionality)
const STATIC_ASSETS = [
  '/offline.html',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      // Cache files individually to avoid one failure blocking all
      return Promise.allSettled(
        STATIC_ASSETS.map(url => 
          cache.add(url).catch(err => {
            console.warn(`[SW] Failed to cache ${url}:`, err);
            return null;
          })
        )
      );
    }).then(() => {
      console.log('[SW] Service worker installed');
      // Force the waiting service worker to become the active service worker
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - network-first strategy for API calls, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip caching for development files (Vite dev server files)
  // These include .tsx, .ts, .jsx, .js source files and Vite HMR requests
  if (url.pathname.includes('/src/') || 
      url.pathname.includes('/@') ||
      url.pathname.includes('?import') ||
      url.searchParams.has('t') ||
      url.pathname.endsWith('.tsx') ||
      url.pathname.endsWith('.ts') ||
      url.pathname.endsWith('.jsx')) {
    // Let the browser handle these normally (no caching)
    return;
  }

  // Network-first strategy for API calls (Lambda endpoints)
  if (url.pathname.startsWith('/chat') || 
      url.pathname.startsWith('/search') ||
      url.pathname.startsWith('/planning') ||
      url.pathname.includes('lambda-url') ||
      url.hostname.includes('lambda-url')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache API responses (they're dynamic and personalized)
          return response;
        })
        .catch((error) => {
          console.error('[SW] API request failed:', error);
          // Return offline fallback for API errors
          return new Response(
            JSON.stringify({ error: 'You are offline. Please check your connection.' }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // Cache-first strategy for static assets (images, fonts, CSS, JS)
  if (request.destination === 'image' || 
      request.destination === 'font' ||
      request.destination === 'style' ||
      request.destination === 'script') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        
        return fetch(request).then((response) => {
          // Cache the fetched resource for future use
          return caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Network-first with cache fallback for HTML pages
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful HTML responses
        if (response.ok && request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(request).then((cached) => {
          if (cached) {
            return cached;
          }
          
          // Return offline page if no cache available
          return caches.match('/offline.html').then((fallback) => {
            if (fallback) {
              return fallback;
            }
            
            // Last resort: inline offline message
            return new Response(
              `<!DOCTYPE html>
<html><head><title>Offline</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#667eea;color:#fff;text-align:center;padding:20px}h1{font-size:2em;margin-bottom:0.5em}</style>
</head><body><div><h1>📡 You're Offline</h1><p>No internet connection detected.</p><p>Please check your network and try again.</p>
<button onclick="location.reload()" style="margin-top:20px;padding:12px 24px;font-size:16px;background:#fff;color:#667eea;border:none;border-radius:8px;cursor:pointer">Retry</button></div></body></html>`,
              { 
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/html' }
              }
            );
          });
        });
      })
  );
});

// Message event - handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        return self.clients.matchAll();
      }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'CACHE_CLEARED' });
        });
      })
    );
  }
});

// Push notification support (for future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'New notification from Research Agent',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'research-agent-notification',
      requireInteraction: false
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Research Agent', options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

console.log('[SW] Service worker loaded');

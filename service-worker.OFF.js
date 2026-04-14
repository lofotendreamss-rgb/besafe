const CACHE_NAME = "besafe-cache-v3";

const STATIC_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/style.css",

  // Tesseract lokaliai
  "/js/services/ocr/lib/tesseract.min.js",
  "/js/app/receipt_ocr.js",

  // App
  "/js/app/app.js",
  "/js/language.js",
  "/js/notification.center.js",
  "/js/store.selector.js",
  "/js/stores.manager.js",
];

/* ========================= */
/* INSTALL                   */
/* ========================= */

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // addAll sustoja jei vienas failas nerastas,
      // todėl kiekvieną cache'iname atskirai
      return Promise.allSettled(
        STATIC_FILES.map(url =>
          cache.add(url).catch(err => {
            console.warn("[SW] Could not cache:", url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

/* ========================= */
/* ACTIVATE                  */
/* ========================= */

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

/* ========================= */
/* FETCH                     */
/* ========================= */

self.addEventListener("fetch", event => {
  const request = event.request;

  // Tik GET užklausos
  if (request.method !== "GET") return;

  // HTML navigacija — network first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Visa kita — cache first, tada network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

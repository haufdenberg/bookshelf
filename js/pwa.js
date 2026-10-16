// ============================================================================
// pwa.js — service worker + manifest registration for "installable app" /
// offline-caching behavior
//
// Both the service worker and the manifest are generated in-memory as Blob
// URLs rather than separate files, so this works as a single drop-in script
// with nothing extra to host. Everything here is a no-op when the page is
// opened directly from disk (file://), since service workers and most
// manifest features require a real origin.
//
// Depends on: nothing — self-contained IIFE, runs immediately on load.
// Used by:    nothing calls into this; it just runs once when the page loads.
// ============================================================================

(function(){
  // Only works when served over HTTP(S), not file://
  if('serviceWorker' in navigator && location.protocol !== 'file:'){
    // Generate and register a service worker as a blob URL
    var swCode = [
      "var CACHE='bookshelf-v1';",
      "var ASSETS=['/'];",
      "self.addEventListener('install',function(e){",
      "  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS);}));",
      "  self.skipWaiting();",
      "});",
      "self.addEventListener('activate',function(e){",
      "  e.waitUntil(caches.keys().then(function(keys){",
      "    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));",
      "  }));",
      "  self.clients.claim();",
      "});",
      "self.addEventListener('fetch',function(e){",
      "  if(e.request.method!=='GET')return;",
      "  e.respondWith(",
      "    caches.match(e.request).then(function(cached){",
      "      if(cached)return cached;",
      "      return fetch(e.request).then(function(resp){",
      "        if(!resp||resp.status!==200||resp.type==='opaque')return resp;",
      "        var clone=resp.clone();",
      "        caches.open(CACHE).then(function(c){c.put(e.request,clone);});",
      "        return resp;",
      "      }).catch(function(){return cached;});",
      "    })",
      "  );",
      "});"
    ].join('\n');
    var swBlob = new Blob([swCode], {type:'application/javascript'});
    var swUrl = URL.createObjectURL(swBlob);
    navigator.serviceWorker.register(swUrl, {scope:'/'})
      .catch(function(e){ console.log('SW registration failed (expected on file://):', e); });
  }

  // Generate manifest.json dynamically and inject link tag
  // (works when deployed; ignored on file://)
  if(location.protocol !== 'file:'){
    var manifest = {
      name: 'Bookshelf — Personal Library',
      short_name: 'Bookshelf',
      description: 'Track your books, series, wishlist and more.',
      start_url: './',
      display: 'standalone',
      background_color: '#1C1A17',
      theme_color: '#1C1A17',
      orientation: 'portrait-primary',
      icons: [
        {
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='80' fill='%231C1A17'/%3E%3Cpath d='M148 120 C132 120 120 132 120 148 L120 380 C120 388 126 394 134 394 L360 394 C368 394 374 388 374 380 L374 148 C374 132 362 120 346 120 Z' fill='none' stroke='%23F7F3ED' stroke-width='12'/%3E%3Cpath d='M148 120 L148 394' stroke='%23A84332' stroke-width='18'/%3E%3Ctext x='190' y='290' font-family='Georgia,serif' font-size='110' fill='%23F7F3ED' font-weight='bold'%3EB%3C/text%3E%3C/svg%3E",
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'any maskable'
        }
      ]
    };
    var manifestBlob = new Blob([JSON.stringify(manifest)], {type:'application/manifest+json'});
    var manifestUrl = URL.createObjectURL(manifestBlob);
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = manifestUrl;
    document.head.appendChild(link);
  }
})();

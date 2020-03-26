// ==UserScript==
// @name         ServiceWorkerUnregister.user.js
// @description  Uninstall the installed ServiceWorker.
//               If ServiceWorker was installed, it clears the cache.
//               You can use it as a whitelist by setting @exclude.
// @include      https://*/*
// @exclude      https://example.com/*
// @version      0.1.0
// @author       toshi (https://github.com/k08045kk)
// @license      MIT License
// @see          https://opensource.org/licenses/MIT
// @grant        none
// ==/UserScript==

(function() {
  var cacheDelete = function() {
    if ('caches' in window) {
      window.caches.keys().then(function(keys) {
        Promise.all(keys.map((key) => { return window.caches.delete(key); })).then(() => {
          //console.log('cache delete.');
        });
      });
    }
  };
  var unregister = function() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          registration.unregister();
          //console.log('serviceworker unregister.');
          cacheDelete();
        }
      });
    }
  };
  window.addEventListener('load', unregister);
  window.addEventListener('beforeunload', unregister);
  window.addEventListener('unload', unregister);
})();
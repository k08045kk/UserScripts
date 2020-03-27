// ==UserScript==
// @name         RejectServiceWorkers.user.js
// @description  Reject to register a ServiceWorker.
//               Uninstall ServiceWorker that has been installed.
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
  // Reject to register a ServiceWorker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register = function(scriptURL, options) {
      return new Promise(function(resolve, reject) {
        reject(new Error('Reject to register a ServiceWorker.'));
        //console.log('Reject to register a ServiceWorker.');
      });
    };
  }
  
  // Uninstalling an Installed ServiceWorker
  const cacheDelete = function() {
    if ('caches' in window) {
      window.caches.keys().then(function(keys) {
        Promise.all(keys.map((key) => { return window.caches.delete(key); })).then(() => {
          //console.log('caches delete.');
        });
      });
    }
  };
  const unregister = function() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
          registration.unregister();
          //console.log('ServiceWorker unregister.');
          
          cacheDelete();
        }
      });
    }
  };
  window.addEventListener('load', unregister);
  window.addEventListener('beforeunload', unregister);
})();
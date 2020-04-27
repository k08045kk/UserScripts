// ==UserScript==
// @name         RejectServiceWorkers.user.js
// @description  Reject to register a ServiceWorker.
//               Unregister the registered Service Worker.
//               If ServiceWorker was registered, it clears the cache.
//               You can use it as a whitelist by setting @exclude.
//               It is not possible to completely reject registration at the timing of executing the user script.
// @run-at       document-start
// @include      https://*/*
// @exclude      https://example.com/*
// @author       toshi (https://github.com/k08045kk)
// @license      MIT License
// @see          https://opensource.org/licenses/MIT
// @version      0.1.1
// @see          0.1.0 - 20200328 - 初版
// @see          0.1.1 - 20200415 - 修正
// @see          https://www.bugbugnow.net/2020/03/Reject-to-register-a-ServiceWorker.html
// @grant        none
// ==/UserScript==

(function() {
  // Reject to register a ServiceWorker
  if ('serviceWorker' in navigator) {
    ServiceWorkerContainer.prototype.register = function(scriptURL, options) {
      return new Promise((resolve, reject) => {
        //console.log('Reject to register a ServiceWorker.');
        reject(new Error('Reject to register a ServiceWorker.'));
      });
    };
  }
  
  // Unregister the registered Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (let i=0; i<registrations.length; i++) {
        registrations[i].unregister();
        //console.log('ServiceWorker unregister.');
      }
      if (registrations.length != 0) {
        window.caches.keys().then((keys) => {
          Promise.all(keys.map((key) => { return window.caches.delete(key); })).then(() => {
            //console.log('caches delete.');
          });
        });
      }
    });
  }
})();
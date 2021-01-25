// ==UserScript==
// @name        RejectServiceWorker
// @description Reject to register a ServiceWorker.
//              Unregister the registered Service Worker.
//              If ServiceWorker was registered, it clears the cache.
//              You can use it as a whitelist by setting @exclude.
//              It is not possible to completely reject registration at the timing of executing the user script.
// @see         ↓↓↓ Add target page URL ↓↓↓
// @include     https://*/*
// @exclude     https://example.com/*
// @see         ↑↑↑ Add target page URL ↑↑↑
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License
// @see         https://opensource.org/licenses/MIT
// @see         https://github.com/k08045kk/UserScripts/RejectServiceWorker
// @see         https://www.bugbugnow.net/2020/03/Reject-to-register-a-ServiceWorker.html
// @version     0.2.1
// @see         0.1.0 - 20200328 - 初版
// @see         0.1.1 - 20200415 - 修正
// @see         0.2.0 - 20200926 - Greasemonkey対応（unsafeWindow経由でwindowのオブジェクトを書き換え）
// @see         0.2.1 - 20210125 - RejectServiceWorkers.user.js → RejectServiceWorker.user.js
// @run-at      document-start
// @grant       unsafeWindow
// ==/UserScript==

(function(w) {
  // Reject to register a ServiceWorker
  if ('serviceWorker' in navigator) {
    w.ServiceWorkerContainer.prototype.register = function(scriptURL, options) {
      return new Promise((resolve, reject) => {
        //console.log('Reject to register a ServiceWorker.');
        reject(new Error('Reject to register a ServiceWorker.'));
      });
    };
  }
  // Note: It may be registered before `document-start`.
  
  // Unregister the registered Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (registrations.length != 0) {
        for (let i=0; i<registrations.length; i++) {
          registrations[i].unregister();
          //console.log('ServiceWorker unregister.');
        }
        caches.keys().then((keys) => {
          Promise.all(keys.map((key) => { caches.delete(key); })).then(() => {
            //console.log('caches delete.');
          });
        });
      }
    });
  }
})(unsafeWindow || window);

// ==UserScript==
// @name        RejectServiceWorker
// @description Reject to register a ServiceWorker.
//              Unregister the registered Service Worker.
//              If ServiceWorker was registered, it clears the cache.
//              You can use it as a whitelist by setting @exclude.
//              It is not possible to completely reject registration at the timing of executing the user script.
// @note        ↓↓↓ Add target page URL ↓↓↓
// @include     https://*/*
// @exclude     https://example.com/*
// @note        ↑↑↑ Add target page URL ↑↑↑
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License | https://opensource.org/licenses/MIT
// @version     0.2.3
// @since       0.1.0 - 20200328 - 初版
// @since       0.1.1 - 20200415 - 修正
// @since       0.2.0 - 20200926 - Greasemonkey対応（unsafeWindow経由でwindowのオブジェクトを書き換え）
// @since       0.2.1 - 20210125 - RejectServiceWorkers.user.js → RejectServiceWorker.user.js
// @since       0.2.2 - 20210828 - comment メタデータの見直し
// @since       0.2.3 - 20211013 - comment 権限不足エラーの注意書きを追記
// @see         https://github.com/k08045kk/UserScripts
// @see         https://www.bugbugnow.net/2020/03/Reject-to-register-a-ServiceWorker.html
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
    // Note: It may be registered before `document-start`.
    // Note: A permission error occurs on the page accessing the register() Promise in Firefox.
    //       This is because the context script Promise is accessed from the page script.
    //       I can't figure out how to get around this in user scripts.
    //       The WebExtensions version works around this.
  }
  
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
// Note: It is not working on Firefox (Tampermonkey / Violetmonkey) because of the following error.
//       Error "Uncaught (in promise) DOMException: The operation is insecure."
//       Use it with Firefox (Greasemonkey) or Chrome (Tampermonkey / Violetmonkey).

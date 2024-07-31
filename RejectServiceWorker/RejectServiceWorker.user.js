// ==UserScript==
// @name        RejectServiceWorker
// @description Reject to register a service worker.
//              Reject to register new service worker by overwriting the register function.
//              If service worker was registered, it unregister the registered service worker.
//              If service worker was registered, it clears the cache.
//              You can use it as a whitelist by setting @exclude.
//              As long as user script execution timing is used, complete reject cannot be achieved.
// @note        ↓↓↓ Add target page URL ↓↓↓
// @include     https://*/*
// @exclude     https://example.com/*
// @note        ↑↑↑ Add target page URL ↑↑↑
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License | https://opensource.org/licenses/MIT
// @version     0.3.0
// @since       0.1.0 - 20200328 - 初版
// @since       0.1.1 - 20200415 - 修正
// @since       0.2.0 - 20200926 - Greasemonkey対応（unsafeWindow経由でwindowのオブジェクトを書き換え）
// @since       0.2.1 - 20210125 - RejectServiceWorkers.user.js → RejectServiceWorker.user.js
// @since       0.2.2 - 20210828 - comment メタデータの見直し
// @since       0.2.3 - 20211013 - comment 権限不足エラーの注意書きを追記
// @since       0.3.0 - 20240326 - Proxy 方式に対応（他、動作不可問題修正）
// @see         https://github.com/k08045kk/UserScripts
// @see         https://www.bugbugnow.net/2020/03/Reject-to-register-a-ServiceWorker.html
// @run-at      document-start
// @grant       unsafeWindow
// ==/UserScript==

;(async function(win) {
  let   isExec = false;
  try { isExec = !!navigator.serviceWorker; } catch {}
  if (  isExec === false) {
    // http environmental measures
    return;
  }
  
  // Reject to register a service worker
  const register = new Proxy(win.ServiceWorkerContainer.prototype.register, {
    apply: () => win.Promise.reject(new win.Error('Reject to register a service worker.')),
  });
  try {
    exportFunction(register, 
                   win.ServiceWorkerContainer.prototype, 
                   {defineAs: 'register'});
  } catch {
    win.ServiceWorkerContainer.prototype.register = register;
  }
  
  // Unregister the registered service worker
  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length) {
    // Unregister service worker
    const unregisterPromises = registrations.map(registration => registration.unregister());
    await Promise.all(unregisterPromises);
    
    // Delete all cache storage
    const keys = await caches.keys();
    const cacheDeletePromises = keys.map(key => caches.delete(key));
    await Promise.all(cacheDeletePromises);
  }
})(unsafeWindow || window);

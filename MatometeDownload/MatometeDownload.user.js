// ==UserScript==
// @name        Download_files_with_ZIP
// @name:en     Download files with ZIP
// @name:ja     ZIPでファイルをまとめてダウンロード
// @description     Use the [Alt+Shift+D] shortcut keys to download files with ZIP.
// @description:en  Use the [Alt+Shift+D] shortcut keys to download files with ZIP.
// @description:ja  [Alt+Shift+D]のショートカットキーでZIPでファイルをまとめてダウンロードします。
// @see         ↓要対象ページURL追加↓
// @@match      *://example.com/*
// @see         ↑要対象ページURL追加↑
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License
// @see         https://opensource.org/licenses/MIT
// @version     2.0.2
// @see         1.0.0 - 20211013 - 初版
// @see         2.0.0 - 20211015 - WebWorker対応（高速化対応）
// @require     https://cdn.jsdelivr.net/npm/hotkeys-js@3.8.1/dist/hotkeys.min.js
// @grant       GM.xmlHttpRequest
// ==/UserScript==

(function() {
  'use strict';
  
  // 進歩表示
  const root = document.createElement('div');
  const shadow = root.attachShadow({mode:'closed'});
  const box = document.createElement('div');
  box.setAttribute('style', `
    z-index: 2147483647;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,.7);
    color: #fff;
    font-size: 64px;
    font-family: monospace, monospace;
    white-space: pre;
  `);
  shadow.appendChild(box)
  const drawProgress = (text) => {
    if (!root.parentNode && text) {
      document.body.appendChild(root);
    }
    if (text) {
      box.textContent = text;
    } else if (root.parentNode) {
      root.remove();
    }
  };
  
  // 更新イベント
  const onDefaultUpdate = (arg) => {
    switch (arg.status) {
    case 'ready':
      drawProgress(' ');
      break;
    case 'download': 
      const len = (arg.urls.length+'').length;
      drawProgress('Download: '+(Array(len).join(' ')+arg.count).slice(-len)+'/'+arg.urls.length);
      break;
    case 'compress': 
      drawProgress('Compress: '+(Array(3).join(' ')+Math.floor(arg.percent)).slice(-3)+'%');
      break;
    case 'complate':
      drawProgress();
      break;
    }
  };
  
  // 完了イベント
  const onDefaultComplate = (arg) => {
    const second = Math.floor((arg.endtime - arg.starttime) / 1000);
    alert('Download complete\n\n'
         +arg.name+'\n'
         +arg.count+'/'+arg.urls.length+':'+arg.error+' | '+second+'s');
  };
  
  /**
   * ZIPダウンロード
   * @param {Object} arg - 引数
   * in     {string} arg.name - ZIPファイルのファイル名
   * in     {string[]} arg.urls - ダウンロードファイルのURL
   *                              または、Blob
   * in/out {string[]} arg.names - ダウンロードファイルのファイル名
   * in/out {Function} arg.onupdate - 更新時のコールバック関数（例：(arg) => {}）
   * in/out {Function} arg.oncomplate - 完了時のコールバック関数（例：(arg) => {}）
   *    out {string} arg.status - 進歩状態
   *    out {number} arg.count - ダウンロード件数
   *    out {number} arg.error - ダウンロード失敗件数
   *    out {number} arg.percent - 圧縮完了率
   *    out {Date} arg.starttime - 開始時間
   *    out {Date} arg.endtime - 終了時間
   * @return 実行有無
   *         同一ページ内での並列実行は許可されません。
   */
  let isRun = false;
  async function downloadZipAsync(arg) {
    // 並列実行を防止
    if (isRun) {
      return false;
    }
    isRun = true;
    
    // 前処理
    arg.status = 'ready';
    arg.starttime = Date.now();
    arg.onupdate = arg.onupdate || onDefaultUpdate;
    arg.oncomplate = arg.oncomplate || onDefaultComplate;
    arg.onupdate(arg);
    
    // WebWorker作成
    const code = `
      importScripts('https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.min.js');

      const zip = new JSZip();
      self.addEventListener('message', async function(event) {
        const data = event.data;
        switch (data.command) {
        case 'file':
          zip.file(data.name, data.buffer);
          break;
        case 'generate':
          const buffer = await zip.generateAsync({type:'arraybuffer'}, function(metadata) {
            self.postMessage({command:'progress', percent:metadata.percent});
          });
          self.postMessage({command:'complate', buffer:buffer}, [buffer]);
          break;
        }
      });
    `;
    const workerUrl = URL.createObjectURL(new Blob([code]));
    const worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    
    // ファイルのダウンロード
    arg.status = 'download';
    arg.count = 0;
    arg.error = 0;
    arg.onupdate(arg);
    const onDownload = (file) => {
      arg.status = 'download';
      arg.count++;
      !file.data && arg.error++;
      arg.onupdate(arg);
      if (file.name && file.data) {
        worker.postMessage({command:'file', name:file.name, buffer:file.data}, [file.data]);
      } else if (file.name) {
        worker.postMessage({command:'file', name:file.name, buffer:null});
      }
    };
    arg.names = arg.names || [];
    await Promise.all(arg.urls.map((url, i) => {
      if (url instanceof Blob) { url.name = url.name || ''+i; }
      const name = arg.names[i] = arg.names[i] || url.name || url.slice(url.lastIndexOf('/') + 1) || ''+i;
      return new Promise((resolve, reject) => {
        if (url instanceof Blob) {
          // ページの内部データ
          url.arrayBuffer().then((buffer) => {
            onDownload({name:name, data:buffer});
            resolve();
          });
        } else {
          // ページの外部データ
          GM.xmlHttpRequest({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            onload: function(xhr) {
              const isSuccess = 200 <= xhr.status && xhr.status < 300 || xhr.status === 304;
              onDownload({name:name, data:(isSuccess ? xhr.response : null)});
              resolve();
            },
            onerror: function() { onDownload({name:name, data:null}); resolve(); },
            onabort: function() { onDownload({name:name, data:null}); resolve(); },
            ontimeout: function() { onDownload({name:name, data:null}); resolve(); }
          });
        }
      });
    }));
    
    // ファイルの圧縮
    arg.status = 'compress';
    arg.percent = 0;
    arg.onupdate(arg);
    worker.addEventListener('message', function(event) {
      const data = event.data;
      switch (data.command) {
      case 'progress':
        arg.status = 'compress';
        arg.percent = data.percent;
        arg.onupdate(arg);
        break;
      case 'complate':
        // ZIPのダウンロード
        const dataUrl = URL.createObjectURL(new Blob([data.buffer]));
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = arg.name;
        a.dispatchEvent(new MouseEvent('click'));
        setTimeout(() => { URL.revokeObjectURL(dataUrl); }, 1E4); // 10s
        
        // 後処理
        setTimeout(() => {
          arg.status = 'complate';
          arg.endtime = Date.now();
          arg.onupdate(arg);
          arg.oncomplate(arg);
          isRun = false;
          worker.terminate();
        }, 0);
        break;
      }
    });
    worker.postMessage({command:'generate'});
    
    return true;
    
    // 備考：oncomplate()呼び出しから実際のダウンロードがブラウザ上で発生するまでに、
    //       僅かなタイムラグが発生する可能性があります。
    //       実際のダウンロードがブラウザで開始するまで、ページをクローズしないで下さい。
    // 備考：urlsのファイル名に重複がある場合、最後のファイルのみ保存します。
    //       namesを指定して明示的にファイル名を指示することで回避できます。
    // 備考：urlsにBlobを使用することができます。
    //       その場合、ファイル名は。nameプロパティの値を使用します。
    // 備考：ファイル名が見つからない場合、最終的にインデックスの数値を使用します。
    // 備考：データの取得に失敗した場合、空ファイルを保存します。
    //       これには、データ取得に失敗したことを明示的に示す意味合いがあります。
  };
  
  // ショートカットキー設定
  hotkeys('alt+shift+d', function(event, handler) {
    // ↓サイト毎で処理を追記↓
    if (location.hostname == 'example.com') {
      // ...
    } else {
      alert('Missing download settings');
    }
    // ↑サイト毎で処理を追記↑
  });
  
  //alert('Loading completed');
})();

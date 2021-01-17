// ==UserScript==
// @name        Download_files_with_ZIP
// @name:en     Download files with ZIP
// @name:ja     ZIPでファイルをまとめてダウンロード
// @description     Use the [Alt+Shift+D] shortcut keys to download files with ZIP.
// @description:en  Use the [Alt+Shift+D] shortcut keys to download files with ZIP.
// @description:ja  [Alt+Shift+D]のショートカットキーでZIPでファイルをまとめてダウンロードします。
// @see         ↓↓↓ Add target page URL ↓↓↓
// @@match      *://example.com/*
// @see         ↑↑↑ Add target page URL ↑↑↑
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License
// @see         https://opensource.org/licenses/MIT
// @version     3.1.2
// @see         1.0.0 - 20210113 - 初版
// @see         2.0.0 - 20210115 - WebWorker対応（高速化対応）
// @see         3.0.0 - 20210116 - WebWorker/NoWorker対応（NoScript対応）
// @require     https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.js
// @require     https://cdn.jsdelivr.net/npm/hotkeys-js@3.8.1/dist/hotkeys.min.js
// @grant       GM.xmlHttpRequest
// @grant       window.close
// ==/UserScript==

(function() {
  'use strict';
  
  // 進歩表示
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
  const root = document.createElement('div');
  root.attachShadow({mode:'closed'}).appendChild(box)
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
      drawProgress('Download: '+(Array(len).join(' ')+arg.success).slice(-len)+'/'+arg.urls.length);
      break;
    case 'compress': 
      drawProgress('Compress: '+(Array(3).join(' ')+Math.floor(arg.percent)).slice(-3)+'%');
      break;
    case 'complate':
      drawProgress();
      break;
    case 'error':
    default:
      const status = arg.substatus || arg.status;
      const message = arg.message;
      console.log('error', arg);
      alert('error ('+status+')\n\n'+message);
      drawProgress();
      break;
    }
  };
  
  // 完了イベント
  const onDefaultComplate = (arg) => {
    const title = 'Download '+arg.status;
    const second = Math.floor((arg.endtime - arg.starttime) / 1000);
    const info = arg.success+'/'+arg.urls.length+':'+arg.failure+' | '+second+'s';
    console.log('complate', arg);
    !arg.alert && alert(title+'\n\n'+arg.name+'.zip\n'+info);
    arg.close && setTimeout(() => window.close(), arg.closetime || 1000);
  };
  
  /**
   * ZIPダウンロード
   * ファイルのダウンロード → ファイルのZIP圧縮 → ZIPファイルのダウンロード
   * @param {Object} arg - 引数
   * in     {string} arg.name - ZIPファイルのファイル名（拡張子を含まない）
   * in     {string[]} arg.urls - ダウンロードファイルのURL
   *                              または、Blob（対象ページのJavaScript有効時）
   * in/out {string[]} arg.names - ダウンロードファイルのファイル名（拡張子を含む）
   *    out {boolean[]} arg.results - ダウンロードの結果
   * in/out {Function} arg.onupdate - 更新時のコールバック関数（例：(arg) => {}）
   * in/out {Function} arg.oncomplate - 完了時のコールバック関数（例：(arg) => {}）
   * in/out {boolean} arg.worker - WebWorkerを使用する
   * in/out {number} [arg.level=0] - 圧縮レベル（0-9, 0:無圧縮/1:最高速度/9:最高圧縮）
   *    out {string} arg.status - 進歩状態
   *    out {string} arg.substatus - エラー以前の進歩状態
   *    out {string} arg.message - エラーメッセージ
   *    out {number} arg.success - ダウンロード成功件数
   *    out {number} arg.failure - ダウンロード失敗件数
   *    out {number} arg.percent - 圧縮の進歩（0-100の実数）
   *    out {Date} arg.starttime - 開始時間
   *    out {Date} arg.endtime - 終了時間
   * in     {boolean} arg.alert - 完了時にアラートを表示する
   * in     {boolean} arg.close - 完了時にタブをクローズする（Greasemonkeyは、対象外）
   * in     {number} arg.closetime - クローズまでの遅延時間（ms）
   * @return 実行有無
   *         同一ページ内での並列実行は許可されません。
   */
  let isRun = false;
  function downloadFilesZipAsync(arg) {
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
    arg.level = arg.level || 0;
    arg.success = 0;
    arg.failure = 0;
    arg.percent = 0;
    arg.onupdate(arg);
    
    // ファイルのダウンロード
    const downloadFilesAsync = async function(obj) {
      const zip = obj instanceof JSZip ? obj : null;
      const worker = obj instanceof Worker ? obj : null;
      
      arg.status = 'download';
      arg.names = arg.names || [];
      arg.results = [];
      const onDownload = (name, data) => {
        arg.success++;
        !data && arg.failure++;
        arg.onupdate(arg);
        if (arg.empty !== false || data) {
          zip && zip.file(name, data);
          worker && worker.postMessage({command:'file', name:name, buffer:data}, data ? [data] : null);
        }
      };
      const promises = arg.urls.map((url, i) => {
        const name = arg.names[i] = arg.names[i] 
                                 || url.name 
                                 || (typeof url == 'string' && url.slice(url.lastIndexOf('/') + 1)) 
                                 || ''+i;
        return new Promise((resolve, reject) => {
          const success = (data) => { onDownload(name, data); arg.results[i]=!!data; resolve(); };
          const failure = () => success();
          try {
            if (url instanceof Blob) {
              // ページの内部データ
              url.arrayBuffer().then((buffer) => {
                success(buffer instanceof ArrayBuffer ? buffer : null);
                // 対策：JavaScript無効時にJSZip内部でエラーする
                // see https://bugzilla.mozilla.org/show_bug.cgi?id=1427470
              });
              // 補足：Firefox + NoScript 時は、使用禁止（エラーとなる）
            } else if (typeof url == 'string') {
              // ページの外部データ
              GM.xmlHttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                onload: function(xhr) {
                  const isSuccess = 200 <= xhr.status && xhr.status < 300 || xhr.status === 304;
                  success(isSuccess ? xhr.response : null);
                },
                onerror: failure,
                onabort: failure,
                ontimeout: failure
              });
              // 補足：Data URL/Blob URLは、使用禁止
            } else { failure(); }
          } catch (e) { failure(); }
        });
      });
      arg.onupdate(arg);
      await Promise.all(promises);
    };
    
    // 完了処理
    const complate = function(status, message) {
      arg.substatus = arg.substatus || arg.status;
      arg.status = status || 'complate';
      arg.message = message || 'complate';
      arg.endtime = Date.now();
      arg.onupdate(arg);
      setTimeout(() => {
        arg.oncomplate(arg);
        isRun = false;
      }, 0);
    };
    
    // ZIPのダウンロード
    const downloadZipAsync = async function(blob) {
      const dataUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = arg.name+'.zip';
      a.dispatchEvent(new MouseEvent('click'));
      setTimeout(() => { URL.revokeObjectURL(dataUrl); }, 1E4); // 10s
      complate();
    };
    
    // Workerなしの処理
    const noworkerAsync = async function() {
      arg.worker = false;
      try {
        const zip = new JSZip();
        await downloadFilesAsync(arg.folder ? zip.folder(arg.name) : zip);
        
        arg.status = 'compress';
        arg.onupdate(arg);
        const option = arg.level 
                     ? {type:'arraybuffer'}
                     : {type:'arraybuffer', compression:'DEFLATE', compressionOptions:{level:arg.level}};
        const buffer = await zip.generateAsync(option, (metadata) => {
          arg.percent = metadata.percent;
          arg.onupdate(arg);
        });
        
        await downloadZipAsync(new Blob([buffer]));
      } catch (e) {
        //console.log(e);
        complate('error', e.message);
      }
    };
    if (arg.worker === false) {
      noworkerAsync();
      return true;
    }
    arg.worker = true;
    
    // WebWorker作成
    const code = `
      importScripts('https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.min.js');
      const zip = new JSZip();
      let folder = zip;
      
      self.addEventListener('message', async function(event) {
        const data = event.data;
        try {
          switch (data.command) {
          case 'ready':
            self.postMessage({command:'go'});
            if (data.name) {
              folder = zip.folder(data.name);
            }
            break;
          case 'file':
            folder.file(data.name, data.buffer);
            break;
          case 'generate':
            const option = data.level 
                         ? {type:'arraybuffer'}
                         : {type:'arraybuffer', compression:'DEFLATE', compressionOptions:{level:data.level}};
            const buffer = await zip.generateAsync(option, function(metadata) {
              self.postMessage({command:'progress', percent:metadata.percent});
            });
            self.postMessage({command:'complate', buffer:buffer}, [buffer]);
            break;
          default:
            self.postMessage({command:'error', message:'The command cannot be interpreted. (command:'+data.command+')'});
            break;
          }
        } catch (e) {
          //console.log(e);
          self.postMessage({command:'error', message:e.message});
        }
      });
    `;
    const workerUrl = URL.createObjectURL(new Blob([code]));
    let worker = null;
    try {
      worker = new Worker(workerUrl);
    } catch (e) {
      // Chrome + NoScript
      noworkerAsync();
      return true;
    } finally {
      URL.revokeObjectURL(workerUrl);
    }
    worker.addEventListener('error', function(event) {
      if (arg.status == 'ready') {
        // Firefox + NoScript
        noworkerAsync();
      } else {
        complate('error', event && event.message || '');
      }
      worker.terminate();
    });
    worker.addEventListener('message', async function(event) {
      const data = event.data;
      switch (data.command) {
      case 'go':
        await downloadFilesAsync(worker);
        arg.status = 'compress';
        arg.onupdate(arg);
        worker.postMessage({command:'generate', level:arg.level});
        break;
      case 'progress':
        arg.percent = data.percent;
        arg.onupdate(arg);
        break;
      case 'complate':
        await downloadZipAsync(new Blob([data.buffer]));
        worker.terminate();
        break;
      case 'error':
      default:
        complate('error', data.message || 'The command cannot be interpreted. (command:'+data.command+')');
        worker.terminate();
        break;
     }
    });
    worker.postMessage({command:'ready', name:(arg.folder ? arg.name : null)});
    
    return true;
    
    // 備考：staus: ready > download > compress > complate >> error
    // 備考：command: ready > go > file > generate > progress > complate >> error
    // 備考：oncomplate()呼び出しから実際のダウンロードがブラウザ上で発生するまでに、
    //       僅かなタイムラグが発生する可能性があります。
    //       実際のダウンロードがブラウザで開始するまで、ページをクローズしないで下さい。
    // 備考：urlsのファイル名に重複がある場合、最後のファイルのみ保存します。
    //       namesを指定して明示的にファイル名を指示することで回避できます。
    // 備考：urlsにBlobを使用できます。その場合、ファイル名はnameプロパティを使用します。
    // 備考：ファイル名が見つからない場合、最終的にインデックスの数値を使用します。
    // 備考：データの取得に失敗した場合、空ファイルを保存します。
    //       これには、データ取得に失敗したことを明示的に示す意味合いがあります。
    // 備考：onupdateでarg変数は、変更不可です。変更した場合、問題が発生する可能性があります。
    // 備考：対象ページがJavaScript無効の場合、WebWorkerは動作しません。
  };
  
  // ショートカットキー設定
  const shortcut = 'alt+shift+d';
  hotkeys(shortcut, function(event, handler) {
    // ↓↓↓ Add processing for each site ↓↓↓
    if (location.hostname == 'example.com') {
      // ...
    } else {
      alert('Missing download settings');
    }
    // ↑↑↑ Add processing for each site ↑↑↑
  });
  console.log(GM.info.scriptHandler, 'shortcut', shortcut);
})();

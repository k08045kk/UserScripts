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
// @version     3.1.0
// @see         1.0.0 - 20211013 - 初版
// @see         2.0.0 - 20211015 - WebWorker対応（高速化対応）
// @see         3.0.0 - 20211016 - WebWorker/NoWorker対応（NoScript対応）
// @require     https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.min.js
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
    case 'error':
    default:
      const status = arg.substatus || arg.status;
      const message = JSON.stringify(arg, null, 2);
      alert('error ('+status+')\n\n'+message);
      drawProgress();
      break;
    }
  };
  
  // 完了イベント
  const onDefaultComplate = (arg) => {
    const title = arg.status == 'complate' ? 'Download complete' : 'Download error';
    const second = Math.floor((arg.endtime - arg.starttime) / 1000);
    alert(title+'\n\n'
         //+arg.name+'\n'
         //+arg.count+'/'+arg.urls.length+':'+arg.error+' | '+second+'s');
         +JSON.stringify(arg, null, 2));
  };
  
  /**
   * ZIPダウンロード
   * @param {Object} arg - 引数
   * in     {string} arg.name - ZIPファイルのファイル名
   * in     {string[]} arg.urls - ダウンロードファイルのURL
   *                              または、Blob（対象ページのスクリプト有効時）
   * in/out {string[]} arg.names - ダウンロードファイルのファイル名
   * in/out {Function} arg.onupdate - 更新時のコールバック関数（例：(arg) => {}）
   * in/out {Function} arg.oncomplate - 完了時のコールバック関数（例：(arg) => {}）
   * in/out {boolean} arg.worker - WebWorkerを使用する
   * in/out {number} [arg.level=0] - 圧縮レベル（0-9, 0:無圧縮/1:最高速度/9:最高圧縮）
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
  function downloadFilesZipAsync(arg) {
    // 並列実行を防止
    if (isRun) {
      return false;
    }
    isRun = true;
    
    // 前処理
    arg.status = 'ready';
    arg.starttime = Date.now();
    arg.level = arg.level || 0;
    arg.onupdate = arg.onupdate || onDefaultUpdate;
    arg.oncomplate = arg.oncomplate || onDefaultComplate;
    arg.onupdate(arg);
    let zip = null;
    let worker = null;
    
    // ファイルのダウンロード
    const downloadFilesAsync = async function() {
      arg.status = 'download';
      arg.count = 0;
      arg.error = 0;
      arg.onupdate(arg);
      const onDownload = (file) => {
        arg.count++;
        !file.data && arg.error++;
        arg.onupdate(arg);
        if (file.name) {
          if (zip) {
            zip.file(file.name, file.data);
          } else if (file.data) {
            worker.postMessage({command:'file', name:file.name, buffer:file.data}, [file.data]);
          } else {
            worker.postMessage({command:'file', name:file.name, buffer:null});
          }
        }
      };
      arg.names = arg.names || [];
      await Promise.all(arg.urls.map((url, i) => {
        const name = arg.names[i] = arg.names[i] || url.name || (typeof url == 'string' && url.slice(url.lastIndexOf('/') + 1)) || ''+i;
        return new Promise((resolve, reject) => {
          try {
            if (url instanceof Blob) {
              // ページの内部データ
              url.arrayBuffer().then((buffer) => {
                onDownload({name:name, data:buffer});
                resolve();
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
                  onDownload({name:name, data:(isSuccess ? xhr.response : null)});
                  resolve();
                },
                onerror: function() { onDownload({name:name, data:null}); resolve(); },
                onabort: function() { onDownload({name:name, data:null}); resolve(); },
                ontimeout: function() { onDownload({name:name, data:null}); resolve(); }
              });
              // 補足：Data URLは、使用禁止
              // 補足：Blob URLは、使用禁止
            } else {
              onDownload({name:name, data:null});
              resolve();
            }
          } catch (e) {
            onDownload({name:name, data:null});
            resolve();
          }
        });
      }));
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
      a.download = arg.name;
      a.dispatchEvent(new MouseEvent('click'));
      setTimeout(() => { URL.revokeObjectURL(dataUrl); }, 1E4); // 10s
      complate();
    };
    
    // Workerなしの処理
    const noworker = async function() {
      arg.worker = false;
      try {
        zip = new JSZip();
        await downloadFilesAsync();
        
        arg.status = 'compress';
        arg.percent = 0;
        arg.onupdate(arg);
        const option = {type:'arraybuffer'};
        if (arg.level) {
          option.compression = 'DEFLATE';
          option.compressionOptions = {level:arg.level};
        }
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
      noworker();
      return true;
    }
    arg.worker = true;
    
    // WebWorker作成
    const code = `
      self.importScripts('https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.min.js');
      const zip = new JSZip();
      
      self.addEventListener('message', async function(event) {
        const data = event.data;
        try {
          switch (data.command) {
          case 'ready':
            self.postMessage({command:'go'});
            break;
          case 'file':
            zip.file(data.name, data.buffer);
            break;
          case 'generate':
            const option = {type:'arraybuffer'};
            if (data.level) {
              option.compression = 'DEFLATE';
              option.compressionOptions = {level:data.level};
            }
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
    try {
      worker = new Worker(workerUrl);
    } catch (e) {
      // Chrome + NoScript
      noworker();
      return true;
    } finally {
      URL.revokeObjectURL(workerUrl);
    }
    worker.addEventListener('error', function(event) {
      if (arg.status == 'ready') {
        // Firefox + NoScript
        noworker();
      } else {
        complate('error', event && event.message || '');
      }
      worker.terminate();
    });
    worker.addEventListener('message', async function(event) {
      const data = event.data;
      switch (data.command) {
      case 'go':
        await downloadFilesAsync();
        
        arg.status = 'compress';
        arg.percent = 0;
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
    worker.postMessage({command:'ready'});
    
    return true;
    
    // 備考：staus: ready > download > compress > complate >> error
    // 備考：command: ready > go > file > generate > progress > complate >> error
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
    // 備考：対象ページがスクリプト無効の場合、WebWorkerが動作しない。
    // 備考：Firefox限定でスクリプト無効の場合、BlobのデータがJSZipでエラーになる。
    //       「Can't read the data of 'test.txt'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?」
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

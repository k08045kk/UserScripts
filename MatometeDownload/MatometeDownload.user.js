// ==UserScript==
// @name        MatometeDownload
// @name:en     Download files with ZIP
// @name:ja     ZIPでファイルをまとめてダウンロード
// @description     Use the [Alt+Shift+D] shortcut keys to download files with ZIP.
// @description:en  Use the [Alt+Shift+D] shortcut keys to download files with ZIP.
// @description:ja  [Alt+Shift+D]のショートカットキーでZIPでファイルをまとめてダウンロードします。
// @note        ↓↓↓ Add target page URL ↓↓↓
// @@match      *://example.com/*
// @note        ↑↑↑ Add target page URL ↑↑↑
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License | https://opensource.org/licenses/MIT
// @version     4.0.0
// @since       1.0.0 - 20210113 - 初版
// @since       2.0.0 - 20210115 - WebWorker対応（高速化対応）
// @since       3.0.0 - 20210116 - WebWorker/NoWorker対応（NoScript対応）
// @since       3.2.0 - 20210117 - Download_files_with_ZIP.user.js → MatometeDownload.user.js
// @since       3.3.0 - 20210118 - リリース版
// @since       3.4.0 - 20210131 - fix Blobを保存できない問題修正（Firefox+Greasemonkey+NoScript）
// @since       3.4.1 - 20210131 - fix arg.levelオプションを修正
// @since       3.4.2 - 20210131 - fix I/F修正等
// @since       3.4.3 - 20210408 - fix 完了時に背景がちらつくことがある
// @since       3.4.4 - 20210526 - エラー出力まわりを強化
// @since       4.0.0 - 20222010 - downloadFilesZipAsync() を async function に変更
// @see         https://github.com/k08045kk/UserScripts
// @see         https://www.bugbugnow.net/2021/01/download-files-with-zip.html
// @grant       GM.xmlHttpRequest
// @grant       window.close
// @require     https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.min.js
// @require     https://cdn.jsdelivr.net/npm/hotkeys-js@3.8.1/dist/hotkeys.min.js
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
  root.attachShadow({mode:'closed'}).appendChild(box);
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
  
  
  // 更新処理
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
      const title = 'Download '+arg.status;
      const second = Math.floor((arg.endtime - arg.starttime) / 1000);
      const info = arg.success+'/'+arg.urls.length+':'+arg.failure+' | '+second+'s';
      drawProgress(' ');
      console.log('complate', arg);
      arg.alert !== false && alert(title+'\n\n'+arg.name+'.zip\n'+info);
      arg.close !== false && arg.close != null && setTimeout(() => window.close(), typeof arg.close === 'number' ? arg.close :  1000);
      drawProgress();
      break;
    case 'error':
    default:
      drawProgress();
      const status = arg.substatus || arg.status;
      const message = arg.message;
      console.log('error', arg);
      alert('error ('+status+')\n\n'+message);
      break;
    }
  };
  
  
  /**
   * ZIPダウンロード
   * ファイルのダウンロード → ファイルのZIP圧縮 → ZIPファイルのダウンロード
   * @param {Object} arg - 引数
   * in     {string} arg.name - ZIPファイルのファイル名（拡張子を含まない）
   * in     {(string|Blob|File)[]} arg.urls - ダウンロードファイルのURL（or Blob or File）
   * in/out {string[]} arg.names - ダウンロードファイルのファイル名（拡張子を含む）
   *    out {boolean[]} arg.results - ダウンロードの結果
   * in/out {Function} [arg.onupdate=onDefaultUpdate] - 更新時のコールバック関数（例：(arg) => {}）
   * in/out {boolean} [arg.worker=true] - WebWorkerを使用する
   * in     {number} [arg.level=0] - 圧縮レベル（0-9, 0:無圧縮 / 1:最高速度 / 9:最高圧縮）
   * in     {boolean} [arg.folder=true] - junk-pathsオプション（ディレクトリ構造を保持する）
   * in     {boolean} [arg.empty=true] - 取得失敗したファイルを保存する
   *    out {string} arg.status - 進歩状態
   *    out {string} arg.substatus - エラー以前の進歩状態
   *    out {string} arg.message - エラーメッセージ
   *    out {number} arg.success - ダウンロード成功件数
   *    out {number} arg.failure - ダウンロード失敗件数
   *    out {number} arg.percent - 圧縮の進歩（0-100の実数）
   *    out {number} arg.starttime - 開始時間
   *    out {number} arg.endtime - 終了時間
   * in     {boolean} [arg.alert=true] - 完了時にアラートを表示する
   * in     {(boolean|number)} [arg.close=false] - 完了時にタブをクローズする（Greasemonkeyは、対象外）
   * @return 実行有無
   *         同一ページ内での並列実行は許可されていません。
   */
  const downloadFilesZipAsync = async (arg) => {
    // 1. 前処理
    arg.status = 'ready';
    arg.starttime = Date.now();
    arg.onupdate = arg.onupdate || onDefaultUpdate;
    arg.success = 0;
    arg.failure = 0;
    arg.percent = 0;
    arg.onupdate(arg);
    
    // 6. 完了処理
    const onComplate = (status, message) => {
      arg.substatus = arg.substatus || arg.status;
      arg.status = status || 'complate';
      arg.message = message || 'complate';
      arg.endtime = Date.now();
      setTimeout(() => {
        arg.onupdate(arg);
        // 補足：簡易のブラウザ上のダウンロード開始待ち
      }, 0);
    };
    
    // 3. ファイルのダウンロード
    const downloadFilesAsync = async (obj) => {
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
                                 || (typeof url === 'string' && url.slice(url.lastIndexOf('/') + 1)) 
                                 || String(i);
        return new Promise((resolve, reject) => {
          const success = (data) => { try { arg.results[i]=!!data; onDownload(name, data); } finally { resolve(); } };
          const failure = () => success();
          try {
            const blob = url;
            if (blob instanceof Blob) {
              // ページの内部データ
              blob.arrayBuffer().then((buffer) => {
                try {
                  if (buffer instanceof ArrayBuffer === false) {
                    // JavaScript無効時にJSZip内部でエラーする問題対応（JSZipがページコンテキストを想定していないため）
                    // 補足：Firefox + Greasemonkey + NoScript の問題
                    //       WebWorker時は、postMessage() で変換されるため、問題現象は発生しない。
                    // 説明：Greasemonkey の ArrayBuffer.arrayBuffer() / FileReader.readAsArrayBuffer() は、
                    //       コンテンツコンテキスト（ArrayBuffer）ではなく、
                    //       ページコンテキスト（window.ArrayBuffer）で ArrayBuffer を返す。
                    // see https://bugzilla.mozilla.org/show_bug.cgi?id=1427470
                    // see https://github.com/greasemonkey/greasemonkey/issues/2786
                    const temp = buffer;
                    buffer = new ArrayBuffer(temp.byteLength);
                    new Uint8Array(buffer).set(new Uint8Array(temp));
                  }
                  success(buffer);
                } catch (e) {
                  //console.log(e);
                  failure();
                }
              });
            } else if (typeof url === 'string') {
              // ページの外部データ
              GM.xmlHttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                onload: (xhr) => {
                  const isSuccess = 200 <= xhr.status && xhr.status < 300 || xhr.status === 304;
                  success(isSuccess ? xhr.response : null);
                },
                onerror: failure,
                onabort: failure,
                ontimeout: failure
              });
              // 補足：Data URL/Blob URLは、使用禁止
            } else { failure(); }
          } catch (e) {
            //console.log(e);
            failure();
          }
        });
      });
      arg.onupdate(arg);
      await Promise.all(promises);
    };
    
    // 5. ZIPのダウンロード
    const downloadZip = (blob) => {
      const dataUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = arg.name+'.zip';
      a.dispatchEvent(new MouseEvent('click'));
      setTimeout(() => { URL.revokeObjectURL(dataUrl); }, 1E4); // 10s
      onComplate();
    };
    
    // 2a. Workerなしの処理
    const noworkerAsync = async () => {
      arg.worker = false;
      try {
        const zip = new JSZip();
        await downloadFilesAsync(arg.folder !== false ? zip.folder(arg.name) : zip);
        
        // 4a. ZIP圧縮
        arg.status = 'compress';
        arg.onupdate(arg);
        const option = arg.level 
                     ? {type:'arraybuffer', compression:'DEFLATE', compressionOptions:{level:arg.level}}
                     : {type:'arraybuffer'};
        const buffer = await zip.generateAsync(option, async (metadata) => {
          arg.percent = metadata.percent;
          arg.onupdate(arg);
        });
        arg.percent = 100;
        arg.onupdate(arg);
        
        downloadZip(new Blob([buffer]));
      } catch (e) {
        //console.log(e);
        onComplate('error', e.message);
      }
    };
    if (arg.worker === false) {
      await noworkerAsync();
      return true;
    }
    arg.worker = true;
    
    
    // 2b. WebWorker作成
    const promise = new Promise((resolve, reject) => {
      const code = `
        importScripts('https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.min.js');
        const zip = new JSZip();
        let folder = zip;
        
        self.addEventListener('message', async (event) => {
          const data = event.data;
          try {
            switch (data.command) {
            case 'ready':
              if (data.name) {
                folder = zip.folder(data.name);
              }
              self.postMessage({command:'go'});
              break;
            case 'file':
              folder.file(data.name, data.buffer);
              break;
            case 'generate':
              // 4b. ZIP圧縮
              const option = data.level 
                           ? {type:'arraybuffer', compression:'DEFLATE', compressionOptions:{level:data.level}}
                           : {type:'arraybuffer'};
              const buffer = await zip.generateAsync(option, (metadata) => {
                self.postMessage({command:'progress', percent:metadata.percent});
              });
              self.postMessage({command:'progress', percent:100});
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
        worker.addEventListener('error', async (event) => {
          let ret = 'NG';
          if (arg.status == 'ready') {
            // Firefox + NoScript
            ret = 'noworker';
          } else {
            onComplate('error', event && event.message || '');
          }
          resolve(ret);
          worker.terminate();
        });
        worker.addEventListener('message', async (event) => {
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
            downloadZip(new Blob([data.buffer]));
            resolve('OK');
            worker.terminate();
            break;
          case 'error':
          default:
            onComplate('error', data.message || 'The command cannot be interpreted. (command:'+data.command+')');
            resolve('NG');
            worker.terminate();
            break;
         }
        });
        worker.postMessage({command:'ready', name:(arg.folder !== false ? arg.name : null)});
      } catch (e) {
        // Chrome + NoScript
        //console.log(e);
        resolve('noworker');
      } finally {
        URL.revokeObjectURL(workerUrl);
      }
    }).then(async (value) => {
      let ret = false;
      switch (value) {
      case 'noworker':          // 処理未実施（noworkerで再実行）
        await noworkerAsync();
        // not break
      case 'OK':                // 処理完了
        ret = true;
        break;
      case 'NG':                // 処理失敗
      default:
        break;
      }
      return ret;
    });
    return await promise;
    
    // 備考：staus: ready > download > compress > complate >> error
    // 備考：command: ready > go > file > generate > progress > complate >> error
    // 備考：complateから実際のダウンロードがブラウザ上で発生するまでに、
    //       僅かなタイムラグが発生する可能性があります。
    //       実際のダウンロードがブラウザで開始するまで、ページをクローズしないで下さい。
    // 備考：urlsのファイル名に重複がある場合、最後のファイルのみ保存します。
    //       namesを指定して明示的にファイル名を指示することで回避できます。
    // 備考：urlsにBlobを使用できます。その場合、ファイル名はnameプロパティを使用します。
    //       Blobではなく、Fileを使用することを検討して下さい。
    // 備考：ファイル名が見つからない場合、最終的にインデックスの数値を使用します。
    // 備考：データの取得に失敗した場合、空ファイルを保存します。
    //       これには、データ取得に失敗したことを明示的に示す意味合いがあります。
    // 備考：onupdate()のargは、変更不可です。変更した場合、問題が発生する可能性があります。
    // 備考：対象ページがJavaScript無効の場合、WebWorkerは動作しません。
  };
  
  
  // ショートカットキー設定
  const shortcut = 'alt+shift+d';
  hotkeys(shortcut, async (event, handler) => {
    console.log('shortcut', 'start', location.hostname);
    try {
      // ↓↓↓ Add processing for each site ↓↓↓
      if (location.hostname == 'example.com') {
        const urls = [...document.querySelectorAll('body img')].map(img => img.src);
        urls.push(new File(['Download list.\n\n'+urls.join('\n')], 'list.txt', {type:'text/plain'}));
        await downloadFilesZipAsync({
          name: document.title.trim(),
          urls: urls, 
          //names: [...document.querySelectorAll('body img')].map((img, i) => i+'.jpg'),
          //worker: false,
          //level: 6,
          //folder: false,
          //empty: false,
          //alert: false,
          //close: 1000,
        });
      } else {
        alert('Missing download settings');
      }
      // ↑↑↑ Add processing for each site ↑↑↑
    } catch (e) {
      console.log('shortcut', 'error', e);
    }
    console.log('shortcut', 'end');
  });
  console.log('shortcut', shortcut);
})();
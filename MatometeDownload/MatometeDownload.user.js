// ==UserScript==
// @name        Download_files_with_ZIP
// @name:en     Download files with ZIP
// @name:ja     ZIPでファイルをまとめてダウンロード
// @description [Alt+Shift+D]のショートカットキーでページのファイルをまとめてダウンロードします。
// @see         ↓要対象ページURL追加↓
// @@match      *://example.com/*
// @see         ↑要対象ページURL追加↑
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License
// @see         https://opensource.org/licenses/MIT
// @version     2.0.0
// @see         1.0.0 - 20211013 - 初版
// @see         2.0.0 - 20211015 - WebWorker対応（高速化対応）
// @require     https://cdn.jsdelivr.net/npm/hotkeys-js@3.8.1/dist/hotkeys.min.js
// @require     https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.js
// @grant       GM.xmlHttpRequest
// ==/UserScript==

(function() {
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
  function drawProgress(text) {
    if (!box.parentNode && text) {
      document.body.appendChild(box);
    }
    if (text) {
      box.textContent = text;
    } else if (box.parentNode) {
      box.remove();
    }
  };
  
  // ZIPダウンロード
  async function downloadZipAsync(arg) {
    drawProgress(' ');
    arg.startTime = new Date().getTime();
    
    // WebWorker作成
    const code = `
    importScripts('https://cdn.jsdelivr.net/npm/jszip@3.5.0/dist/jszip.js');
    
    const zip = new JSZip();
    
    self.addEventListener('message', async function(event) {
      const data = event.data;
      switch (data.command) {
      case 'file':
        if (data.name) {
          zip.file(data.name, data.buffer);
        }
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
    window.URL.revokeObjectURL(workerUrl)
    
    arg.count = 0;
    arg.error = 0;
    const len = (arg.urls.length+'').length;
    function onDownload(file) {
      arg.count++;
      !file.data && arg.error++;
      drawProgress('Download: '+(Array(len).join(' ')+arg.count).slice(-len)+'/'+arg.urls.length);
      worker.postMessage({command:'file', name:file.name, buffer:file.data}, file.data ? [file.data] : null);
    };
    
    // ファイルのダウンロード
    arg.names = arg.names || [];
    await Promise.all(
      arg.urls.map((url, i) => {
        const name = arg.names[i] || url.slice(url.lastIndexOf('/') + 1);
        arg.names[i] = name;
        return new Promise((resolve, reject) => {
          GM.xmlHttpRequest({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',        // Greasemonkeyは、blob非対応
            onload: function(xhr) {
              const isSuccess = 200 <= xhr.status && xhr.status < 300 || xhr.status === 304;
              if (isSuccess) {
                onDownload({name:name, data:xhr.response});
              } else {
                onDownload({name:name, data:null});
              }
              resolve();
            },
            onerror: function() { onDownload({name:name, data:null}); resolve(); },
            onabort: function() { onDownload({name:name, data:null}); resolve(); },
            ontimeout: function() { onDownload({name:name, data:null}); resolve(); }
          });
        });
      })
    );
    
    // ZIPファイルの圧縮
    worker.addEventListener('message', async function(event) {
      const data = event.data;
      switch (data.command) {
      case 'progress':
        drawProgress('Compress: '+(Array(3).join(' ')+Math.floor(data.percent)).slice(-3)+'%');
        break;
      case 'complate':
        // ZIPファイルのダウンロード
        const dataUrl = URL.createObjectURL(new Blob([data.buffer]));
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = arg.name;
        link.setAttribute('style', 'display:none;');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 後処理
        await new Promise(resolve => setTimeout(resolve, 1000));
        window.URL.revokeObjectURL(dataUrl);
        drawProgress();
        arg.endTime = new Date().getTime();
        arg.oncomplate && arg.oncomplate(arg);
        worker.terminate();
        break;
      }
    });
    worker.postMessage({command:'generate'});
    
    // 備考：onComplate()呼び出しから実際のダウンロードがブラウザ上で発生するまでに、
    //       僅かなタイムラグが発生する可能性があります。
    //       実際のダウンロードがブラウザで開始するまで、ページをクローズしないで下さい。
    // 備考：urlsのファイル名に重複がある場合、後あるファイルのみ保存します。
    //       namesを指定して明示的にファイル名を指示することで回避できます。
    // 備考：データの取得に失敗した場合、空のファイルを保存します。
    //       これには、データ取得に失敗したことを明示する意味合いがあります。
    // 備考：ファイル名が重複している場合、最後のファイルのみ保存します。
  };
  
  // ショートカットキー設定
  let isRun = false;
  hotkeys('alt+shift+d', function(event, handler) {
    // 重複実行を排除
    if (isRun) {
      return;
    }
    isRun = true;
    
    // 標準関数
    const onDefaultComplate = function(arg) {
      const second = Math.floor((arg.endTime - arg.startTime)/1000);
      alert('ダウンロード完了\n\n'+arg.name+' ('+arg.count+'/'+arg.urls.length+':'+arg.error+', '+second+'s)');
      arg.close && window.close();
      isRun = false;
    };
    
    // ↓サイト毎で処理を追記↓
    if (location.hostname == 'example.com') {
      // ...
    } else {
      alert(GM.info.script.name+'.user.js\n\nダウンロード設定の記述が漏れています。');
      isRun = false;
    }
    // ↑サイト毎で処理を追記↑
  });
  
  //alert('ユーザスクリプトの読み込みチェック用');
})();

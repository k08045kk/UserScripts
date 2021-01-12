// ==UserScript==
// @name        ZIPでまとめてダウンロード
// @description [Alt+Shift+D]のショートカットキーでページのファイルをまとめてダウンロードします。
// @see         ↓要対象ページURL追加↓
// @@match      *://example.com/*
// @see         ↑要対象ページURL追加↑
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License
// @see         https://opensource.org/licenses/MIT
// @version     1.0.0
// @see         1.0.0 - 20211013 - 初版
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

  // zipファイルのblobを作成
  function generateZipBlob(files, onUpdate) {
    const zip = new JSZip();
    files.forEach((file) => {
      if (file.data && file.name) {
        zip.file(file.name, file.data);
      }
    });
    return zip.generateAsync({type:'blob'}, onUpdate);
  };

  // ZIPダウンロード
  async function downloadZipAsync(fileName, urls, onComplate) {
    const len = (urls.length+'').length;
    let count = 0;
    function onDownloadUpdate() {
      drawProgress('Download: '+(Array(len).join(' ')+count).slice(-len)+'/'+urls.length);
      count++;
    };
    onDownloadUpdate();

    // ファイルのダウンロード
    const files = await Promise.all(
      urls.map((url) => {
        return new Promise((resolve, reject) => {
          GM.xmlHttpRequest({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',        // Greasemonkeyは、blob非対応
            onload: function(xhr) {
              onDownloadUpdate();
              const isSuccess = 200 <= xhr.status && xhr.status < 300 || xhr.status === 304;
              if (isSuccess) {
                resolve({data:xhr.response, name:url.slice(url.lastIndexOf('/') + 1)});
              } else {
                resolve({data:null});
              }
            },
            onerror: function() { onDownloadUpdate(); resolve({data:null}); },
            onabort: function() { onDownloadUpdate(); resolve({data:null}); },
            ontimeout: function() { onDownloadUpdate(); resolve({data:null}); }
          });
        });
      })
    );

    // ZIPファイルの圧縮
    const blob = await generateZipBlob(files, function(metadata) {
      drawProgress('Compress: '+(Array(3).join(' ')+Math.floor(metadata.percent)).slice(-3)+'%');
    });
    const dataUrl = URL.createObjectURL(blob);

    // ZIPファイルのダウンロード
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    link.setAttribute('style', 'display:none;');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(dataUrl);
    drawProgress();
    
    // 完了通知
    onComplate && onComplate();
  };

  // ショートカットキー設定
  hotkeys('alt+shift+d', function(event, handler) {
    // サイト毎のダウンロード設定の記述
    if (location.hostname == 'example.com') {
      // ...
    } else {
      alert('ファイルをまとめてダウンロード.user.js\n\nダウンロード設定の記述が漏れています。');
    }
  });

  //alert('ユーザスクリプトの読み込みチェック用');
})();

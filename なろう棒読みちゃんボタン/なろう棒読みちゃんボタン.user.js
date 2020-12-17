// ==UserScript==
// @name        なろう棒読みちゃんボタン
// @description 小説家になろうを棒読みちゃんを使用して朗読する。
// @description 棒読みちゃん用のWebSocket受付プラグインの導入が必要です。
// @include     http://ncode.syosetu.com/*/*
// @include     https://ncode.syosetu.com/*/*
// @include     http://novel18.syosetu.com/*/*
// @include     https://novel18.syosetu.com/*/*
// @author      toshi
// @license     MIT License
// @see         https://opensource.org/licenses/MIT
// @namespace   https://www.bugbugnow.net/
// @version     5
// @see         1 - add - 初版
// @see         2 - update - httpsからhttpへの遷移の記述をコメントアウト状態で追加
// @see         3 - update - リファクタリング
// @see         4 - update - 棒読みちゃんへの転送を遅延する(長時間待機後に連続で転送するとエラーことがあるため)
// @see         5 - update - 朗読内容を微調整（タイトルなし、強調ルビなし、短編にボタン追加）
// @see         5 - fix - 自動朗読が動作していない
// @grant       none
// ==/UserScript==

(function() {
  if (window.location.href.startsWith('https:')) {
    // httpsの場合、httpに遷移する
    // 強制遷移したくない場合、下記2行をコメントアウトする
    window.location.href = 'http'+window.location.href.substring(5);
    return;
  }
  if (document.getElementById('novel_honbun') == null) {
    // 対象ページではない時
    return;
  }
  //window.alert = function(text) { console.log(text); };
  
  // ミリ秒間待機する
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  // 棒読みちゃんへ文字列を送信する
  // 棒読みちゃんが以下のプラグインを設定した状態で、
  // ローカル環境で動作していることが必須条件となる。
  // 棒読みちゃん用のWebSocket受付プラグイン
  // see https://github.com/chocoa/BouyomiChan-WebSocket-Plugin
  function sendBouyomiChanWebSocketPlugin(text) {
    const callee = sendBouyomiChanWebSocketPlugin;
    const host = 'ws://localhost:50002/';
    
    try{
      const socket = new WebSocket(host);
      
      socket.onopen = function(event) {
        //console.log('Server open.');
        
        const delim = '<bouyomi>';
        const speed = -1; // 速度50-200。-1を指定すると本体設定
        const pitch = -1; // ピッチ50-200。-1を指定すると本体設定
        const volume= -1; // ボリューム0-100。-1を指定すると本体設定
        const type  =  0; // 声質(0.本体設定/1.女性1/2.女性2/3.男性1/4.男性2/5.中性/6.ロボット/7.機械1/8.機械2)
        socket.send('' + speed + delim + pitch + delim + volume + delim + type + delim + text);
      };
      socket.onmessage = function(event) {
        //console.log('Server message: '+event.data);
      };
      socket.onerror = function(event) {
        //console.log('Server error: '+event);
        if (callee.error !== true) {
          callee.error = true;
          alert('棒読みちゃんへの送信に失敗しました。');
        }
      };
      socket.onclose = function(event) {
        //console.log('Server close.');
      };
    } catch(exception){
      //console.log('Error: '+exception);
    }
  };
  
  // 作者情報を取得(再生ボタンを配置する前に取得)
  let title = '';
  try {
    title = document.querySelector('.contents1').innerText;
  } catch (e) {}
  
  async function onBouyomiChanButton() {
    //console.log('なろう棒読みちゃんボタン');
    
    // ２重クリック防止
    this.disabled = true;
    
    let text = '';
    
    // タイトルを追加
    // タイトルなし（長いタイトルを毎回読むのが嫌なため）
    //console.log('title: '+title);
    //text += title + '…。';
    
    // サブタイトルを追加
    try {
      let subtitle = document.querySelector('.novel_subtitle').innerText;
      //console.log('subtitle: '+subtitle);
      text += subtitle + '…。';
    } catch (e) {}
    
    // 本文を追加
    // ルビあり文字の原文を削除（ルビあり文字を2重に読み上げるのを回避）
    const novel = document.getElementById('novel_honbun').cloneNode(true);
    //novel.querySelectorAll('ruby rb').forEach(function(v, i, a) { v.innerText = ''; });
    novel.querySelectorAll('ruby rp').forEach(function(v, i, a) { v.innerText = ''; });
    novel.querySelectorAll('ruby').forEach(function(v, i, a) {
      const rb = v.querySelector('rb');
      const rt = v.querySelector('rt');
      if (!rt) {
        
      } else if (rt.innerText.replace(/[・、]+/g, '') == '') {
        // 傍点ならば、原文を優先する
        rt.innerText = '';
      } else if(rb) {
        rb.innerText = '';
      }
    });
    text += novel.innerText;
    
    text += '…。\n以上、棒読みちゃんによる朗読でした。';
    
    
    // 一定文字数をこえると、プラグインがインデックス範囲外でハングするため、複数回送信する
    // 「。」を区切りとして複数回送信する。
    // (文字数だけで区切ると単語の途中で送信してしまう可能性があるため)
    // (単語の途中で送信してしまうと、棒読みちゃんの発音が意図しないものとなる可能性が高い)
    let len = 200;  // 一回の最大送信文字数
    let idx = 0;
    let next, prev = 0;
    let count = 0;
    while (true) {
      next = text.indexOf('。', prev);
      //console.log(next+' '+prev+' '+idx);
      if (next == -1) { break; }
      
      while (next-idx > len) {
        if (prev == idx) {
          prev = idx + len;
        }
        //console.log(text.substr(idx, prev-idx));
        sendBouyomiChanWebSocketPlugin(text.substr(idx, prev-idx));
        // 連続送信すると棒読みちゃん側がエラーするため、遅延させる
        // 長時間待機後の連続送信で失敗するため、最初のみ待機時間を伸ばす
        if (count == 0) {
          await sleep(2500); 
        } else if (count <= 5) {
          await sleep(500);
        } else {
          await sleep(100);
        }
        count++;
        
        idx = prev;
      }
      prev = next + 1;
    }
    //console.log(text.substr(idx, text.length-idx));
    sendBouyomiChanWebSocketPlugin(text.substr(idx, text.length-idx));
    // 一定の文字列を超えた場合、それ以降朗読しなくなる問題がある
    // 例：http://ncode.syosetu.com/n4006r/12/
  };
  
  // https未対応(対応した場合、if分を削除すること)
  if ('http:' == document.location.protocol) {
    // 再生ボタンを配置
    const element = document.querySelector('.contents1') || document.querySelector('.novel_title');
    element.innerHTML += `
<div style="float:right;">
  <style>
    #bouyomichan{
      cursor: pointer;
      color: #fff;
      background: #0076bf;
      padding: .25em 1em;
    }
    #bouyomichan:disabled{
      color: #000;
      background: #ccc;
    }
  </style>
  <button id="bouyomichan">棒読みちゃん</button>
</div>`;
    document.getElementById('bouyomichan').addEventListener('click', onBouyomiChanButton);
    
    // 自動朗読
    // URLにbouyomichan=trueを指定するとページ移動で自動朗読する
    var urlParam = location.search.substring(1);
    if (urlParam) {
      var param = urlParam.split('&');
      var paramArray = [];
      for (i = 0; i < param.length; i++) {
        var paramItem = param[i].split('=');
        paramArray[paramItem[0]] = paramItem[1];
      }
      if (paramArray.bouyomichan == 'true') {
        onBouyomiChanButton.call(document.getElementById('bouyomichan'));
        
        document.querySelectorAll('#novel_color .novel_bn a').forEach(function(v) {
          v.href += '?bouyomichan=true';
        });
      }
    }
  }
})();
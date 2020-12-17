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
// @grant       none
// ==/UserScript==

(function() {
  if (window.location.href.startsWith('https:')) {
    // httpsの場合、httpに遷移する
    // 強制遷移したくない場合、下記2行をコメントアウトする
    window.location.href = 'http'+window.location.href.substring(5);
    return;
  }
  if (document.querySelector('#novel_honbun') == null) {
    // 対象ページではない時
    return;
  }
  //window.alert = function(text) { console.log(text); };
  
  function sleep(msec) {
    return new Promise(function(resolve) {
      setTimeout(function() {resolve()}, msec);
    });
  }
  
  // 棒読みちゃんへ文字列を送信する
  // 棒読みちゃんが以下のプラグインを設定した状態で、
  // ローカル環境で動作していることが必須条件となる。
  // 棒読みちゃん用のWebSocket受付プラグイン
  // https://github.com/chocoa/BouyomiChan-WebSocket-Plugin
  function bouyomiChanWebSocketPlugin(text) {
    let callee = bouyomiChanWebSocketPlugin;
    let host = 'ws://localhost:50002/';
    if ('https:' == document.location.protocol) {
      // 未対応だが、SSL版はポートを変更する予定
      host = 'wss://localhost:50003/';
    }
    try{
      let socket = new WebSocket(host);
      
      socket.onopen = function() {
        //console.log('Server open.');
        
        let delim = '<bouyomi>';
        let speed = -1; // 速度50-200。-1を指定すると本体設定
        let pitch = -1; // ピッチ50-200。-1を指定すると本体設定
        let volume= -1; // ボリューム0-100。-1を指定すると本体設定
        let type  =  0; // 声質(0.本体設定/1.女性1/2.女性2/3.男性1/4.男性2/5.中性/6.ロボット/7.機械1/8.機械2)
        socket.send('' + speed + delim + pitch + delim + volume + delim + type + delim + text);
      };
      socket.onmessage = function(e) {
        //console.log('Server message: '+e.data);
      };
      socket.onerror = function(e) {
        //console.log('Server error: '+e);
        if (callee.error !== true) {
          callee.error = true;
          alert('棒読みちゃんへの送信に失敗しました');
        }
      };
      socket.onclose = function() {
        //console.log('Server close.');
      };
    } catch(exception){
      //console.log('Error: '+exception);
    }
  }
  
  // 作者情報を取得(再生ボタンを配置する前に取得)
  let title = document.querySelector('.contents1')?.innerText || '';
  async function bouyomiChanButton() {
    //console.log('なろう棒読みちゃんボタン');
    
    // ２重クリック防止
    this.disabled = true;
    
    let text = '';
    
    // タイトルを追加
    // タイトルなし（長いタイトルを毎回読むのが嫌なため）
    //console.log('title: '+title);
    //text += title + '…';
    
    // サブタイトルを追加
    try {
      let subtitle = document.querySelector('.novel_subtitle').innerText;
      //console.log('subtitle: '+subtitle);
      text += subtitle + '…';
    } catch (e) {}
    
    // ルビあり文字の原文を削除
    // ルビあり文字を2重に読み上げるのを回避
    // 強調ルビを除外
    let novel = document.querySelector('#novel_honbun').cloneNode(true);
    //novel.querySelectorAll('ruby rb').forEach(function(v, i, a) { v.innerText = ''; });
    novel.querySelectorAll('ruby rp').forEach(function(v, i, a) { v.innerText = ''; });
    novel.querySelectorAll('ruby').forEach(function(v, i, a) {
      const rb = v.querySelector('rb');
      const rt = v.querySelector('rt');
      if (rt && rt.innerText.replace(/[・]/g, '') == '') {
        rt.innerText = '';
      } else if(rb) {
        rb.innerText = '';
      }
    });
    // 本文を追加
    text += novel.innerText;
    
    text += '…\n以上、棒読みちゃんによる朗読でした。';
    
    // 一定文字数をこえると、プラグインがインデックス範囲外でハングするため、複数回送信する
    // 「。」を区切りとして複数回送信する。
    // (文字数だけで区切ると単語の途中で送信してしまう可能性があるため)
    // (単語の途中で送信してしまうと、棒読みちゃんの発音が意図しないものとなる可能性が高い)
    let len = 200;  // 一回の最大送信文字数
    let idx = 0;
    let next, prev = 0;
    while (true) {
      next = text.indexOf('。', prev);
      //console.log(next+' '+prev+' '+idx);
      if (next == -1) { break; }
      
      while (next-idx > len) {
        if (prev == idx) {
          prev = idx + len;
        }
        //console.log(text.substr(idx, prev-idx));
        bouyomiChanWebSocketPlugin(text.substr(idx, prev-idx));
        if (idx == 0) {
          await sleep(3000); // 連続送信すると棒読みちゃん側がエラーするため、遅延させる
        } else if (idx < 10) {
          await sleep(500);  // 連続送信すると棒読みちゃん側がエラーするため、遅延させる
        } else {
          await sleep(100);  // 連続送信すると棒読みちゃん側がエラーするため、遅延させる
        }
        
        idx = prev;
      }
      prev = next + 1;
    }
    //console.log(text.substr(idx, text.length-idx));
    bouyomiChanWebSocketPlugin(text.substr(idx, text.length-idx));
    // 一定の文字列を超えた場合、それ以降朗読しなくなる問題がある
    // 例：http://ncode.syosetu.com/n4006r/12/
  }
  
  // https未対応(対応した場合、if分を削除すること)
  if ('http:' == document.location.protocol) {
    // 再生ボタンを配置
    const element = document.querySelector('.contents1') || document.querySelector('.novel_title');
    
    element.innerHTML += ''
      + '<div style="float:right;">'
        + '<style>'
          + 'input#bouyomichan{padding:0px 1em 0 1em;cursor:pointer;text-align:center;background-color:#0076bf;background-image:linear-gradient(#0076bf,#006ea5);border-color:#004b9a;box-shadow:0 1px 0 hsla(0,0%,100%,.4) inset,0 1px 0 hsla(0,0%,100%,.4);color:#fff;border-radius:3px;line-height:1.75}input#bouyomichan:hover{background:0 0 repeat scroll 0 0 #008fd6;border-color:#00437f}input#bouyomichan:disabled{background-image:none;background-color:#ccc;border-color:#ccc}'
        + '</style>'
        + '<input id="bouyomichan" type="button" value="棒読みちゃん"/>'
      + '</div>';
    document.querySelector('#bouyomichan').addEventListener('click', bouyomiChanButton);
    
    var bns = document.querySelectorAll('#novel_color .novel_bn a');
    if (bns && bns.length == 2) {
      var bn = document.querySelector('#novel_color .novel_bn');
      bn.innerHTML = '<a href="'+bns[0].href+'?bouyomityan=true"></a>' + bn.innerHTML + '<a href="'+bns[1].href+'?bouyomityan=true"></a>';
    }
    
    var urlParam = location.search.substring(1);
    if (urlParam) {
      var param = urlParam.split('&');
      // パラメータを格納する用の配列を用意
      var paramArray = [];
      
      // 用意した配列にパラメータを格納
      for (i = 0; i < param.length; i++) {
        var paramItem = param[i].split('=');
        paramArray[paramItem[0]] = paramItem[1];
      }
      if (paramArray.bouyomityan == 'true') {
        bouyomiChanButton();
      }
    }
  }
})();
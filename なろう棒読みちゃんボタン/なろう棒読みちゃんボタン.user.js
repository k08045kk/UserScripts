// ==UserScript==
// @name        なろう棒読みちゃんボタン
// @description 小説家になろうを棒読みちゃんを使用して朗読する。
//              棒読みちゃん用のWebSocket受付プラグインの導入が必要です。
// @match       *://ncode.syosetu.com/*/*
// @match       *://novel18.syosetu.com/*/*
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License | https://opensource.org/licenses/MIT
// @version     6
// @since       1 - 20160210 - 初版
// @since       2 - 20180423 - httpsからhttpへの遷移の記述をコメントアウト状態で追加
// @since       3 - 20180509 - リファクタリング
// @since       4 - 20190226 - 棒読みちゃんへの転送を遅延する(長時間待機後の転送でエラーする)
// @since       5 - 20201218 - 朗読内容を微調整（タイトルなし、強調ルビなし、短編にボタン追加）
// @since       5 - 20201218 - fix 自動朗読が動作していない
// @since       6 - 20210416 - HTTPS対応 + 文章分割を改善
// @see         https://www.bugbugnow.net/2018/02/blog-post_10.html
// @grant       none
// ==/UserScript==

(function() {
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
        
        const delim = "<bouyomi>";
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
          alert("棒読みちゃんへの送信に失敗しました。");
        }
      };
      socket.onclose = function(event) {
        //console.log('Server close.');
      };
    } catch(exception){
      //console.log('Error: '+exception);
    }
  };
  
  // 文章を分割する
  function* segmenter(text, segments, max) {
    segments = segments || ['。','、','.',',','\n'];
    max = max || 256;
    
    const indexs = segments.map(() => 0);
    const len = text.length;
    let slen, next, prev = 0;
    while (prev + max < len) {
      // 区切り文字で分割する
      // 分割不可（最大文字数分の文字列を出力する）
      next = prev + max;
	    for (let s=0; s<segments.length; s++) {
        slen = segments[s].length;
        if (indexs[s] === -1) {
          // 区切り文字なし（捜索済み）
          continue;
        } else if (prev < indexs[s]) {
          if (indexs[s]+slen - prev < max) {
            // 区切り文字を範囲内で発見（捜索済み）
            next = indexs[s];
            break;
          } else {
            // 区切り文字を範囲外で発見（捜索済み）
            continue;
          }
        } else if ((indexs[s]=text.indexOf(segments[s], prev)) === -1) {
          // 対象文字なし
          continue;
        } else if (indexs[s]+slen - prev < max) {
          // 区切り文字を範囲内で発見
          next = indexs[s];
          while (true) {
            // 範囲内で最後の区切り文字まで進める
            indexs[s] = text.indexOf(segments[s], next+slen);
            if (indexs[s] === -1) {
              break;
            } else if (indexs[s]+slen - prev < max) {
              next = indexs[s];
            } else {
              break;
            }
          }
          break;
        } else {
          // 区切り文字を範囲外で発見
          continue;
        }
      }
      
      // 分割文字列を出力する
      if (next + slen <= prev + max) {
        next += slen;
      }
      yield text.substring(prev, next);
      prev = next;
    }
    if (prev < len) {
      yield text.substring(prev, len);
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
    
    // タイトル+作者名を追加
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
    
    text += "…。\n以上、棒読みちゃんによる朗読でした。";
    text = text.replace(/\r?\n\s*/g, '\n')              // 通信量を削減
               .replace(/[ァ-ヴ][ァ-ヴー・]*/g, '/$&/');// 出力から文字が消える問題対策（例：「ハマれば時間を稼げる」→「ハマればをげる」）
    
    // 一定文字数をこえると、プラグインがインデックス範囲外でハングするため、複数回送信する
    // (文字数だけで区切ると単語の途中で送信してしまう可能性があるため)
    // (単語の途中で送信してしまうと、棒読みちゃんの発音が意図しないものとなる可能性が高い)
    let count = 0;
    const segments = ['\n\n','。','？','！','、','」', '】','）','…','・','.','?','!',',','}','\n',' '];
    for (let s of segmenter(text, segments, 200)) {
      // 休止符の連続使用を制限
      s = s.replace(/\n\n\n+/g, '\n\n\n')
           .replace(/・・・+/g, '・・・')
           .replace(/、、、+/g, '、、、')
           .replace(/。。。+/g, '。。。')
           .replace(/……+/g, '……');
      if (s.trim() == '') { continue; }
      
      sendBouyomiChanWebSocketPlugin(s);
      
      // 連続送信すると棒読みちゃん側がエラーするため、遅延させる
      // 長時間待機後の連続送信で失敗するため、最初のみ待機時間を伸ばす
      if (count == 0) {
        await sleep(2000); 
      } else if (count <= 5) {
        await sleep(500);
      } else {
        await sleep(100);
      }
      count++;
    }
    // 一定の文字列を超えた場合、それ以降朗読しなくなる問題がある
    // 例：http://ncode.syosetu.com/n4006r/12/
  };
  
  // 再生ボタンを配置
  const element = document.querySelector('.contents1') || document.querySelector('.novel_title');
  element.innerHTML += `
<div style="float:right">
  <style>
    #bouyomichan {
      padding: .25em 1em;
      background: #0076bf;
      color: #fff;
      cursor: pointer;
    }
    #bouyomichan:disabled {
      background: #ccc;
      color: #000;
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
})();

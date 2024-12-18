// ==UserScript==
// @name        なろう棒読みちゃんボタン
// @description 小説家になろうを棒読みちゃんに転送して朗読してもらう。
//              棒読みちゃんは、 Ver0.1.11.0 Beta21 以降を使用してください。
//              アプリケーション連動（HTTP連携）を有効にしてください。
//              HTTP連携のポート番号（50080）を変更しないでください。
// @match       *://ncode.syosetu.com/*/*
// @match       *://novel18.syosetu.com/*/*
// @author      toshi (https://github.com/k08045kk)
// @license     MIT License | https://opensource.org/licenses/MIT
// @version     13
// @since       1 - 20160210 - 初版
// @since       2 - 20180423 - httpsからhttpへの遷移の記述をコメントアウト状態で追加
// @since       3 - 20180509 - リファクタリング
// @since       4 - 20190226 - 棒読みちゃんへの転送を遅延する(長時間待機後の転送でエラーする)
// @since       5 - 20201218 - 朗読内容を微調整（タイトルなし、強調ルビなし、短編にボタン追加）
// @since       5 - 20201218 - fix 自動朗読が動作していない
// @since       6 - 20210416 - HTTPS対応 + 文章分割を改善
// @since       7 - 20220210 - アプリケーション連動対応
// @since       8 - 20220910 - リファクタリング
// @since       9 - 20220911 - autobouyomichan 対応
// @since       10 - 20230304 - 自動朗読の一時停止
// @since       11 - 20230304 - ShadowDOM 対応
// @since       12 - 20240731 - ruby 仕様変更対応
// @since       13 - 20241004 - サイト構造変化対応
// @see         https://www.bugbugnow.net/2018/02/blog-post_10.html
// @grant       none
// ==/UserScript==

(function() {
  if (document.querySelector('.p-novel__body') == null) {
    // 対象ページではない時
    //return;
  }
  
  // 棒読みちゃん（アプリケーション連動）
  const sendBouyomiChanAppLinkage = async (text) => {
    let ret = true;
    try {
      text = text.replace(/ /g, '　');    // 「 」が「+」に変換されて行間が崩れる問題を回避
      
      const url = new URL('http://localhost:50080/Talk');
      url.searchParams.set('text', text); // 文字列
      url.searchParams.set('voice',  0);  // 声質( 0：デフォルト,  1～8:AquesTalk, 10001～:SAPI5)
      url.searchParams.set('volume',-1);  // 音量(-1：デフォルト,  0～100)
      url.searchParams.set('speed', -1);  // 速度(-1：デフォルト, 50～300)
      url.searchParams.set('tone',  -1);  // 音程(-1：デフォルト, 50～200)
      await fetch(url);
    } catch (e) {
      ret = false;
    }
    return ret;
  };
  
  // 文章を分割する
  const segmenter = function*(text, segments, max) {
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
  
  const onBouyomiChanButton = async function() {
    //console.log('なろう棒読みちゃんボタン'); 
    
    // ２重クリック防止
    this.disabled = true;
    this.style.color = '#a00';
    this.style.background = '#ccc';
    
    let text = '';
    
    // タイトルを追加
    //const title = document.querySelector('.novel_title')?.innerText   // 短編
    //           || document.querySelector('.contents1 > a')?.innerText // 連載
    //           || '';
    //text += title + '。';
    
    // サブタイトルを追加
    const subtitle = document.querySelector('.p-novel__title')?.innerText ?? '';
    text += subtitle + '…。';
    
    // 本文を追加
    // ルビあり文字の原文を削除（ルビあり文字を2重に読み上げるのを回避）
    const novel = document.querySelector('.p-novel__text:not(.p-novel__text--afterword):not(.p-novel__text--preface)').cloneNode(true);
    novel.querySelectorAll('ruby rp').forEach((rp) => rp.remove());
    novel.querySelectorAll('ruby').forEach((ruby) => {
      const rt = ruby.querySelector('rt');
      if (!rt) {
        
      } else if (rt.innerText.replace(/[・、]+/g, '') == '') {
        // 傍点ならば、原文を優先する
        rt.remove();
      } else if(rt) {
        ruby.innerText = rt.innerText;
        rt.remove();
      }
    });
    text += novel.innerText;
    
    text += "…。\n以上、棒読みちゃんによる朗読でした。";
    text = text.replace(/\r?\n\s*/g, '\n')        // 処理の簡略化
               //.replace(/\n\n\n+/g, '\n\n\n')     // 休止符の連続使用を制限
               //.replace(/・・・+/g, '・・・')
               //.replace(/、、、+/g, '、、、')
               //.replace(/。。。+/g, '。。。')
               //.replace(/……+/g, '……')
               .replace(/(\S\S+)\1\1+/g, '$1$1$1')
               .replace(/(.)\1\1+/msg, '$1$1$1');
    
    //const segments = ['\n\n','。','？','！','、','」', '】','）','…','・','.','?','!',',','}','\n',' '];
    const segments = ['。','、','…','・','.',',','\n','？','！','?','!','　',' '];
    for (const s of segmenter(text, segments, 256)) {
      if (s.trim() == '') { continue; }
      
      if (await sendBouyomiChanAppLinkage(s) === false) {
        // アラート出力（通信エラー）
        alert('棒読みちゃんへの送信に失敗しました');
        break;
      }
    }
    
    this.style.color = '#000';
  };
  
  // 再生ボタンを配置
  const root = document.createElement('div');
  root.attachShadow({mode:'open'})
  root.shadowRoot.innerHTML = `
<div id='bouyomichan' style="float: right;">
  <label hidden="hidden">自動朗読：<input id="auto" type="checkbox"/></label>
  <button id="btn" style="padding: .25em 1em; background: #0076bf; color: #fff; cursor: pointer;">棒読みちゃん</button>
<div>`;
  const btn = root.shadowRoot.getElementById('btn');
  btn.addEventListener('click', onBouyomiChanButton);
  const auto = root.shadowRoot.getElementById('auto');

  const element = document.querySelector('.c-announce');
  
  element.insertAdjacentElement('beforeend', root);
    
  // 自動朗読
  // URLに ?bouyomichan を指定するとページ移動で自動朗読する
  const url = new URL(location.href);
  if (url.searchParams.has('bouyomichan')) {
    // 履歴対策
    history.replaceState('','',url.pathname);
    
    document.querySelectorAll('#novel_color .novel_bn a').forEach((v) => v.href+='?bouyomichan');
    onBouyomiChanButton.call(btn);
  }
  // URLに ?autobouyomichan を指定すると自動でページ移動して朗読する
  if (url.searchParams.has('autobouyomichan')) {
    // 履歴対策
    history.replaceState('','',url.pathname);
    
    auto.checked = url.searchParams.get('autobouyomichan') === 'true';
    auto.parentElement.removeAttribute('hidden');
    document.querySelectorAll('#novel_color .novel_bn a').forEach((v) => v.href+='?autobouyomichan');
    (async () => {
      await onBouyomiChanButton.call(btn);
      const next = document.querySelectorAll('#novel_color .novel_bn a')[1];
      if (next.innerText == '次へ >>') {
        const id = setInterval(async () => {
          try {
            if (!auto.checked) {
              return;
            }
            const response = await fetch('http://localhost:50080/GetTalkTaskCount');
            const json = await response.json();
            if (json.talkTaskCount === 0) {
              clearInterval(id);
              await sendBouyomiChanAppLinkage('自動朗読中です。…。…。…。')
              window.location.href = next.href+'=true';
            }
          } catch (e) {
            clearInterval(id);
          }
        }, 1000);
      }
    })();
  }
})();

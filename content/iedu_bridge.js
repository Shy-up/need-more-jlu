/**
 * need_more_jlu - iedu Tab Bridge Content Script
 * 解决校园网教务系统内网证书未被系统信任 (ERR_CERT_AUTHORITY_INVALID) 及 Cookie 隔离问题。
 * 在已放行证书的教务页面同源上下文中转发排课请求，确保护航 100% 连通率。
 */

(() => {
  // 1. 认证弹窗专属自动中转（绝不误伤用户单开的普通窗口）：
  // 仅当当前窗口由插件作为认证弹窗拉起 (window.name === 'JLU_AUTH_WINDOW')，且登录后停留在 WebVPN 首页时自动中转
  if (window.name === 'JLU_AUTH_WINDOW') {
    const href = window.location.href;
    const isWebvpnHost = window.location.hostname.includes('vpn.jlu.edu.cn');
    const isLogin = href.includes('/login') || href.includes('cas_login');
    const isAlreadyApp = href.includes('/jwapp/') || href.includes('/defaultroot/');
    if (isWebvpnHost && !isLogin && !isAlreadyApp) {
      console.log('[need_more_jlu] 认证弹窗捕获到 WebVPN 控制台首页，同源桥接器自动中转至教务系统...');
      const WEBVPN_HASH = '/https/48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1';
      window.location.replace(`https://vpn.jlu.edu.cn${WEBVPN_HASH}/jwapp/sys/kxjas/*default/index.do?THEME=purple&EMAP_LANG=en#/kxjscx`);
      return;
    }
  }

  if (window.__NMJ_IEDU_BRIDGE_INSTALLED__) return;
  window.__NMJ_IEDU_BRIDGE_INSTALLED__ = true;

  console.log('[need_more_jlu] iedu 标签页同源桥接器已就绪:', window.location.href);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'IEDU_BRIDGE_QUERY') {
      const { url, params } = request;

      fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        },
        body: params
      })
        .then(async (resp) => {
          const text = await resp.text();
          sendResponse({
            success: resp.ok,
            status: resp.status,
            redirected: resp.redirected,
            url: resp.url,
            text: text
          });
        })
        .catch((err) => {
          sendResponse({
            success: false,
            error: err.message || String(err)
          });
        });

      return true; // 异步响应必须返回 true
    }
  });

  // 主动握手通知后台
  try {
    chrome.runtime.sendMessage({
      type: 'IEDU_TAB_READY',
      url: window.location.href
    }).catch(() => {});
  } catch (e) {}
})();

/**
 * need_more_jlu - iedu Tab Bridge Content Script
 * 解决校园网教务系统内网证书未被系统信任 (ERR_CERT_AUTHORITY_INVALID) 及 Cookie 隔离问题。
 * 在已放行证书的教务页面同源上下文中转发排课请求，确保护航 100% 连通率。
 */

(() => {
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

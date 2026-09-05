/**
 * need_more_jlu - iedu Tab Bridge Content Script
 * 解决校园网教务系统内网证书未被系统信任 (ERR_CERT_AUTHORITY_INVALID) 及 Cookie 隔离问题。
 * 在已放行证书的教务页面同源上下文中转发排课请求，确保护航 100% 连通率。
 */

(() => {
  // 1. 认证弹窗专属自动中转（绝不误伤用户单开的普通窗口）：
  // 采用双重安全验证：window.name 标示 + 后台 windowId/tabId 校验
  const WEBVPN_HASH = '/https/48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1';
  const TARGET_EMAP_URL = `https://vpn.jlu.edu.cn${WEBVPN_HASH}/jwapp/sys/kxjas/*default/index.do?THEME=purple&EMAP_LANG=en#/kxjscx`;

  let hasRedirected = false;
  let portalWatcherTimer = null;
  let portalObserver = null;

  function tryAutoRedirectToEmap() {
    if (hasRedirected) return;

    const href = window.location.href;
    // 如果已经成功位于教务或 OA 系统内（选课/排课位置），说明认证全流程已圆满完成！
    if (href.includes('/jwapp/') || href.includes('/defaultroot/')) {
      cleanupWatcher();
      console.log('[need_more_jlu] 认证弹窗已成功抵达教务系统（选课/排课位置），通知后台并自动关闭弹窗...');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'AUTH_SUCCESS_CLOSE_WINDOW',
          url: href
        }).catch(() => {});
      }
      setTimeout(() => {
        try { window.close(); } catch (e) {}
      }, 500);
      return;
    }

    const hostname = window.location.hostname;
    if (!hostname.includes('vpn.jlu.edu.cn')) return;

    const pathname = window.location.pathname.toLowerCase();

    // 1. 严格检查是否处于未登录状态，或正在展示微信扫码/登录表单：
    // 只要页面上有二维码、登录表单、用户名密码输入框、或登录提示文本，坚决不得跳转！
    const hasQr = (
      document.querySelector('canvas, .qrcode, #qrcode, .qr-box, .wechat-qrcode, [class*="qrcode"], [id*="qrcode"], [class*="qr_code"], [id*="qr_code"], img[src*="qr"], img[src*="QR"], img[src*="qrcode"]') !== null
    );

    const hasLoginForm = (
      document.querySelector('input[type="password"], input[name="username"], input[name="password"], input[id*="username"], input[id*="password"], #login-form, .login-box, .login-card, #casLoginForm') !== null
    );

    const bodyText = document.body ? (document.body.innerText || '') : '';
    const hasLoginText = (
      bodyText.includes('扫码登录') ||
      bodyText.includes('微信登录') ||
      bodyText.includes('账号密码登录') ||
      bodyText.includes('请使用微信扫描') ||
      bodyText.includes('打开手机微信扫一扫') ||
      bodyText.includes('刷新二维码') ||
      bodyText.includes('统一身份认证')
    );

    // 只要出现上述任一登录/扫码特征，说明用户正在进行登录，坚决阻断跳转！
    if (hasQr || hasLoginForm || hasLoginText) {
      return;
    }

    // 2. 正向严格检查：必须出现已登录 WebVPN 门户控制台的专属特征元素
    // 例如：应用列表中的“(新)教务管理系统”链接、用户注销/退出按钮
    const hasJwappLink = (
      document.querySelector('a[href*="jwapp"]') !== null ||
      document.querySelector('a[href*="48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1"]') !== null ||
      bodyText.includes('(新)教务管理系统') ||
      bodyText.includes('教务管理系统')
    );

    const hasLogoutAction = (
      bodyText.includes('退出登录') ||
      bodyText.includes('安全退出') ||
      bodyText.includes('注销') ||
      document.querySelector('.logout, #logout, [href*="logout"]') !== null
    );

    // 只有当明确出现教务入口或退出按钮，且没有任何登录框/二维码时，才确认已登录！
    if (hasJwappLink || hasLogoutAction) {
      hasRedirected = true;
      cleanupWatcher();
      console.log('[need_more_jlu] 认证弹窗捕获到 WebVPN 控制台首页，同源桥接器立即自动跳转至教务系统...');
      window.location.replace(TARGET_EMAP_URL);
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'CONFIRM_WEBVPN_LOGIN' }).catch(() => {});
        }
      } catch (e) {}
    }
  }

  function cleanupWatcher() {
    if (portalWatcherTimer) {
      clearInterval(portalWatcherTimer);
      portalWatcherTimer = null;
    }
    if (portalObserver) {
      portalObserver.disconnect();
      portalObserver = null;
    }
  }

  function startPortalWatcher() {
    // 立即执行一次探测
    tryAutoRedirectToEmap();

    // 监听 DOM 树变化（捕获 WebVPN 单页应用渲染/表单消失）
    if (!portalObserver && typeof MutationObserver !== 'undefined') {
      portalObserver = new MutationObserver(() => {
        tryAutoRedirectToEmap();
      });
      const targetNode = document.documentElement || document.body;
      if (targetNode) {
        portalObserver.observe(targetNode, { childList: true, subtree: true });
      }
    }

    // 监听路由/状态切换
    window.addEventListener('hashchange', tryAutoRedirectToEmap);
    window.addEventListener('popstate', tryAutoRedirectToEmap);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryAutoRedirectToEmap);
      window.addEventListener('load', tryAutoRedirectToEmap);
    }

    // 轮询双保险（持续 120 秒，每 350ms 检查一次）
    if (!portalWatcherTimer) {
      const startTime = Date.now();
      portalWatcherTimer = setInterval(() => {
        if (Date.now() - startTime > 120000) {
          cleanupWatcher();
          return;
        }
        tryAutoRedirectToEmap();
      }, 350);
    }
  }

  // 判定是否是专属认证弹窗
  if (window.name === 'JLU_AUTH_WINDOW') {
    startPortalWatcher();
  } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    // 异步向后台确认当前标签页是否被后台记录为认证弹窗
    chrome.runtime.sendMessage({ type: 'CHECK_IS_AUTH_WINDOW' }, (res) => {
      if (res && res.isAuthWindow) {
        window.name = 'JLU_AUTH_WINDOW';
        startPortalWatcher();
      }
    });
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

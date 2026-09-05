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

    const hostname = window.location.hostname;
    if (!hostname.includes('vpn.jlu.edu.cn')) return;

    const href = window.location.href;
    // 如果已经位于教务或 OA 系统内，终止监听
    if (href.includes('/jwapp/') || href.includes('/defaultroot/')) {
      cleanupWatcher();
      return;
    }

    const pathname = window.location.pathname.toLowerCase();
    // 严格检查是否仍停留在精确的登录页或 CAS 认证页
    const isExactLoginPage = (pathname === '/login' || pathname === '/login/' || pathname.startsWith('/tpass'));

    // DOM 特征检测：判断是否已进入 WebVPN 门户首页或已渲染出应用入口
    const bodyText = document.body ? (document.body.innerText || '') : '';
    const hasPortalIndicators = (
      bodyText.includes('教务管理系统') ||
      bodyText.includes('(新)教务管理系统') ||
      bodyText.includes('退出登录') ||
      bodyText.includes('注销') ||
      bodyText.includes('安全退出') ||
      document.querySelector('a[href*="jwapp"]') !== null ||
      document.querySelector('a[href*="48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1"]') !== null ||
      document.querySelector('.user-info, .logout, #logout, .portal-header, .portal-content, .resource-item, .app-item') !== null
    );

    // 检查页面是否仍存在密码输入框
    const hasPasswordInput = document.querySelector('input[type="password"]') !== null;

    // 判定是否已经完成登录进入门户：
    // 条件 1: 出现教务入口或门户特征元素
    // 条件 2: 不在精确登录页面路径，且没有密码输入框，且 body 已经有渲染内容
    const isNowInPortal = hasPortalIndicators || (!isExactLoginPage && !hasPasswordInput && document.body && document.body.children.length > 0);

    if (isNowInPortal) {
      hasRedirected = true;
      cleanupWatcher();
      console.log('[need_more_jlu] 认证弹窗捕获到 WebVPN 控制台首页，同源桥接器立即自动跳转至教务系统...');
      window.location.replace(TARGET_EMAP_URL);
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

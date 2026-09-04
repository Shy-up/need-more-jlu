/**
 * need_more_jlu - Main Content Script (OA 原生轻量工具箱模式)
 * 严格遵从渐进增强（Augment, Don't Rebuild）原则：
 * 1. 100% 保留吉大官方原生表格与排版，绝不强制覆盖卡片流或折叠过滤信息；
 * 2. 官方原貌侧边抽屉秒开，拦截普通点击，保留 Ctrl+点击或右键新开标签页习惯；
 * 3. 「上次看到这里」隔离红线，清晰标注上次访问截止位置。
 */

(function() {
  'use strict';

  if (window.__NMJ_INJECTED__) return;
  window.__NMJ_INJECTED__ = true;

  console.log('[need_more_jlu] 启动官方 OA 渐进增强工具箱...');

  const STORAGE_KEY = 'nmj_oa_last_visit';

  function init() {
    enhanceNoticeRows();
    insertLastSeenDivider();
    injectDiscreetStatusIndicator();
  }

  // 1. 增强官方表格行点击：常规点击呼出保真侧边抽屉，保留原生新标签页习惯
  function enhanceNoticeRows() {
    const noticeLinks = document.querySelectorAll('a[href*="getInformation.action"]');
    
    noticeLinks.forEach(link => {
      // Add subtle hover hint class
      link.classList.add('nmj-enhanced-link');

      link.addEventListener('click', function(e) {
        // If user holds Ctrl, Cmd, Shift, or middle click, allow native browser new tab
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) {
          return;
        }

        e.preventDefault();
        const title = link.innerText.trim() || '通知详情';
        const url = link.href;

        if (window.NMJDrawer) {
          window.NMJDrawer.open({ url, title });
        } else {
          window.open(url, '_blank');
        }
      });
    });
  }

  // 2. 「上次看到这里」隔离红线逻辑
  function insertLastSeenDivider() {
    const noticeLinks = document.querySelectorAll('a[href*="getInformation.action"]');
    if (!noticeLinks || noticeLinks.length === 0) return;

    // First notice on page
    const firstLink = noticeLinks[0];
    const firstHref = firstLink.getAttribute('href') || '';
    const firstIdMatch = firstHref.match(/id=([0-9a-zA-Z_-]+)/);
    const currentTopId = firstIdMatch ? firstIdMatch[1] : null;

    let lastVisit = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) lastVisit = JSON.parse(stored);
    } catch (e) {}

    if (lastVisit && lastVisit.topId && currentTopId) {
      // Find the row corresponding to lastTopId
      let targetRow = null;
      noticeLinks.forEach(link => {
        if (!targetRow) {
          const href = link.getAttribute('href') || '';
          if (href.includes(`id=${lastVisit.topId}`)) {
            targetRow = link.closest('tr');
          }
        }
      });

      // If found and it's not the very first row (meaning there are new notices!)
      if (targetRow && targetRow !== firstLink.closest('tr')) {
        const timeDiffStr = formatRelativeTime(lastVisit.time);
        const dividerTr = document.createElement('tr');
        dividerTr.className = 'nmj-seen-divider-tr';
        dividerTr.innerHTML = `
          <td colspan="100%" class="nmj-seen-divider-td">
            <div class="nmj-seen-divider-inner">
              <span class="nmj-seen-divider-flag">🚩</span>
              <span class="nmj-seen-divider-text">上次查看（${timeDiffStr}）看到这里，以上为新发布的校内公文</span>
              <span class="nmj-seen-divider-flag">🚩</span>
            </div>
          </td>
        `;
        targetRow.parentNode.insertBefore(dividerTr, targetRow);
      }
    }

    // Update last visit info (update timestamp and top ID)
    if (currentTopId) {
      const visitData = {
        topId: currentTopId,
        time: Date.now()
      };
      // Save with small delay so current session preserves separator
      setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(visitData));
        } catch (e) {}
      }, 5000);
    }
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '一段时间前';
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${Math.max(1, diffMins)} 分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours} 小时前`;
    } else if (diffDays === 1) {
      const d = new Date(timestamp);
      return `昨天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } else {
      return `${diffDays} 天前`;
    }
  }

  // 3. 右下角极简工具状态栏
  function injectDiscreetStatusIndicator() {
    const badge = document.createElement('div');
    badge.id = 'nmj-discreet-status';
    badge.innerHTML = `
      <div class="nmj-status-pill" title="need_more_jlu 渐进增强已激活">
        <span class="nmj-status-dot"></span>
        <span class="nmj-status-label">OA 工具箱：侧边秒开 · 防漏报全量</span>
      </div>
    `;
    document.body.appendChild(badge);
  }

  // Run on ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

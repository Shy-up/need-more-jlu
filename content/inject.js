/**
 * need_more_jlu - Main Content Script (OA 原生轻量工具箱模式)
 * 严格遵从渐进增强（Augment, Don't Rebuild）原则：
 * 1. 100% 保留吉大官方原生表格与排版，绝不强制覆盖卡片流或折叠过滤信息；
 * 2. 官方原貌侧边抽屉秒开，拦截普通点击，保留 Ctrl+点击或右键新开标签页习惯；
 * 3. 「上次看到这里」隔离红线，清晰标注上次访问截止位置；
 * 4. 设置中支持一键关闭，完全回归 100% 官方纯原生。
 */

(function () {
  'use strict';

  if (window.__NMJ_INJECTED__) return;
  window.__NMJ_INJECTED__ = true;

  const STORAGE_KEY = 'nmj_oa_last_visit';

  let currentSettings = {
    oaToolsEnabled: true,
    drawerEnabled: true,
    seenDividerEnabled: true,
    seenDividerIntervalHours: 0.25
  };

  let isEnhanced = false;

  // Load initial settings
  function loadSettings(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['nmj_settings'], (result) => {
        const s = result.nmj_settings || {};
        currentSettings.oaToolsEnabled = s.oaToolsEnabled !== false;
        currentSettings.drawerEnabled = s.drawerEnabled !== false;
        currentSettings.seenDividerEnabled = s.seenDividerEnabled !== false;
        currentSettings.seenDividerIntervalHours = (s.seenDividerIntervalHours !== undefined)
          ? Number(s.seenDividerIntervalHours)
          : 0.25;
        if (callback) callback();
      });
    } else {
      try {
        const stored = localStorage.getItem('nmj_settings');
        if (stored) {
          const s = JSON.parse(stored);
          currentSettings.oaToolsEnabled = s.oaToolsEnabled !== false;
          currentSettings.drawerEnabled = s.drawerEnabled !== false;
          currentSettings.seenDividerEnabled = s.seenDividerEnabled !== false;
          currentSettings.seenDividerIntervalHours = (s.seenDividerIntervalHours !== undefined)
            ? Number(s.seenDividerIntervalHours)
            : 0.25;
        }
      } catch (e) { }
      if (callback) callback();
    }
  }

  function applyEnhancements() {
    if (!currentSettings.oaToolsEnabled) {
      console.log('[need_more_jlu] OA 增强工具箱已关闭，保持 100% 官方原生页面。');
      teardown();
      return;
    }

    if (isEnhanced) return;
    isEnhanced = true;

    console.log('[need_more_jlu] 启动官方 OA 渐进增强工具箱...');
    enhanceNoticeRows();
    insertLastSeenDivider();
    injectDiscreetStatusIndicator();
  }

  function teardown() {
    isEnhanced = false;

    // Remove drawer root and close drawer if open
    if (window.NMJDrawer && window.NMJDrawer.close) {
      window.NMJDrawer.close();
    }
    const drawerRoot = document.getElementById('nmj-drawer-root');
    if (drawerRoot) drawerRoot.remove();

    // Remove divider
    document.querySelectorAll('.nmj-seen-divider-tr').forEach(el => el.remove());

    // Remove status badge
    const statusBadge = document.getElementById('nmj-discreet-status');
    if (statusBadge) statusBadge.remove();

    // Remove link hover classes
    document.querySelectorAll('.nmj-enhanced-link').forEach(el => {
      el.classList.remove('nmj-enhanced-link');
    });
  }

  // 1. 增强官方表格行点击：常规点击呼出保真侧边抽屉，保留原生新标签页习惯
  function enhanceNoticeRows() {
    const noticeLinks = document.querySelectorAll('a[href*="getInformation.action"]');

    noticeLinks.forEach(link => {
      link.classList.add('nmj-enhanced-link');

      if (!link.__nmj_bound__) {
        link.__nmj_bound__ = true;
        link.addEventListener('click', function (e) {
          // If master switch or drawer is disabled, do nothing (native browser link click)
          if (!currentSettings.oaToolsEnabled || !currentSettings.drawerEnabled) {
            return;
          }

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
      }
    });
  }

  // 2. 「上次看到这里」隔离红线逻辑
  function insertLastSeenDivider() {
    if (!currentSettings.seenDividerEnabled) {
      document.querySelectorAll('.nmj-seen-divider-tr').forEach(el => el.remove());
      return;
    }

    // Avoid duplicate dividers
    if (document.querySelector('.nmj-seen-divider-tr')) return;

    const noticeLinks = document.querySelectorAll('a[href*="getInformation.action"]');
    if (!noticeLinks || noticeLinks.length === 0) return;

    // Filter out pinned notices to find first regular sequential notice
    function findFirstRegularNotice(links) {
      for (const link of links) {
        const text = link.innerText.trim();
        const tr = link.closest('tr');
        const trText = tr ? tr.innerText : '';
        if (text.includes('置顶') || trText.includes('置顶') || link.querySelector('.zhiding')) {
          continue;
        }
        return link;
      }
      return links[0];
    }

    const firstRegularLink = findFirstRegularNotice(noticeLinks);
    const firstHref = firstRegularLink.getAttribute('href') || '';
    const firstIdMatch = firstHref.match(/id=([0-9a-zA-Z_-]+)/);
    const currentTopId = firstIdMatch ? firstIdMatch[1] : null;
    const currentTopTitle = firstRegularLink ? firstRegularLink.innerText.trim() : '';

    let lastVisit = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) lastVisit = JSON.parse(stored);
    } catch (e) { }

    if (lastVisit && lastVisit.topId && currentTopId) {
      // Find row corresponding to lastTopId
      let targetRow = null;
      noticeLinks.forEach(link => {
        if (!targetRow) {
          const href = link.getAttribute('href') || '';
          if (href.includes(`id=${lastVisit.topId}`)) {
            targetRow = link.closest('tr');
          }
        }
      });

      // If found and not identical to top item, render divider
      if (targetRow && targetRow !== firstRegularLink.closest('tr')) {
        const timeDiffStr = formatRelativeTime(lastVisit.time);
        const dividerTr = document.createElement('tr');
        dividerTr.className = 'nmj-seen-divider-tr';
        const titleHtml = lastVisit.topTitle
          ? `看到《<span class="nmj-seen-title" title="${escapeHtml(lastVisit.topTitle)}">${escapeHtml(lastVisit.topTitle)}</span>》`
          : `看到这里`;

        dividerTr.innerHTML = `
          <td colspan="100%" class="nmj-seen-divider-td">
            <div class="nmj-seen-divider-inner">
              <span class="nmj-seen-divider-flag">🚩</span>
              <span class="nmj-seen-divider-text">上次查看（${timeDiffStr}）${titleHtml}，以上为新发布的校内公文</span>
              <span class="nmj-seen-divider-flag">🚩</span>
            </div>
          </td>
        `;
        targetRow.parentNode.insertBefore(dividerTr, targetRow);
      }
    }

    // Persist baseline safely on page unload/hide instead of premature 5s overwrite
    if (currentTopId) {
      const commitVisit = () => {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          const prev = stored ? JSON.parse(stored) : null;
          const intervalHours = (currentSettings.seenDividerIntervalHours !== undefined)
            ? Number(currentSettings.seenDividerIntervalHours)
            : 0.25;
          const intervalMs = Math.max(0, intervalHours * 60 * 60 * 1000);

          // Only update if no previous record, or topId differs, or elapsed interval has passed
          if (!prev || prev.topId !== currentTopId || (Date.now() - (prev.time || 0) >= intervalMs)) {
            const record = {
              topId: currentTopId,
              topTitle: currentTopTitle,
              time: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({ nmj_oa_last_visit: record });
            }
          }
        } catch (e) { }
      };

      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') commitVisit();
      });
      window.addEventListener('beforeunload', commitVisit);
    }
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    if (document.getElementById('nmj-discreet-status')) return;

    const badge = document.createElement('div');
    badge.id = 'nmj-discreet-status';
    badge.innerHTML = `
      <div class="nmj-status-pill" title="need_more_jlu 渐进增强已激活">
        <span class="nmj-status-dot"></span>
        <span class="nmj-status-label">need_more_jlu 已激活</span>
      </div>
    `;
    document.body.appendChild(badge);
  }

  // Listen for live setting changes from options page
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'update_settings' && request.settings) {
        currentSettings.oaToolsEnabled = request.settings.oaToolsEnabled !== false;
        currentSettings.drawerEnabled = request.settings.drawerEnabled !== false;
        if (request.settings.seenDividerEnabled !== undefined) {
          currentSettings.seenDividerEnabled = request.settings.seenDividerEnabled !== false;
        }
        if (request.settings.seenDividerIntervalHours !== undefined) {
          currentSettings.seenDividerIntervalHours = Number(request.settings.seenDividerIntervalHours);
        }

        if (currentSettings.oaToolsEnabled) {
          applyEnhancements();
          if (!currentSettings.seenDividerEnabled) {
            document.querySelectorAll('.nmj-seen-divider-tr').forEach(el => el.remove());
          } else if (!document.querySelector('.nmj-seen-divider-tr')) {
            insertLastSeenDivider();
          }
        } else {
          teardown();
        }
        sendResponse({ success: true });
      }
    });
  }

  // Run on ready
  function start() {
    loadSettings(() => {
      applyEnhancements();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

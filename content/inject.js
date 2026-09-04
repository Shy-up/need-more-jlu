/**
 * need_more_jlu - Main Content Script (OA 原生轻量工具箱模式)
 * 严格遵从渐进增强（Augment, Don't Rebuild）原则：
 * 1. 100% 保留吉大官方原生表格与排版，绝不强制覆盖卡片流或折叠过滤信息；
 * 2. 官方原貌侧边抽屉秒开，拦截普通点击，保留 Ctrl+点击或右键新开标签页习惯；
 * 3. 右下角悬浮药丸：实时显示工具箱状态与公文阅读统计；
 * 4. 最近一周访问历史：自动记录阅读公文历史，超出一周自动清理，支持一键回看公文与清空。
 */

(function () {
  'use strict';

  if (window.__NMJ_INJECTED__) return;
  window.__NMJ_INJECTED__ = true;

  const HISTORY_STORAGE_KEY = 'nmj_oa_read_history';
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  let currentSettings = {
    oaToolsEnabled: true,
    drawerEnabled: true
  };

  let isEnhanced = false;
  let isHistoryOpen = false;

  // Load initial settings
  function loadSettings(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['nmj_settings'], (result) => {
        const s = result.nmj_settings || {};
        currentSettings.oaToolsEnabled = s.oaToolsEnabled !== false;
        currentSettings.drawerEnabled = s.drawerEnabled !== false;
        if (callback) callback();
      });
    } else {
      try {
        const stored = localStorage.getItem('nmj_settings');
        if (stored) {
          const s = JSON.parse(stored);
          currentSettings.oaToolsEnabled = s.oaToolsEnabled !== false;
          currentSettings.drawerEnabled = s.drawerEnabled !== false;
        }
      } catch (e) { }
      if (callback) callback();
    }
  }

  // --- History & Stats Storage Engine ---
  function getCleanHistory(callback) {
    const doFilter = (raw) => {
      let data = raw || { totalCount: 0, items: [] };
      if (typeof data !== 'object') data = { totalCount: 0, items: [] };
      if (!Array.isArray(data.items)) data.items = [];
      if (typeof data.totalCount !== 'number') data.totalCount = data.items.length;

      const now = Date.now();
      const validItems = data.items.filter(item => (now - item.timestamp) <= ONE_WEEK_MS);
      if (validItems.length !== data.items.length) {
        data.items = validItems;
        saveHistoryData(data);
      }
      return data;
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([HISTORY_STORAGE_KEY], (res) => {
        let historyData = res[HISTORY_STORAGE_KEY];
        if (!historyData) {
          try {
            const local = localStorage.getItem(HISTORY_STORAGE_KEY);
            if (local) historyData = JSON.parse(local);
          } catch (e) { }
        }
        callback(doFilter(historyData));
      });
    } else {
      let historyData = null;
      try {
        const local = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (local) historyData = JSON.parse(local);
      } catch (e) { }
      callback(doFilter(historyData));
    }
  }

  function saveHistoryData(data, callback) {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data));
    } catch (e) { }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: data }, () => {
        if (callback) callback();
      });
    } else {
      if (callback) callback();
    }
  }

  function recordNoticeVisit(notice) {
    if (!notice || !notice.url) return;

    getCleanHistory((data) => {
      const now = Date.now();
      const existingIdx = data.items.findIndex(item => item.id && item.id === notice.id || item.url === notice.url);

      if (existingIdx !== -1) {
        // Already visited in the past week: update time and bump to top
        const existing = data.items.splice(existingIdx, 1)[0];
        existing.timestamp = now;
        if (notice.title) existing.title = notice.title;
        data.items.unshift(existing);
      } else {
        // Brand new visit
        data.totalCount = (data.totalCount || 0) + 1;
        data.items.unshift({
          id: notice.id || notice.url,
          title: notice.title || '通知详情',
          url: notice.url,
          timestamp: now
        });
      }

      saveHistoryData(data, () => {
        updateStatusBadgeStats(data);
        if (isHistoryOpen) {
          renderHistoryPopup(data);
        }
      });
    });
  }

  function clearAllHistory(callback) {
    const freshData = { totalCount: 0, items: [] };
    saveHistoryData(freshData, () => {
      updateStatusBadgeStats(freshData);
      renderHistoryPopup(freshData);
      // 清除页面上的已读标灰与徽章
      document.querySelectorAll('.nmj-read-badge').forEach(el => el.remove());
      document.querySelectorAll('.nmj-notice-read').forEach(el => el.classList.remove('nmj-notice-read'));
      document.querySelectorAll('.nmj-row-read').forEach(el => el.classList.remove('nmj-row-read'));
      if (callback) callback();
    });
  }

  // 辅助函数：将元素明确标记为已读（文字加灰、行加灰、插入 [已读] 徽章）
  function markElementAsRead(link) {
    if (!link) return;
    link.classList.add('nmj-notice-read');
    const tr = link.closest('tr');
    if (tr) tr.classList.add('nmj-row-read');

    if (!link.querySelector('.nmj-read-badge')) {
      const badge = document.createElement('span');
      badge.className = 'nmj-read-badge';
      badge.textContent = '已读';
      link.insertBefore(badge, link.firstChild);
    }
  }

  // 标灰页面上已经阅读过的公文（支持 ID、URL、标题三位一体匹配，确保 100% 成功标灰）
  function markReadNotices(historyData) {
    const readIds = new Set();
    const readUrls = new Set();
    const readTitles = new Set();

    if (historyData && Array.isArray(historyData.items)) {
      historyData.items.forEach(item => {
        if (item.id) readIds.add(String(item.id));
        if (item.url) readUrls.add(item.url);
        if (item.title) {
          const cleanTitle = item.title.replace(/^已读\s*/, '').trim();
          if (cleanTitle) readTitles.add(cleanTitle);
        }
      });
    }

    const noticeLinks = document.querySelectorAll('a[href*="getInformation.action"]');
    noticeLinks.forEach(link => {
      const url = link.href;
      const rawText = link.innerText || '';
      const cleanText = rawText.replace(/^已读\s*/, '').trim();
      const match = url.match(/id=([0-9a-zA-Z_-]+)/);
      const id = match ? match[1] : null;

      const isRead = (id && readIds.has(String(id))) ||
                     readUrls.has(url) ||
                     (cleanText && readTitles.has(cleanText));

      if (isRead) {
        markElementAsRead(link);
      }
    });
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '刚刚';
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays === 1) {
      const d = new Date(timestamp);
      return `昨天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function applyEnhancements() {
    if (!currentSettings.oaToolsEnabled) {
      console.log('[need_more_jlu] OA 增强工具箱已关闭，保持 100% 官方原生页面。');
      teardown();
      return;
    }

    if (isEnhanced) return;
    isEnhanced = true;

    console.log('[need_more_jlu] 启动官方 OA 渐进增强工具箱与阅读历史统计...');
    enhanceNoticeRows();
    injectDiscreetStatusIndicator();
    getCleanHistory((data) => {
      markReadNotices(data);
    });
  }

  function teardown() {
    isEnhanced = false;

    // Remove drawer root and close drawer if open
    if (window.NMJDrawer && window.NMJDrawer.close) {
      window.NMJDrawer.close();
    }
    const drawerRoot = document.getElementById('nmj-drawer-root');
    if (drawerRoot) drawerRoot.remove();

    // Remove status badge
    const statusBadge = document.getElementById('nmj-discreet-status');
    if (statusBadge) statusBadge.remove();

    // Remove link hover classes & read gray classes
    document.querySelectorAll('.nmj-read-badge').forEach(el => el.remove());
    document.querySelectorAll('.nmj-enhanced-link').forEach(el => {
      el.classList.remove('nmj-enhanced-link');
    });
    document.querySelectorAll('.nmj-notice-read').forEach(el => {
      el.classList.remove('nmj-notice-read');
    });
    document.querySelectorAll('.nmj-row-read').forEach(el => {
      el.classList.remove('nmj-row-read');
    });
  }

  // 1. 增强官方表格行点击：记录阅读历史 + 抽屉秒开
  function enhanceNoticeRows() {
    const noticeLinks = document.querySelectorAll('a[href*="getInformation.action"]');

    noticeLinks.forEach(link => {
      link.classList.add('nmj-enhanced-link');

      if (!link.__nmj_bound__) {
        link.__nmj_bound__ = true;
        link.addEventListener('click', function (e) {
          const rawText = link.innerText || '';
          const cleanTitle = rawText.replace(/^已读\s*/, '').trim() || '通知详情';
          const url = link.href;
          const match = url.match(/id=([0-9a-zA-Z_-]+)/);
          const id = match ? match[1] : url;

          // 即刻在界面中将此公文明显标灰并加上[已读]徽章
          markElementAsRead(link);

          // 自动记录公文阅读历史与统计
          recordNoticeVisit({ id, title: cleanTitle, url });

          // If master switch or drawer is disabled, do nothing (native browser link click)
          if (!currentSettings.oaToolsEnabled || !currentSettings.drawerEnabled) {
            return;
          }

          // If user holds Ctrl, Cmd, Shift, or middle click, allow native browser new tab
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) {
            return;
          }

          e.preventDefault();

          if (window.NMJDrawer) {
            window.NMJDrawer.open({ url, title });
          } else {
            window.open(url, '_blank');
          }
        });
      }
    });
  }

  // 2. 右下角极简工具状态栏与阅读历史展开浮层
  function injectDiscreetStatusIndicator() {
    if (document.getElementById('nmj-discreet-status')) return;

    const wrap = document.createElement('div');
    wrap.id = 'nmj-discreet-status';
    wrap.innerHTML = `
      <!-- Status Pill Bar -->
      <div class="nmj-status-pill" id="nmj-status-pill" title="点击查看最近一周查阅公文历史与阅读统计">
        <span class="nmj-status-dot"></span>
        <span class="nmj-status-label">need_more_jlu 已激活</span>
        <span class="nmj-status-divider"></span>
        <span class="nmj-status-count-badge" id="nmj-status-count-badge" title="最近7天阅读量 / 累计总阅读量">
          <span>📖</span>
          <span>7天: <strong id="nmj-stat-pill-week">0</strong></span>
          <span style="opacity: 0.4;">/</span>
          <span>总计: <strong id="nmj-stat-pill-total">0</strong></span>
        </span>
      </div>

      <!-- History Flyout Panel -->
      <div class="nmj-history-popup" id="nmj-history-popup">
        <div class="nmj-history-header">
          <div class="nmj-history-title">
            <span>📑 公文查阅历史</span>
            <span class="nmj-history-badge-week">近7天自动留存</span>
          </div>
          <div class="nmj-history-actions">
            <button type="button" class="nmj-history-btn-icon clear" id="nmj-btn-clear-history" title="清空全部查阅历史">
              <span>🗑️</span>
              <span>清空</span>
            </button>
            <button type="button" class="nmj-history-btn-icon" id="nmj-btn-close-history" title="收起面板">
              <span>✕</span>
            </button>
          </div>
        </div>

        <div class="nmj-history-stats-bar">
          <div>总阅读报告: <span class="nmj-stat-highlight" id="nmj-stat-total">0</span> 篇</div>
          <div style="color: #94a3b8;">本周活跃记录: <span class="nmj-stat-highlight" id="nmj-stat-week" style="color: #38bdf8;">0</span> 条</div>
        </div>

        <div class="nmj-history-list" id="nmj-history-list"></div>
      </div>
    `;

    document.body.appendChild(wrap);

    const pill = document.getElementById('nmj-status-pill');
    const popup = document.getElementById('nmj-history-popup');
    const btnClose = document.getElementById('nmj-btn-close-history');
    const btnClear = document.getElementById('nmj-btn-clear-history');

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      isHistoryOpen = !isHistoryOpen;
      popup.classList.toggle('open', isHistoryOpen);
      pill.classList.toggle('active', isHistoryOpen);
      if (isHistoryOpen) {
        getCleanHistory((data) => renderHistoryPopup(data));
      }
    });

    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        isHistoryOpen = false;
        popup.classList.remove('open');
        pill.classList.remove('active');
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确定要清空最近一周公文查阅历史和统计吗？')) {
          clearAllHistory();
        }
      });
    }

    // Close on click outside or ESC
    document.addEventListener('click', (e) => {
      if (isHistoryOpen && !wrap.contains(e.target)) {
        isHistoryOpen = false;
        popup.classList.remove('open');
        pill.classList.remove('active');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isHistoryOpen) {
        isHistoryOpen = false;
        popup.classList.remove('open');
        pill.classList.remove('active');
      }
    });

    // Initial load stats to badge
    getCleanHistory((data) => {
      updateStatusBadgeStats(data);
      markReadNotices(data);
    });
  }

  function updateStatusBadgeStats(data) {
    const pillWeek = document.getElementById('nmj-stat-pill-week');
    const pillTotal = document.getElementById('nmj-stat-pill-total');
    if (pillWeek) {
      pillWeek.textContent = data.items ? data.items.length : 0;
    }
    if (pillTotal) {
      pillTotal.textContent = data.totalCount || 0;
    }
  }

  function renderHistoryPopup(data) {
    const statTotal = document.getElementById('nmj-stat-total');
    const statWeek = document.getElementById('nmj-stat-week');
    const listContainer = document.getElementById('nmj-history-list');

    if (statTotal) statTotal.textContent = data.totalCount || 0;
    if (statWeek) statWeek.textContent = (data.items ? data.items.length : 0);

    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (!data.items || data.items.length === 0) {
      listContainer.innerHTML = `
        <div class="nmj-history-empty">
          <span class="nmj-history-empty-icon">📭</span>
          <div>最近一周暂无查阅历史</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">点击通知列表中的任意公文，将自动为您汇聚在此处</div>
        </div>
      `;
      return;
    }

    data.items.forEach(item => {
      const el = document.createElement('a');
      el.className = 'nmj-history-item';
      el.href = item.url;
      el.innerHTML = `
        <div class="nmj-history-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="nmj-history-item-meta">
          <span class="nmj-history-item-time">
            <span>🕒</span>
            <span>${formatRelativeTime(item.timestamp)}</span>
          </span>
          <span class="nmj-history-item-action">重温公文 ↗</span>
        </div>
      `;

      el.addEventListener('click', (e) => {
        // If user holds Ctrl, Cmd, Shift, or middle click, allow native browser new tab
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) {
          return;
        }

        e.preventDefault();
        // Update visit timestamp
        recordNoticeVisit({ id: item.id, title: item.title, url: item.url });

        if (window.NMJDrawer && currentSettings.drawerEnabled) {
          window.NMJDrawer.open({ url: item.url, title: item.title });
        } else {
          window.open(item.url, '_blank');
        }
      });

      listContainer.appendChild(el);
    });
  }

  // Listen for live setting changes from options page
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'update_settings' && request.settings) {
        currentSettings.oaToolsEnabled = request.settings.oaToolsEnabled !== false;
        currentSettings.drawerEnabled = request.settings.drawerEnabled !== false;

        if (currentSettings.oaToolsEnabled) {
          applyEnhancements();
        } else {
          teardown();
        }
        sendResponse({ success: true });
      } else if (request.action === 'clear_history') {
        clearAllHistory(() => {
          sendResponse({ success: true });
        });
        return true;
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

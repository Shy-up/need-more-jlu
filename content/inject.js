/**
 * need_more_jlu - Main Content Script
 * Transforms the legacy OA notification layout into a modern, student-centric card interface.
 */

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__NMJ_INJECTED__) return;
  window.__NMJ_INJECTED__ = true;

  console.log('[need_more_jlu] 初始化吉大现代阅读增强扩展...');

  // State
  let allNotices = [];
  let readMap = {};
  let starMap = {};
  let currentSettings = {
    theme: 'light',
    customWallpaper: '',
    customAccent: '#0284c7',
    onlyUnread: false,
    onlyToday: false,
    drawerEnabled: true,
    activeCategory: 'all',
    searchKeyword: ''
  };

  // Safe Storage wrapper (supports both chrome.storage and localStorage fallback)
  const Storage = {
    get: function(keys, callback) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, callback);
      } else {
        const res = {};
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => {
          try {
            const v = localStorage.getItem('nmj_' + k);
            if (v) res[k] = JSON.parse(v);
          } catch(e) {}
        });
        callback(res);
      }
    },
    set: function(obj, callback) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj, callback);
      } else {
        for (let k in obj) {
          try {
            localStorage.setItem('nmj_' + k, JSON.stringify(obj[k]));
          } catch(e) {}
        }
        if (callback) callback();
      }
    }
  };

  // Initialize
  Storage.get(['nmj_read_map', 'nmj_star_map', 'nmj_settings'], (result) => {
    readMap = result.nmj_read_map || {};
    starMap = result.nmj_star_map || {};
    if (result.nmj_settings) {
      currentSettings = Object.assign(currentSettings, result.nmj_settings);
    }

    applyTheme(currentSettings.theme, currentSettings.customWallpaper, currentSettings.customAccent);
    parseLegacyDOM();
    renderModernUI();
  });

  // Listen for messages from popup or options
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'change_theme') {
        currentSettings.theme = request.theme;
        currentSettings.customWallpaper = request.wallpaper || '';
        applyTheme(request.theme, request.wallpaper, request.accent);
        saveSettings();
        sendResponse({ success: true });
      } else if (request.action === 'mark_all_read') {
        markAllAsRead();
        sendResponse({ success: true });
      } else if (request.action === 'get_stats') {
        sendResponse({
          total: allNotices.length,
          unread: allNotices.filter(n => !readMap[n.id]).length,
          starred: Object.keys(starMap).length
        });
      }
    });
  }

  function applyTheme(theme, wallpaper, accent) {
    document.documentElement.setAttribute('data-nmj-theme', theme || 'light');
    document.body.classList.add('nmj-enhanced');

    if (accent) {
      document.documentElement.style.setProperty('--nmj-primary', accent);
    }

    if (wallpaper) {
      document.documentElement.style.setProperty('--nmj-wallpaper-url', `url("${wallpaper}")`);
      document.body.classList.add('nmj-has-wallpaper');
    } else {
      document.documentElement.style.setProperty('--nmj-wallpaper-url', 'none');
      document.body.classList.remove('nmj-has-wallpaper');
    }
  }

  function saveSettings() {
    Storage.set({ nmj_settings: currentSettings });
  }

  // Parse original legacy DOM
  function parseLegacyDOM() {
    allNotices = [];

    // Find all links to getInformation.action
    const noticeLinks = document.querySelectorAll('a[href*="getInformation.action"]');
    
    noticeLinks.forEach(link => {
      const href = link.getAttribute('href');
      const idMatch = href.match(/id=([0-9a-zA-Z_-]+)/);
      if (!idMatch) return;
      const id = idMatch[1];

      // Avoid duplicates
      if (allNotices.some(n => n.id === id)) return;

      const title = link.innerText.trim();
      if (!title) return;

      // Find row or parent container to extract dept, date, pinned, new
      const row = link.closest('tr') || link.parentElement;
      let department = '校内机构';
      let publishTime = '近期';
      let isPinned = false;
      let isNew = false;

      if (row) {
        // Pinned check
        if (row.innerText.includes('[置顶]') || row.innerText.includes('置顶')) {
          isPinned = true;
        }

        // New icon check
        if (row.querySelector('img[src*="new"]') || row.querySelector('img[src*="NEW"]')) {
          isNew = true;
        }

        // Department extraction (usually another link with channel or dept in text)
        const otherLinks = row.querySelectorAll('a:not([href*="getInformation.action"])');
        otherLinks.forEach(l => {
          const t = l.innerText.trim();
          if (t && t.length < 25 && !t.includes('>') && !t.includes('详细')) {
            department = t;
          }
        });

        // Time extraction: matches '今天 11:22', '昨天 16:30', or '2026-08-17' or '09-04'
        const rowText = row.innerText;
        const timeMatch = rowText.match(/(今天\s*\d{2}:\d{2}|昨天\s*\d{2}:\d{2}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2})/);
        if (timeMatch) {
          publishTime = timeMatch[1].trim();
        }
      }

      // Timeline category
      let timelineGroup = 'earlier'; // 'today' | 'yesterday' | 'recent' | 'earlier'
      if (publishTime.includes('今天')) {
        timelineGroup = 'today';
      } else if (publishTime.includes('昨天')) {
        timelineGroup = 'yesterday';
      } else if (isRecentDate(publishTime)) {
        timelineGroup = 'recent';
      }

      // Student focus category
      const category = classifyCategory(department, title);

      allNotices.push({
        id,
        title,
        url: link.href, // full absolute link
        department,
        publishTime,
        isPinned,
        isNew,
        timelineGroup,
        category,
        isRead: !!readMap[id],
        isStarred: !!starMap[id]
      });
    });

    console.log(`[need_more_jlu] 解析完成，共提取 ${allNotices.length} 条通知。`);
  }

  function isRecentDate(timeStr) {
    if (!timeStr) return false;
    // Check if within last 3 days
    const match = timeStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const pubDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      const now = new Date();
      const diffDays = (now - pubDate) / (1000 * 60 * 60 * 24);
      return diffDays <= 3;
    }
    return false;
  }

  function classifyCategory(dept, title) {
    const text = (dept + ' ' + title).toLowerCase();
    if (text.includes('本科生院') || text.includes('研究生院') || text.includes('教务') || text.includes('选课') || text.includes('转专业') || text.includes('推免') || text.includes('教材') || text.includes('学籍') || text.includes('培养')) {
      return 'academic'; // 教务学籍
    }
    if (text.includes('学工部') || text.includes('学生工作') || text.includes('团委') || text.includes('武装部') || text.includes('奖学金') || text.includes('助学金') || text.includes('评优') || text.includes('开学典礼') || text.includes('志愿')) {
      return 'scholarship'; // 奖助学生活动
    }
    if (text.includes('就业') || text.includes('创业') || text.includes('招聘') || text.includes('宣讲') || text.includes('实习')) {
      return 'career'; // 就业招聘
    }
    if (text.includes('体育') || text.includes('心理') || text.includes('健康') || text.includes('体测') || text.includes('运动场') || text.includes('校医院')) {
      return 'life'; // 体育生活
    }
    return 'admin'; // 综合行政/其他
  }

  // Render modern UI
  function renderModernUI() {
    let root = document.getElementById('nmj-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'nmj-root';
      document.body.appendChild(root);
    }

    const todayStr = getFormattedDate();
    const unreadCount = allNotices.filter(n => !readMap[n.id]).length;
    const starredCount = Object.keys(starMap).length;

    root.innerHTML = `
      <!-- App Header -->
      <header class="nmj-header">
        <div class="nmj-brand">
          <div class="nmj-logo-badge">JLU</div>
          <div class="nmj-brand-text">
            <h1>校内通知 <span class="nmj-tag-pill">专注增强版</span></h1>
            <p>吉林大学校园网 · ${todayStr}</p>
          </div>
        </div>

        <div class="nmj-header-actions">
          <!-- Theme Quick Switch -->
          <button class="nmj-btn" id="nmj-toggle-theme-btn" title="切换深色/浅色/护眼主题">
            ${getThemeIcon(currentSettings.theme)} 主题
          </button>
          
          <!-- Starred Filter Button -->
          <button class="nmj-btn ${currentSettings.activeCategory === 'starred' ? 'nmj-btn-primary' : ''}" id="nmj-starred-tab-btn" title="查看收藏的通知">
            ⭐ 收藏 (<span id="nmj-starred-count">${starredCount}</span>)
          </button>

          <!-- Native Mode Toggle -->
          <button class="nmj-btn" id="nmj-native-view-btn" title="临时切回原始页面">
            🔙 原始页面
          </button>
        </div>
      </header>

      <!-- Search & Filter Toolbar -->
      <div class="nmj-toolbar">
        <div class="nmj-toolbar-row1">
          <!-- Category Tabs -->
          <div class="nmj-tabs" id="nmj-category-tabs">
            <button class="nmj-tab ${currentSettings.activeCategory === 'all' ? 'active' : ''}" data-cat="all">全部通知</button>
            <button class="nmj-tab ${currentSettings.activeCategory === 'academic' ? 'active' : ''}" data-cat="academic">🎓 教务与学籍</button>
            <button class="nmj-tab ${currentSettings.activeCategory === 'scholarship' ? 'active' : ''}" data-cat="scholarship">🏆 奖助与学工</button>
            <button class="nmj-tab ${currentSettings.activeCategory === 'career' ? 'active' : ''}" data-cat="career">💼 就业招聘</button>
            <button class="nmj-tab ${currentSettings.activeCategory === 'life' ? 'active' : ''}" data-cat="life">🏃 体育生活</button>
            <button class="nmj-tab ${currentSettings.activeCategory === 'admin' ? 'active' : ''}" data-cat="admin">📢 机关行政</button>
          </div>

          <!-- Search Box -->
          <div class="nmj-search-box">
            <span>🔍</span>
            <input type="text" id="nmj-search-input" placeholder="在当前通知中速搜..." value="${escapeHtml(currentSettings.searchKeyword)}" />
          </div>
        </div>

        <div class="nmj-filter-toggles">
          <!-- Fast New / Old Toggles -->
          <button class="nmj-toggle-btn ${currentSettings.onlyUnread ? 'active' : ''}" id="nmj-toggle-unread">
            🔵 只看未读 (<span id="nmj-unread-count">${unreadCount}</span>)
          </button>

          <button class="nmj-toggle-btn ${currentSettings.onlyToday ? 'active' : ''}" id="nmj-toggle-today">
            🔥 仅看今日发布
          </button>

          <div style="flex: 1;"></div>

          <button class="nmj-btn" id="nmj-mark-all-read" style="font-size: 12px; padding: 4px 10px;">
            ✓ 本页标为已读
          </button>
        </div>
      </div>

      <!-- Notice List Container -->
      <div id="nmj-notice-container"></div>

      <!-- Modernized Pagination -->
      <div class="nmj-pagination" id="nmj-pagination-container"></div>
    `;

    bindHeaderEvents();
    renderNoticeCards();
    renderPagination();
  }

  function getThemeIcon(theme) {
    switch (theme) {
      case 'dark': return '🌙';
      case 'sepia': return '📜';
      case 'navy': return '🎓';
      case 'custom': return '🖼️';
      default: return '☀️';
    }
  }

  function bindHeaderEvents() {
    // Theme toggle
    const themeBtn = document.getElementById('nmj-toggle-theme-btn');
    themeBtn.addEventListener('click', () => {
      const themes = ['light', 'dark', 'sepia', 'navy'];
      if (currentSettings.customWallpaper) {
        themes.push('custom');
      }
      let nextIdx = (themes.indexOf(currentSettings.theme) + 1) % themes.length;
      if (nextIdx === -1) nextIdx = 0;
      currentSettings.theme = themes[nextIdx];
      applyTheme(currentSettings.theme, currentSettings.customWallpaper, currentSettings.customAccent);
      saveSettings();
      themeBtn.innerHTML = `${getThemeIcon(currentSettings.theme)} 主题`;
    });

    // Native view toggle
    const nativeBtn = document.getElementById('nmj-native-view-btn');
    if (nativeBtn) {
      nativeBtn.addEventListener('click', () => {
        document.documentElement.setAttribute('data-nmj-native', 'true');
        showNativeReturnButton();
      });
    }

    // Category tabs
    document.querySelectorAll('.nmj-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.nmj-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentSettings.activeCategory = e.target.dataset.cat;
        renderNoticeCards();
      });
    });

    // Starred Tab
    document.getElementById('nmj-starred-tab-btn').addEventListener('click', () => {
      document.querySelectorAll('.nmj-tab').forEach(t => t.classList.remove('active'));
      currentSettings.activeCategory = 'starred';
      renderNoticeCards();
    });

    // Unread toggle
    document.getElementById('nmj-toggle-unread').addEventListener('click', (e) => {
      currentSettings.onlyUnread = !currentSettings.onlyUnread;
      e.currentTarget.classList.toggle('active', currentSettings.onlyUnread);
      renderNoticeCards();
    });

    // Today toggle
    document.getElementById('nmj-toggle-today').addEventListener('click', (e) => {
      currentSettings.onlyToday = !currentSettings.onlyToday;
      e.currentTarget.classList.toggle('active', currentSettings.onlyToday);
      renderNoticeCards();
    });

    // Mark all read
    document.getElementById('nmj-mark-all-read').addEventListener('click', markAllAsRead);

    // Search input
    const searchInput = document.getElementById('nmj-search-input');
    searchInput.addEventListener('input', (e) => {
      currentSettings.searchKeyword = e.target.value.trim().toLowerCase();
      renderNoticeCards();
    });
  }

  function markAllAsRead() {
    const now = Date.now();
    allNotices.forEach(n => {
      readMap[n.id] = now;
      n.isRead = true;
    });
    Storage.set({ nmj_read_map: readMap }, () => {
      updateStats();
      renderNoticeCards();
    });
  }

  function updateStats() {
    const unreadCount = allNotices.filter(n => !readMap[n.id]).length;
    const starredCount = Object.keys(starMap).length;
    const unreadEl = document.getElementById('nmj-unread-count');
    const starEl = document.getElementById('nmj-starred-count');
    if (unreadEl) unreadEl.textContent = unreadCount;
    if (starEl) starEl.textContent = starredCount;
  }

  function showNativeReturnButton() {
    let bar = document.getElementById('nmj-native-floating-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nmj-native-floating-bar';
      bar.innerHTML = `
        <button class="nmj-btn nmj-btn-primary" style="padding: 10px 20px; font-size: 13.5px; border-radius: 30px; box-shadow: 0 6px 20px rgba(30,64,175,0.4); cursor: pointer; border: none;">
          ✨ 切回现代增强版
        </button>
      `;
      document.body.appendChild(bar);
      bar.querySelector('button').addEventListener('click', () => {
        document.documentElement.removeAttribute('data-nmj-native');
        bar.remove();
      });
    }
  }

  // Filter & Group Notices
  function renderNoticeCards() {
    const container = document.getElementById('nmj-notice-container');
    if (!container) return;

    // Filter
    let filtered = allNotices.filter(n => {
      if (currentSettings.onlyUnread && readMap[n.id]) return false;
      if (currentSettings.onlyToday && !n.publishTime.includes('今天')) return false;
      if (currentSettings.activeCategory === 'starred' && !starMap[n.id]) return false;
      if (currentSettings.activeCategory !== 'all' && currentSettings.activeCategory !== 'starred') {
        if (n.category !== currentSettings.activeCategory) return false;
      }
      if (currentSettings.searchKeyword) {
        const full = (n.title + ' ' + n.department).toLowerCase();
        if (!full.includes(currentSettings.searchKeyword)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; background: var(--nmj-surface); border-radius: var(--nmj-radius-lg); border: 1px solid var(--nmj-border); color: var(--nmj-text-muted);">
          <div style="font-size: 36px; margin-bottom: 12px;">🍃</div>
          <div style="font-size: 16px; font-weight: 600; color: var(--nmj-text-primary);">暂无符合筛选条件的通知</div>
          <div style="font-size: 13px; margin-top: 6px;">您可以尝试清除搜索词或重置筛选标签</div>
        </div>
      `;
      return;
    }

    // Group by Timeline
    const groups = [
      { key: 'today', title: '🔥 今日最新发布', items: filtered.filter(n => n.timelineGroup === 'today') },
      { key: 'yesterday', title: '⭐ 昨日发布', items: filtered.filter(n => n.timelineGroup === 'yesterday') },
      { key: 'recent', title: '📅 近 3 天发布', items: filtered.filter(n => n.timelineGroup === 'recent') },
      { key: 'earlier', title: '⏳ 早期历史通知', items: filtered.filter(n => n.timelineGroup === 'earlier') }
    ];

    let html = '';

    groups.forEach(group => {
      if (group.items.length === 0) return;

      html += `
        <div class="nmj-timeline-section">
          <div class="nmj-section-header">
            <span class="nmj-section-title">${group.title}</span>
            <span class="nmj-section-badge">${group.items.length} 篇</span>
          </div>
          <div class="nmj-card-list">
            ${group.items.map(item => renderSingleCard(item)).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Bind card clicks
    container.querySelectorAll('.nmj-card').forEach(card => {
      const id = card.dataset.id;
      const item = allNotices.find(n => n.id === id);
      if (!item) return;

      // Prevent link default navigation if left click without modifier keys
      const titleLink = card.querySelector('.nmj-card-title');
      if (titleLink) {
        titleLink.addEventListener('click', (e) => {
          if (!e.ctrlKey && !e.metaKey && e.button !== 1) {
            e.preventDefault();
          }
        });
      }

      // Card click -> preview drawer
      card.addEventListener('click', (e) => {
        // Prevent if clicking star button
        if (e.target.closest('.nmj-star-btn')) return;

        // Allow ctrl/cmd/middle click to open in new tab
        if (e.ctrlKey || e.metaKey || e.button === 1) {
          return;
        }

        e.preventDefault();

        // Mark as read
        if (!readMap[item.id]) {
          readMap[item.id] = Date.now();
          item.isRead = true;
          Storage.set({ nmj_read_map: readMap });
          card.classList.remove('nmj-unread');
          card.classList.add('nmj-read');
          updateStats();
        }

        // Open Side Drawer
        if (currentSettings.drawerEnabled !== false && window.NMJDrawer) {
          window.NMJDrawer.open(item);
        } else {
          window.open(item.url, '_blank');
        }
      });

      // Star click
      const starBtn = card.querySelector('.nmj-star-btn');
      if (starBtn) {
        starBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isStarred = !starMap[item.id];
          if (isStarred) {
            starMap[item.id] = { id: item.id, title: item.title, url: item.url, dept: item.department, time: item.publishTime };
            starBtn.classList.add('starred');
            starBtn.textContent = '★';
          } else {
            delete starMap[item.id];
            starBtn.classList.remove('starred');
            starBtn.textContent = '☆';
          }
          Storage.set({ nmj_star_map: starMap });
          updateStats();
        });
      }
    });
  }

  function renderSingleCard(item) {
    const isRead = !!readMap[item.id];
    const isStarred = !!starMap[item.id];

    return `
      <div class="nmj-card ${isRead ? 'nmj-read' : 'nmj-unread'}" data-id="${item.id}">
        <div class="nmj-card-left">
          <div class="nmj-status-indicator" title="${isRead ? '已读' : '未读新通知'}"></div>
          ${item.isPinned ? '<span class="nmj-badge-pin">置顶</span>' : ''}
          ${item.isNew ? '<span class="nmj-badge-new">NEW</span>' : ''}
          <a href="${item.url}" class="nmj-card-title" title="${escapeHtml(item.title)}">
            ${escapeHtml(item.title)}
          </a>
        </div>

        <div class="nmj-card-right">
          <span class="nmj-dept-tag">${escapeHtml(item.department)}</span>
          <span class="nmj-time-text">${escapeHtml(item.publishTime)}</span>
          <button class="nmj-star-btn ${isStarred ? 'starred' : ''}" title="${isStarred ? '取消收藏' : '加入收藏'}">
            ${isStarred ? '★' : '☆'}
          </button>
        </div>
      </div>
    `;
  }

  // Modernized pagination
  function renderPagination() {
    const container = document.getElementById('nmj-pagination-container');
    if (!container) return;

    // Look for original pagination elements
    // The original page has links for: 首页, 上页, 1, 2, 3, 下页, 尾页
    const pageText = document.body.innerText;
    const pageMatch = pageText.match(/第\s*(\d+)\/(\d+)\s*页/);
    const currentPage = pageMatch ? pageMatch[1] : '1';
    const totalPages = pageMatch ? pageMatch[2] : '1';

    // Extract original pagination links
    const originalLinks = Array.from(document.querySelectorAll('a')).filter(a => {
      const text = a.innerText.trim();
      return ['首页', '上页', '下页', '尾页'].includes(text) || /^\d+$/.test(text);
    });

    let prevHref = null;
    let nextHref = null;

    originalLinks.forEach(l => {
      if (l.innerText.includes('上页')) prevHref = l.href;
      if (l.innerText.includes('下页')) nextHref = l.href;
    });

    container.innerHTML = `
      <a href="${prevHref || '#'}" class="nmj-btn ${!prevHref ? 'disabled' : ''}" style="${!prevHref ? 'pointer-events: none; opacity: 0.5;' : ''}">
        ← 上一页
      </a>
      <span class="nmj-page-info">第 <strong>${currentPage}</strong> / ${totalPages} 页</span>
      <a href="${nextHref || '#'}" class="nmj-btn ${!nextHref ? 'disabled' : ''}" style="${!nextHref ? 'pointer-events: none; opacity: 0.5;' : ''}">
        下一页 →
      </a>
    `;
  }

  function getFormattedDate() {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const day = days[now.getDay()];
    return `${y}年${m}月${d}日 ${day}`;
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();

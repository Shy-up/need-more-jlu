/**
 * need_more_jlu - Popup Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const statUnread = document.getElementById('stat-unread');
  const statStarred = document.getElementById('stat-starred');
  const statTotal = document.getElementById('stat-total');
  const starredCountHeader = document.getElementById('starred-header-count');
  const starredList = document.getElementById('starred-list');
  const themeBtns = document.querySelectorAll('.theme-btn');
  const btnMarkRead = document.getElementById('btn-mark-read');
  const btnOpenOA = document.getElementById('btn-open-oa');

  // Load stored state
  chrome.storage.local.get(['nmj_settings', 'nmj_star_map', 'nmj_read_map'], (res) => {
    const settings = res.nmj_settings || { theme: 'light' };
    const stars = res.nmj_star_map || {};
    const read = res.nmj_read_map || {};

    // Active theme button
    themeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });

    // Starred count & list
    const starKeys = Object.keys(stars);
    statStarred.textContent = starKeys.length;
    starredCountHeader.textContent = starKeys.length;

    renderStarredList(stars);

    // Query active tab for live stats
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'get_stats' }, (resp) => {
          if (chrome.runtime.lastError || !resp) {
            statTotal.textContent = '-';
            statUnread.textContent = '-';
          } else {
            statTotal.textContent = resp.total;
            statUnread.textContent = resp.unread;
          }
        });
      }
    });
  });

  // Theme click
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const chosenTheme = btn.dataset.theme;

      // Update storage
      chrome.storage.local.get(['nmj_settings'], (res) => {
        const settings = res.nmj_settings || {};
        settings.theme = chosenTheme;
        chrome.storage.local.set({ nmj_settings: settings });

        // Notify active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'change_theme',
              theme: chosenTheme,
              wallpaper: settings.customWallpaper,
              accent: settings.customAccent
            });
          }
        });
      });
    });
  });

  // Mark all read
  btnMarkRead.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'mark_all_read' }, () => {
          statUnread.textContent = '0';
        });
      }
    });
  });

  // Open OA
  btnOpenOA.addEventListener('click', () => {
    // Open WebVPN OA url
    const targetUrl = 'https://vpn.jlu.edu.cn/https/48714f71342f7a336d582f7e2857373750cd3d1004df80a0b5971c1b1a/defaultroot/PortalInformation!jldxList.action?channelId=179577';
    chrome.tabs.create({ url: targetUrl });
  });

  function renderStarredList(stars) {
    const items = Object.values(stars);
    if (items.length === 0) {
      starredList.innerHTML = '<div class="empty-tip">暂无收藏的通知，可在通知卡片点击 ☆ 收藏</div>';
      return;
    }

    starredList.innerHTML = items.slice(0, 10).map(item => `
      <a href="${item.url}" target="_blank" class="starred-item" title="${item.title}">
        <span class="starred-title">${escapeHtml(item.title)}</span>
        <span class="starred-dept">${escapeHtml(item.dept || '')}</span>
      </a>
    `).join('');
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});

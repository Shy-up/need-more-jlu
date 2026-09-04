/**
 * need_more_jlu - Options Controller
 * 专注于吉大 OA 官方增强工具箱与数据管理：
 * 1. 官方原貌侧边抽屉秒开开关；
 * 2. 清空公文阅读历史与统计；
 * 3. 实时自动保存与多标签页广播。
 */

document.addEventListener('DOMContentLoaded', () => {
  const oaToolsCheck = document.getElementById('oa-tools-enabled');
  const oaSubOptions = document.getElementById('oa-sub-options');
  const drawerCheck = document.getElementById('drawer-preview-enabled');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const toastNotification = document.getElementById('toast-notification');
  const toastMessage = document.getElementById('toast-message');

  let feedbackTimer = null;

  function updateOaSubOptionsVisibility() {
    if (oaSubOptions && oaToolsCheck) {
      const masterOn = oaToolsCheck.checked;
      oaSubOptions.style.opacity = masterOn ? '1' : '0.4';
      oaSubOptions.style.pointerEvents = masterOn ? 'auto' : 'none';
      if (drawerCheck) drawerCheck.disabled = !masterOn;
    }
  }

  // --- Real-time Auto-Save Engine (Dynamic Top Notification) ---
  function showAutoSaveFeedback(msg = '设置已保存') {
    if (!toastNotification) return;
    if (toastMessage) toastMessage.textContent = msg;
    toastNotification.classList.add('show');
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 1800);
  }

  function saveSettings() {
    chrome.storage.local.get(['nmj_settings'], (res) => {
      const settings = res.nmj_settings || {};
      if (oaToolsCheck) settings.oaToolsEnabled = oaToolsCheck.checked;
      if (drawerCheck) settings.drawerEnabled = drawerCheck.checked;

      chrome.storage.local.set({ nmj_settings: settings }, () => {
        try {
          localStorage.setItem('nmj_settings', JSON.stringify(settings));
        } catch (e) { }

        showAutoSaveFeedback();

        // Broadcast to all open JLU tabs to apply immediately
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.id && tab.url && tab.url.includes('jlu.edu.cn')) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'update_settings',
                settings: settings
              }, () => {
                if (chrome.runtime.lastError) { }
              });
            }
          });
        });
      });
    });
  }

  // --- Load existing settings ---
  chrome.storage.local.get(['nmj_settings'], (res) => {
    const settings = res.nmj_settings || {};
    if (oaToolsCheck) oaToolsCheck.checked = settings.oaToolsEnabled !== false;
    if (drawerCheck) drawerCheck.checked = settings.drawerEnabled !== false;
    updateOaSubOptionsVisibility();
  });

  // --- Attach Real-Time Auto-Save Listeners ---
  if (oaToolsCheck) {
    oaToolsCheck.addEventListener('change', () => {
      updateOaSubOptionsVisibility();
      saveSettings();
    });
  }

  if (drawerCheck) {
    drawerCheck.addEventListener('change', saveSettings);
  }

  // Clear Read History & Stats
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      if (confirm('确定要清空公文阅读历史与统计数据吗？悬浮框上的统计将重置为 0。')) {
        const fresh = { totalCount: 0, items: [] };
        try {
          localStorage.setItem('nmj_oa_read_history', JSON.stringify(fresh));
          localStorage.removeItem('nmj_oa_last_visit');
        } catch (e) { }

        chrome.storage.local.set({ nmj_oa_read_history: fresh }, () => {
          chrome.storage.local.remove(['nmj_oa_last_visit'], () => {
            showAutoSaveFeedback('阅读历史与统计已清空');

            // Broadcast to OA tabs to update floating pill & panel
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach(tab => {
                if (tab.id && tab.url && tab.url.includes('jlu.edu.cn')) {
                  chrome.tabs.sendMessage(tab.id, {
                    action: 'clear_history'
                  }, () => {
                    if (chrome.runtime.lastError) { }
                  });
                }
              });
            });
          });
        });
      }
    });
  }
});

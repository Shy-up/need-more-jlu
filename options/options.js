/**
 * need_more_jlu - Options Controller
 * 专注于吉大 OA 官方增强工具箱的个性化配置：
 * 1. 侧边抽屉浏览开关；
 * 2. 「上次看到这里」隔离红线与基准时间窗口；
 * 3. 实时自动保存与多标签页广播；
 * 4. 仪表盘个性化外观（深浅色、壁纸、毛玻璃透明度）已归位至仪表盘内实时调节。
 */

document.addEventListener('DOMContentLoaded', () => {
  const oaToolsCheck = document.getElementById('oa-tools-enabled');
  const oaSubOptions = document.getElementById('oa-sub-options');
  const drawerCheck = document.getElementById('drawer-preview-enabled');
  const seenDividerCheck = document.getElementById('seen-divider-enabled');
  const seenDividerSubOptions = document.getElementById('seen-divider-sub-options');
  const dividerIntervalSlider = document.getElementById('opt-divider-interval-slider');
  const dividerIntervalVal = document.getElementById('opt-divider-interval-val');
  const presetPillBtns = document.querySelectorAll('.preset-pill-btn');
  const currentBaselineTitle = document.getElementById('current-baseline-title');
  const currentBaselineTime = document.getElementById('current-baseline-time');
  const btnClearRead = document.getElementById('btn-clear-read');
  const toastNotification = document.getElementById('toast-notification');
  const toastMessage = document.getElementById('toast-message');

  let saveDebounceTimer = null;
  let feedbackTimer = null;

  function formatIntervalText(hours) {
    const h = Number(hours);
    if (h <= 0) return '0 小时 (每次即刻更新)';
    if (h < 1) {
      const mins = Math.round(h * 60);
      return `${mins} 分钟${mins === 15 ? ' (默认)' : ''}`;
    }
    if (h % 24 === 0 && h >= 24) {
      return `${h} 小时 (${h / 24} 天)`;
    }
    if (h % 1 !== 0) {
      return `${h} 小时 (${Math.round(h * 60)} 分钟)`;
    }
    return `${h} 小时`;
  }

  function updatePresetPills(hours) {
    const val = Number(hours);
    presetPillBtns.forEach(btn => {
      if (Math.abs(Number(btn.dataset.hours) - val) < 0.01) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function updateOaSubOptionsVisibility() {
    if (oaSubOptions && oaToolsCheck) {
      const masterOn = oaToolsCheck.checked;
      oaSubOptions.style.opacity = masterOn ? '1' : '0.4';
      oaSubOptions.style.pointerEvents = masterOn ? 'auto' : 'none';
      if (drawerCheck) drawerCheck.disabled = !masterOn;
      if (seenDividerCheck) seenDividerCheck.disabled = !masterOn;
    }
    updateSeenDividerVisibility();
  }

  function updateSeenDividerVisibility() {
    if (seenDividerSubOptions && seenDividerCheck) {
      const masterOn = oaToolsCheck ? oaToolsCheck.checked : true;
      const dividerOn = masterOn && seenDividerCheck.checked;
      seenDividerSubOptions.style.opacity = dividerOn ? '1' : '0.4';
      seenDividerSubOptions.style.pointerEvents = dividerOn ? 'auto' : 'none';
      if (dividerIntervalSlider) dividerIntervalSlider.disabled = !dividerOn;
      presetPillBtns.forEach(btn => btn.disabled = !dividerOn);
    }
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${Math.max(1, diffMins)} 分钟前记录`;
    } else if (diffHours < 24) {
      return `${diffHours} 小时前记录`;
    } else if (diffDays === 1) {
      const d = new Date(timestamp);
      return `昨天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 记录`;
    } else {
      return `${diffDays} 天前记录`;
    }
  }

  function refreshBaselineDisplay() {
    if (!currentBaselineTitle) return;

    chrome.storage.local.get(['nmj_oa_last_visit'], (res) => {
      let visit = res.nmj_oa_last_visit;
      if (!visit) {
        try {
          const stored = localStorage.getItem('nmj_oa_last_visit');
          if (stored) visit = JSON.parse(stored);
        } catch (e) { }
      }

      if (visit && (visit.topTitle || visit.topId)) {
        currentBaselineTitle.textContent = visit.topTitle ? `《${visit.topTitle}》` : `公文ID: ${visit.topId}`;
        if (currentBaselineTime && visit.time) {
          currentBaselineTime.textContent = `· ${formatRelativeTime(visit.time)}`;
        }
      } else {
        currentBaselineTitle.textContent = '暂无记录（首次进入 OA 时将自动确立）';
        if (currentBaselineTime) currentBaselineTime.textContent = '';
      }
    });
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
      if (seenDividerCheck) settings.seenDividerEnabled = seenDividerCheck.checked;
      if (dividerIntervalSlider) settings.seenDividerIntervalHours = Number(dividerIntervalSlider.value);

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

  function debounceSave(delay = 250) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(saveSettings, delay);
  }

  // --- Load existing settings ---
  chrome.storage.local.get(['nmj_settings'], (res) => {
    const settings = res.nmj_settings || {};
    if (oaToolsCheck) oaToolsCheck.checked = settings.oaToolsEnabled !== false;
    if (drawerCheck) drawerCheck.checked = settings.drawerEnabled !== false;
    if (seenDividerCheck) seenDividerCheck.checked = settings.seenDividerEnabled !== false;

    const intervalHours = (settings.seenDividerIntervalHours !== undefined)
      ? Number(settings.seenDividerIntervalHours)
      : 0.25;
    if (dividerIntervalSlider) {
      dividerIntervalSlider.value = intervalHours;
      if (dividerIntervalVal) dividerIntervalVal.textContent = formatIntervalText(intervalHours);
      updatePresetPills(intervalHours);
    }

    updateOaSubOptionsVisibility();
    refreshBaselineDisplay();
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

  if (seenDividerCheck) {
    seenDividerCheck.addEventListener('change', () => {
      updateSeenDividerVisibility();
      saveSettings();
    });
  }

  if (dividerIntervalSlider) {
    dividerIntervalSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (dividerIntervalVal) dividerIntervalVal.textContent = formatIntervalText(val);
      updatePresetPills(val);
      debounceSave(150);
    });
  }

  presetPillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.hours);
      if (dividerIntervalSlider) {
        dividerIntervalSlider.value = val;
        if (dividerIntervalVal) dividerIntervalVal.textContent = formatIntervalText(val);
        updatePresetPills(val);
      }
      saveSettings();
    });
  });

  // Clear Last-Seen Divider
  if (btnClearRead) {
    btnClearRead.addEventListener('click', () => {
      if (confirm('确定要重置「上次看到这里」红线记录吗？下次打开 OA 将以当前最新通知重新作为起点。')) {
        localStorage.removeItem('nmj_oa_last_visit');
        chrome.storage.local.remove(['nmj_oa_last_visit'], () => {
          refreshBaselineDisplay();
          showAutoSaveFeedback('红线记录已重置');
        });
      }
    });
  }
});

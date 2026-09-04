/**
 * need_more_jlu - Options Controller
 * Supports both local image file upload (Base64) and remote image URL for custom wallpapers.
 */

document.addEventListener('DOMContentLoaded', () => {
  const themeSelect = document.getElementById('theme-select');
  const wallpaperInputGroup = document.getElementById('wallpaper-input-group');
  const dashboardContainer = document.getElementById('dashboard-wallpaper-container');
  const localContainer = document.getElementById('local-wallpaper-container');
  const urlContainer = document.getElementById('url-wallpaper-container');
  const wallpaperUrlInput = document.getElementById('wallpaper-url');
  const localFileInput = document.getElementById('local-wallpaper-file');
  const uploadDropzone = document.getElementById('upload-dropzone');
  const btnApplyDashboardBg = document.getElementById('btn-apply-dashboard-bg');
  const previewBox = document.getElementById('wallpaper-preview-box');
  const previewImg = document.getElementById('wallpaper-preview-img');
  const fileInfoSpan = document.getElementById('wallpaper-file-info');
  const btnRemoveWallpaper = document.getElementById('btn-remove-wallpaper');
  const sourceRadios = document.querySelectorAll('input[name="wallpaper-source"]');

  const DASHBOARD_BG_DATA = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="g1" cx="10%" cy="20%" r="50%"><stop offset="0%" stop-color="%2338bdf8" stop-opacity="0.10"/><stop offset="100%" stop-color="%230b0f17" stop-opacity="0"/></radialGradient><radialGradient id="g2" cx="90%" cy="80%" r="50%"><stop offset="0%" stop-color="%238b5cf6" stop-opacity="0.10"/><stop offset="100%" stop-color="%230b0f17" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="%230b0f17"/><rect width="100%" height="100%" fill="url(%23g1)"/><rect width="100%" height="100%" fill="url(%23g2)"/></svg>';

  const accentColorInput = document.getElementById('accent-color');
  const accentHexSpan = document.getElementById('accent-hex');
  const defaultUnreadCheck = document.getElementById('default-unread');
  const oaToolsCheck = document.getElementById('oa-tools-enabled');
  const oaSubOptions = document.getElementById('oa-sub-options');
  const drawerCheck = document.getElementById('drawer-preview-enabled');
  const btnSave = document.getElementById('btn-save');
  const saveStatus = document.getElementById('save-status');
  const btnClearRead = document.getElementById('btn-clear-read');
  const btnExportStars = document.getElementById('btn-export-stars');

  const optUiSlider = document.getElementById('opt-ui-opacity-slider');
  const optUiVal = document.getElementById('opt-ui-opacity-val');
  const optWpSlider = document.getElementById('opt-wp-opacity-slider');
  const optWpVal = document.getElementById('opt-wp-opacity-val');

  const dividerIntervalSlider = document.getElementById('opt-divider-interval-slider');
  const dividerIntervalVal = document.getElementById('opt-divider-interval-val');
  const presetPillBtns = document.querySelectorAll('.preset-pill-btn');

  let currentWallpaperData = '';

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

  if (dividerIntervalSlider) {
    dividerIntervalSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (dividerIntervalVal) dividerIntervalVal.textContent = formatIntervalText(val);
      updatePresetPills(val);
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
    });
  });

  function updateOaSubOptionsVisibility() {
    if (oaSubOptions && oaToolsCheck) {
      oaSubOptions.style.opacity = oaToolsCheck.checked ? '1' : '0.4';
      oaSubOptions.style.pointerEvents = oaToolsCheck.checked ? 'auto' : 'none';
      if (drawerCheck) drawerCheck.disabled = !oaToolsCheck.checked;
      if (dividerIntervalSlider) dividerIntervalSlider.disabled = !oaToolsCheck.checked;
    }
  }

  if (oaToolsCheck) {
    oaToolsCheck.addEventListener('change', updateOaSubOptionsVisibility);
  }

  // Load existing settings
  chrome.storage.local.get(['nmj_settings', 'nmj_star_map'], (res) => {
    const settings = res.nmj_settings || {};
    themeSelect.value = settings.theme || 'light';
    currentWallpaperData = settings.customWallpaper || '';

    if (currentWallpaperData) {
      if (currentWallpaperData === DASHBOARD_BG_DATA || currentWallpaperData.includes('radialGradient') || currentWallpaperData.includes('0b0f17')) {
        setSourceTab('dashboard');
        showPreview(currentWallpaperData, '插件自带仪表盘背景');
      } else if (currentWallpaperData.startsWith('data:')) {
        setSourceTab('local');
        showPreview(currentWallpaperData, '本地上传图片');
      } else {
        setSourceTab('url');
        wallpaperUrlInput.value = currentWallpaperData;
        showPreview(currentWallpaperData, '网络图片链接');
      }
    } else {
      setSourceTab('dashboard');
    }

    if (optUiSlider && settings.uiOpacity !== undefined) {
      optUiSlider.value = Math.round(Number(settings.uiOpacity) * 100);
      if (optUiVal) optUiVal.textContent = `${optUiSlider.value}%`;
    }
    if (optWpSlider && settings.wallpaperOpacity !== undefined) {
      optWpSlider.value = Math.round(Number(settings.wallpaperOpacity) * 100);
      if (optWpVal) optWpVal.textContent = `${optWpSlider.value}%`;
    }

    accentColorInput.value = settings.customAccent || '#0284c7';
    if (accentHexSpan) accentHexSpan.textContent = accentColorInput.value;
    if (defaultUnreadCheck) defaultUnreadCheck.checked = !!settings.onlyUnread;
    if (oaToolsCheck) oaToolsCheck.checked = settings.oaToolsEnabled !== false;
    if (drawerCheck) drawerCheck.checked = settings.drawerEnabled !== false;

    const intervalHours = (settings.seenDividerIntervalHours !== undefined)
      ? Number(settings.seenDividerIntervalHours)
      : 0.25;
    if (dividerIntervalSlider) {
      dividerIntervalSlider.value = intervalHours;
      if (dividerIntervalVal) dividerIntervalVal.textContent = formatIntervalText(intervalHours);
      updatePresetPills(intervalHours);
    }

    updateOaSubOptionsVisibility();

    updateWallpaperVisibility();
  });

  if (optUiSlider) {
    optUiSlider.addEventListener('input', (e) => {
      if (optUiVal) optUiVal.textContent = `${e.target.value}%`;
    });
  }
  if (optWpSlider) {
    optWpSlider.addEventListener('input', (e) => {
      if (optWpVal) optWpVal.textContent = `${e.target.value}%`;
    });
  }

  themeSelect.addEventListener('change', () => {
    if (themeSelect.value === 'dashboard') {
      currentWallpaperData = DASHBOARD_BG_DATA;
      setSourceTab('dashboard');
      showPreview(currentWallpaperData, '插件自带仪表盘背景');
    }
    updateWallpaperVisibility();
  });

  function updateWallpaperVisibility() {
    // Keep wallpaper configuration visible and responsive
    wallpaperInputGroup.style.display = 'block';
  }

  // Source Radio Switch
  sourceRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      setSourceTab(e.target.value);
    });
  });

  function setSourceTab(source) {
    sourceRadios.forEach(r => r.checked = (r.value === source));
    if (dashboardContainer) dashboardContainer.style.display = (source === 'dashboard') ? 'block' : 'none';
    if (localContainer) localContainer.style.display = (source === 'local') ? 'block' : 'none';
    if (urlContainer) urlContainer.style.display = (source === 'url') ? 'block' : 'none';
  }

  if (btnApplyDashboardBg) {
    btnApplyDashboardBg.addEventListener('click', () => {
      currentWallpaperData = DASHBOARD_BG_DATA;
      showPreview(currentWallpaperData, '插件自带仪表盘背景');
      themeSelect.value = 'custom';
      btnApplyDashboardBg.textContent = '✓ 已设为自定义背景';
      setTimeout(() => {
        btnApplyDashboardBg.textContent = '设为当前壁纸';
      }, 1500);
    });
  }

  // Dropzone click -> trigger file picker
  uploadDropzone.addEventListener('click', () => {
    localFileInput.click();
  });

  // Drag and Drop
  uploadDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadDropzone.classList.add('dragover');
  });

  uploadDropzone.addEventListener('dragleave', () => {
    uploadDropzone.classList.remove('dragover');
  });

  uploadDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  localFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  // URL Input listener
  wallpaperUrlInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) {
      currentWallpaperData = val;
      showPreview(val, '网络图片链接');
      themeSelect.value = 'custom';
    } else {
      currentWallpaperData = '';
      previewBox.style.display = 'none';
    }
  });

  // Remove Wallpaper
  btnRemoveWallpaper.addEventListener('click', () => {
    currentWallpaperData = '';
    wallpaperUrlInput.value = '';
    localFileInput.value = '';
    previewBox.style.display = 'none';
    if (themeSelect.value === 'custom') {
      themeSelect.value = 'light';
    }
  });

  // Read and optimize local image
  function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('请选择有效的图片文件 (JPG / PNG / WEBP)！');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
      const rawDataUrl = evt.target.result;
      
      // Optimize image size (resize to max 2560px for performance if large)
      const img = new Image();
      img.onload = function() {
        const maxDimension = 2560;
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          currentWallpaperData = canvas.toDataURL('image/jpeg', 0.88);
        } else {
          currentWallpaperData = rawDataUrl;
        }

        const sizeKb = Math.round(currentWallpaperData.length * 0.75 / 1024);
        showPreview(currentWallpaperData, `本地图片 (${file.name}, 约 ${sizeKb}KB)`);
        themeSelect.value = 'custom';
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  function showPreview(src, label) {
    previewImg.src = src;
    fileInfoSpan.textContent = label;
    previewBox.style.display = 'block';
  }

  accentColorInput.addEventListener('input', (e) => {
    accentHexSpan.textContent = e.target.value;
  });

  // Save Settings
  btnSave.addEventListener('click', () => {
    chrome.storage.local.get(['nmj_settings'], (res) => {
      const settings = res.nmj_settings || {};
      settings.theme = themeSelect.value;
      settings.customWallpaper = currentWallpaperData;
      settings.customAccent = accentColorInput.value;
      if (defaultUnreadCheck) settings.onlyUnread = defaultUnreadCheck.checked;
      if (oaToolsCheck) settings.oaToolsEnabled = oaToolsCheck.checked;
      if (drawerCheck) settings.drawerEnabled = drawerCheck.checked;
      if (dividerIntervalSlider) settings.seenDividerIntervalHours = Number(dividerIntervalSlider.value);
      if (optUiSlider) settings.uiOpacity = Number(optUiSlider.value) / 100;
      if (optWpSlider) settings.wallpaperOpacity = Number(optWpSlider.value) / 100;

      chrome.storage.local.set({ nmj_settings: settings }, () => {
        // Also sync to localStorage fallback
        try {
          localStorage.setItem('nmj_settings', JSON.stringify(settings));
        } catch (e) {}

        saveStatus.style.display = 'inline';
        setTimeout(() => {
          saveStatus.style.display = 'none';
        }, 2000);

        // Broadcast to all open JLU tabs to apply immediately
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.id && tab.url && (tab.url.includes('jlu.edu.cn'))) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'update_settings',
                settings: settings,
                theme: settings.theme,
                wallpaper: settings.customWallpaper,
                accent: settings.customAccent
              }, () => {
                if (chrome.runtime.lastError) {
                  // Ignore tabs without content script
                }
              });
            }
          });
        });
      });
    });
  });


  // Clear Last-Seen Divider
  if (btnClearRead) {
    btnClearRead.addEventListener('click', () => {
      if (confirm('确定要重置「上次看到这里」红线记录吗？下次打开 OA 将以当前最新通知作为起点。')) {
        localStorage.removeItem('nmj_oa_last_visit');
        alert('已重置红线基准！');
      }
    });
  }
});

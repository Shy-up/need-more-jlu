/**
 * need_more_jlu - Wallpaper & Theme Controller
 * 负责深浅色主题切换、毛玻璃面板不透明度调整、自定义壁纸/预设壁纸管理与本地持久化。
 */

import { PRESET_WALLPAPERS } from '../../config/constants.js';

let pendingWallpaperData = '';

export function applyWallpaper(wallpaperData, state) {
  if (wallpaperData && (wallpaperData.includes('radialGradient id="g1"') || (wallpaperData.includes('0b0f17') && wallpaperData.startsWith('data:image/svg')))) {
    wallpaperData = '';
    try { localStorage.removeItem('nmj_custom_wallpaper'); } catch (e) { }
  }
  state.customWallpaper = wallpaperData || '';
  const bgLayer = document.getElementById('wallpaperBgLayer');
  if (state.customWallpaper) {
    document.body.classList.add('has-custom-wallpaper');
    if (bgLayer) {
      bgLayer.style.display = 'block';
      bgLayer.style.backgroundImage = `url("${state.customWallpaper}")`;
      bgLayer.style.opacity = state.wallpaperOpacity;
    }
  } else {
    document.body.classList.remove('has-custom-wallpaper');
    if (bgLayer) {
      bgLayer.style.display = 'none';
      bgLayer.style.backgroundImage = '';
    }
  }
}

export function applyOpacity(uiOp, wpOp, state) {
  if (uiOp !== undefined && uiOp !== null) {
    state.uiOpacity = Math.max(0.1, Math.min(1.0, Number(uiOp)));
    document.documentElement.style.setProperty('--ui-opacity', String(state.uiOpacity));
  }
  if (wpOp !== undefined && wpOp !== null) {
    state.wallpaperOpacity = Math.max(0.0, Math.min(1.0, Number(wpOp)));
    document.documentElement.style.setProperty('--wp-opacity', String(state.wallpaperOpacity));
    const bgLayer = document.getElementById('wallpaperBgLayer');
    if (bgLayer) {
      bgLayer.style.opacity = state.wallpaperOpacity;
    }
  }
}

export function applyTheme(isDark, state) {
  state.isDarkTheme = !!isDark;
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(state.isDarkTheme ? 'theme-dark' : 'theme-light');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    const icon = themeToggleBtn.querySelector('.theme-icon');
    if (icon) icon.textContent = state.isDarkTheme ? '🌙' : '☀️';
  }
}

export function saveSettings(partial) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['nmj_settings'], (res) => {
      const s = res.nmj_settings || {};
      Object.assign(s, partial);
      chrome.storage.local.set({ nmj_settings: s });
    });
  }
  if (partial.customWallpaper !== undefined) {
    localStorage.setItem('nmj_custom_wallpaper', partial.customWallpaper);
  }
  if (partial.theme !== undefined) {
    localStorage.setItem('nmj_theme', partial.theme);
  }
  if (partial.uiOpacity !== undefined) {
    localStorage.setItem('nmj_ui_opacity', String(partial.uiOpacity));
  }
  if (partial.wallpaperOpacity !== undefined) {
    localStorage.setItem('nmj_wp_opacity', String(partial.wallpaperOpacity));
  }
}

export function initWallpaperAndTheme(state) {
  const localTheme = localStorage.getItem('nmj_theme');
  const localWp = localStorage.getItem('nmj_custom_wallpaper');
  const localUiOp = localStorage.getItem('nmj_ui_opacity');
  const localWpOp = localStorage.getItem('nmj_wp_opacity');

  if (localTheme) applyTheme(localTheme === 'dark', state);
  if (localUiOp) applyOpacity(localUiOp, null, state);
  if (localWpOp) applyOpacity(null, localWpOp, state);
  if (localWp) applyWallpaper(localWp, state);

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['nmj_settings'], (res) => {
      const settings = res.nmj_settings || {};
      if (settings.theme) applyTheme(settings.theme === 'dark', state);
      if (settings.uiOpacity !== undefined) applyOpacity(settings.uiOpacity, null, state);
      if (settings.wallpaperOpacity !== undefined) applyOpacity(null, settings.wallpaperOpacity, state);
      if (settings.customWallpaper !== undefined) applyWallpaper(settings.customWallpaper, state);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.nmj_settings && changes.nmj_settings.newValue) {
        const s = changes.nmj_settings.newValue;
        if (s.theme) applyTheme(s.theme === 'dark', state);
        if (s.uiOpacity !== undefined) applyOpacity(s.uiOpacity, null, state);
        if (s.wallpaperOpacity !== undefined) applyOpacity(null, s.wallpaperOpacity, state);
        if (s.customWallpaper !== undefined) applyWallpaper(s.customWallpaper, state);
      }
    });
  }

  initWallpaperModal(state);
}

export function initWallpaperModal(state) {
  const modal = document.getElementById('wallpaperModal');
  const btnOpen = document.getElementById('wallpaperBtn');
  const btnClose = document.getElementById('closeWallpaperModalBtn');
  const btnCancel = document.getElementById('btnCancelWallpaper');
  const btnSave = document.getElementById('btnSaveWallpaper');
  const btnClear = document.getElementById('btnClearWallpaper');

  const tabBtns = document.querySelectorAll('.wp-tab-btn');
  const tabLocal = document.getElementById('wpTabLocal');
  const tabUrl = document.getElementById('wpTabUrl');
  const tabPresets = document.getElementById('wpTabPresets');

  const dropzone = document.getElementById('wpDropzone');
  const fileInput = document.getElementById('wpFileInput');
  const urlInput = document.getElementById('wpUrlInput');
  const btnPreviewUrl = document.getElementById('btnPreviewUrl');

  const previewSection = document.getElementById('wpPreviewSection');
  const previewImg = document.getElementById('wpPreviewImg');
  const previewInfo = document.getElementById('wpPreviewInfo');

  const presetCards = document.querySelectorAll('.wp-preset-card');

  const uiOpacitySlider = document.getElementById('uiOpacitySlider');
  const uiOpacityVal = document.getElementById('uiOpacityVal');
  const wpOpacitySlider = document.getElementById('wpOpacitySlider');
  const wpOpacityVal = document.getElementById('wpOpacityVal');

  let origUiOpacity = state.uiOpacity;
  let origWpOpacity = state.wallpaperOpacity;

  if (!modal || !btnOpen) return;

  function syncSliderDisplays() {
    if (uiOpacitySlider) {
      uiOpacitySlider.value = Math.round(state.uiOpacity * 100);
      if (uiOpacityVal) uiOpacityVal.textContent = `${uiOpacitySlider.value}%`;
    }
    if (wpOpacitySlider) {
      wpOpacitySlider.value = Math.round(state.wallpaperOpacity * 100);
      if (wpOpacityVal) wpOpacityVal.textContent = `${wpOpacitySlider.value}%`;
    }
  }

  if (uiOpacitySlider) {
    uiOpacitySlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (uiOpacityVal) uiOpacityVal.textContent = `${val}%`;
      applyOpacity(val / 100, null, state);
    });
  }

  if (wpOpacitySlider) {
    wpOpacitySlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (wpOpacityVal) wpOpacityVal.textContent = `${val}%`;
      applyOpacity(null, val / 100, state);
    });
  }

  function openModal() {
    pendingWallpaperData = state.customWallpaper;
    origUiOpacity = state.uiOpacity;
    origWpOpacity = state.wallpaperOpacity;
    syncSliderDisplays();

    if (pendingWallpaperData) {
      showPreview(pendingWallpaperData, '当前正在使用壁纸');
      if (pendingWallpaperData.startsWith('http')) {
        switchTab('url');
        if (urlInput) urlInput.value = pendingWallpaperData;
      } else {
        switchTab('local');
      }
    } else {
      switchTab('local');
      if (previewSection) previewSection.style.display = 'none';
    }
    modal.style.display = 'flex';
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  btnOpen.addEventListener('click', openModal);
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      applyOpacity(origUiOpacity, origWpOpacity, state);
      closeModal();
    });
  }
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      applyOpacity(origUiOpacity, origWpOpacity, state);
      closeModal();
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      applyOpacity(origUiOpacity, origWpOpacity, state);
      closeModal();
    }
  });

  function switchTab(tabName) {
    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    if (tabLocal) tabLocal.style.display = (tabName === 'local') ? 'block' : 'none';
    if (tabUrl) tabUrl.style.display = (tabName === 'url') ? 'block' : 'none';
    if (tabPresets) tabPresets.style.display = (tabName === 'presets') ? 'block' : 'none';
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  function showPreview(dataUrl, info) {
    if (previewSection && previewImg) {
      previewImg.src = dataUrl;
      if (previewInfo) previewInfo.textContent = info || '';
      previewSection.style.display = 'block';
    }
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processImageFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        processImageFile(e.target.files[0]);
      }
    });
  }

  function processImageFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('请选择有效的图片文件 (JPG / PNG / WEBP)！');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (evt) {
      const rawDataUrl = evt.target.result;
      const img = new Image();
      img.onload = function () {
        const maxDim = 2560;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          pendingWallpaperData = canvas.toDataURL('image/jpeg', 0.88);
        } else {
          pendingWallpaperData = rawDataUrl;
        }
        const kb = Math.round(pendingWallpaperData.length * 0.75 / 1024);
        showPreview(pendingWallpaperData, `本地图片 (${file.name}, 约 ${kb}KB)`);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  if (btnPreviewUrl && urlInput) {
    btnPreviewUrl.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) {
        pendingWallpaperData = url;
        showPreview(url, '网络图片');
      }
    });
  }

  presetCards.forEach(card => {
    card.addEventListener('click', () => {
      presetCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const presetKey = card.dataset.preset;
      pendingWallpaperData = PRESET_WALLPAPERS[presetKey] || '';
      if (pendingWallpaperData) {
        showPreview(pendingWallpaperData, card.querySelector('.wp-preset-name')?.textContent || '预设背景');
      } else {
        if (previewSection) previewSection.style.display = 'none';
      }
    });
  });

  if (btnSave) {
    btnSave.addEventListener('click', () => {
      applyWallpaper(pendingWallpaperData, state);
      saveSettings({
        customWallpaper: pendingWallpaperData,
        uiOpacity: state.uiOpacity,
        wallpaperOpacity: state.wallpaperOpacity,
        theme: state.isDarkTheme ? 'dark' : 'light'
      });
      closeModal();
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      pendingWallpaperData = '';
      applyWallpaper('', state);
      saveSettings({ customWallpaper: '' });
      if (previewSection) previewSection.style.display = 'none';
      closeModal();
    });
  }
}

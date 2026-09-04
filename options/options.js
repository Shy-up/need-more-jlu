/**
 * need_more_jlu - Options Controller
 * Supports both local image file upload (Base64) and remote image URL for custom wallpapers.
 */

document.addEventListener('DOMContentLoaded', () => {
  const themeSelect = document.getElementById('theme-select');
  const wallpaperInputGroup = document.getElementById('wallpaper-input-group');
  const localContainer = document.getElementById('local-wallpaper-container');
  const urlContainer = document.getElementById('url-wallpaper-container');
  const wallpaperUrlInput = document.getElementById('wallpaper-url');
  const localFileInput = document.getElementById('local-wallpaper-file');
  const uploadDropzone = document.getElementById('upload-dropzone');
  const previewBox = document.getElementById('wallpaper-preview-box');
  const previewImg = document.getElementById('wallpaper-preview-img');
  const fileInfoSpan = document.getElementById('wallpaper-file-info');
  const btnRemoveWallpaper = document.getElementById('btn-remove-wallpaper');
  const sourceRadios = document.querySelectorAll('input[name="wallpaper-source"]');

  const accentColorInput = document.getElementById('accent-color');
  const accentHexSpan = document.getElementById('accent-hex');
  const defaultUnreadCheck = document.getElementById('default-unread');
  const drawerCheck = document.getElementById('drawer-preview-enabled');
  const btnSave = document.getElementById('btn-save');
  const saveStatus = document.getElementById('save-status');
  const btnClearRead = document.getElementById('btn-clear-read');
  const btnExportStars = document.getElementById('btn-export-stars');

  let currentWallpaperData = '';

  // Load existing settings
  chrome.storage.local.get(['nmj_settings', 'nmj_star_map'], (res) => {
    const settings = res.nmj_settings || {};
    themeSelect.value = settings.theme || 'light';
    currentWallpaperData = settings.customWallpaper || '';

    if (currentWallpaperData) {
      if (currentWallpaperData.startsWith('data:')) {
        setSourceTab('local');
        showPreview(currentWallpaperData, '本地上传图片');
      } else {
        setSourceTab('url');
        wallpaperUrlInput.value = currentWallpaperData;
        showPreview(currentWallpaperData, '网络图片链接');
      }
    } else {
      setSourceTab('local');
    }

    accentColorInput.value = settings.customAccent || '#0284c7';
    accentHexSpan.textContent = accentColorInput.value;
    defaultUnreadCheck.checked = !!settings.onlyUnread;
    drawerCheck.checked = settings.drawerEnabled !== false;

    updateWallpaperVisibility();
  });

  themeSelect.addEventListener('change', updateWallpaperVisibility);

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
    if (source === 'local') {
      localContainer.style.display = 'block';
      urlContainer.style.display = 'none';
    } else {
      localContainer.style.display = 'none';
      urlContainer.style.display = 'block';
    }
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
      settings.onlyUnread = defaultUnreadCheck.checked;
      settings.drawerEnabled = drawerCheck.checked;

      chrome.storage.local.set({ nmj_settings: settings }, () => {
        saveStatus.style.display = 'inline';
        setTimeout(() => {
          saveStatus.style.display = 'none';
        }, 2000);

        // Broadcast to all open JLU tabs to apply immediately
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.id && tab.url && (tab.url.includes('jlu.edu.cn'))) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'change_theme',
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

  // Clear Read Records
  btnClearRead.addEventListener('click', () => {
    if (confirm('确定要清空所有已读记录吗？所有通知将恢复为“未读”高亮状态。')) {
      chrome.storage.local.set({ nmj_read_map: {} }, () => {
        alert('已清空已读记录！');
      });
    }
  });

  // Export Stars
  btnExportStars.addEventListener('click', () => {
    chrome.storage.local.get(['nmj_star_map'], (res) => {
      const stars = res.nmj_star_map || {};
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(stars, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `jlu_starred_notices_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  });
});

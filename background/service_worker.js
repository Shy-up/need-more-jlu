/**
 * need_more_jlu - Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[need_more_jlu] 扩展已安装或已更新');
  // Initialize default settings if not exists
  chrome.storage.local.get(['nmj_settings'], (res) => {
    if (!res.nmj_settings) {
      chrome.storage.local.set({
        nmj_settings: {
          theme: 'light',
          customWallpaper: '',
          customAccent: '#0284c7',
          onlyUnread: false,
          drawerEnabled: true
        }
      });
    }
  });
});

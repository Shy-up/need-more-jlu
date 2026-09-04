/**
 * need_more_jlu - Authentic Native Side Drawer Component (零篡改官方保真模式)
 * Embeds official notice documents in a slide-out drawer, preserving 100% original red-head formatting,
 * seals, official tables, and attachments without false modifications.
 */

window.NMJDrawer = (function() {
  let drawerRoot = null;
  let drawerOverlay = null;
  let drawerPanel = null;
  let iframeEl = null;

  function init() {
    if (drawerRoot) return;

    drawerRoot = document.createElement('div');
    drawerRoot.id = 'nmj-drawer-root';
    drawerRoot.innerHTML = `
      <div id="nmj-drawer-overlay"></div>
      <div id="nmj-drawer">
        <div class="nmj-drawer-header">
          <div class="nmj-drawer-header-left">
            <button class="nmj-btn nmj-btn-close-drawer" id="nmj-drawer-close-btn" title="关闭 (Esc)">✕ 关闭</button>
            <span class="nmj-tag-authentic">🛡️ 官方原文保真模式</span>
          </div>
          <div class="nmj-drawer-header-right">
            <a href="#" target="_blank" rel="noopener noreferrer" class="nmj-btn nmj-btn-native-tab" id="nmj-drawer-open-native">
              ↗ 官方原网页新开
            </a>
          </div>
        </div>
        <div class="nmj-drawer-frame-wrap" id="nmj-drawer-frame-wrap">
          <div class="nmj-frame-loading" id="nmj-frame-loading">
            <div class="nmj-spinner"></div>
            <span>正在载入官方原文...</span>
          </div>
          <iframe id="nmj-drawer-iframe" frameborder="0" sandbox="allow-same-origin allow-scripts allow-forms allow-popups"></iframe>
        </div>
      </div>
    `;
    document.body.appendChild(drawerRoot);

    drawerOverlay = document.getElementById('nmj-drawer-overlay');
    drawerPanel = document.getElementById('nmj-drawer');
    iframeEl = document.getElementById('nmj-drawer-iframe');

    drawerOverlay.addEventListener('click', close);
    document.getElementById('nmj-drawer-close-btn').addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawerPanel && drawerPanel.classList.contains('active')) {
        close();
      }
    });

    // Handle iframe load event to suppress giant top banner
    iframeEl.addEventListener('load', () => {
      const loader = document.getElementById('nmj-frame-loading');
      if (loader) loader.style.display = 'none';

      try {
        const idoc = iframeEl.contentDocument || iframeEl.contentWindow.document;
        if (idoc && idoc.head) {
          const style = idoc.createElement('style');
          style.textContent = `
            /* need_more_jlu: Suppress 200px legacy top banner to maximize reading space */
            table[background*="top"], table[background*="banner"], 
            tr[background*="top"], td[background*="top"],
            img[src*="top"], img[src*="banner"], img[src*="header"] {
              display: none !important;
            }
            body {
              padding: 16px 24px !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif !important;
              background-color: #ffffff !important;
            }
          `;
          idoc.head.appendChild(style);
        }
      } catch (err) {
        // Cross-origin fallback (standard iframe behavior)
      }
    });
  }

  function open(item) {
    init();

    const nativeLink = document.getElementById('nmj-drawer-open-native');
    const loader = document.getElementById('nmj-frame-loading');

    if (nativeLink) nativeLink.href = item.url;
    if (loader) loader.style.display = 'flex';

    // Slide in
    drawerOverlay.classList.add('active');
    drawerPanel.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Set source
    if (iframeEl) {
      iframeEl.src = item.url;
    }
  }

  function close() {
    if (!drawerPanel) return;
    drawerOverlay.classList.remove('active');
    drawerPanel.classList.remove('active');
    document.body.style.overflow = '';
    if (iframeEl) {
      iframeEl.src = 'about:blank';
    }
  }

  return {
    init,
    open,
    close
  };
})();

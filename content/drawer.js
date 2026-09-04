/**
 * need_more_jlu - Authentic Native Side Drawer Component (零篡改官方保真模式)
 * 1. 100% 原始官方红头公文排版、印章原貌呈现；
 * 2. 彻底清除抽屉内部多余的顶部巨幅大横幅与左侧综合服务栏/导航栏，正文自适应撑满；
 * 3. 彻底解除 iframe 沙箱下载封锁，原生直链下载与顶部极速附件栏双重保障；
 * 4. 支持左边缘鼠标拖拽自由调节宽度（带记忆）。
 */

window.NMJDrawer = (function() {
  let drawerRoot = null;
  let drawerOverlay = null;
  let drawerPanel = null;
  let resizerEl = null;
  let iframeEl = null;
  let attBarEl = null;
  let isResizing = false;

  const DEFAULT_WIDTH = 840;
  const MIN_WIDTH = 460;

  function init() {
    if (drawerRoot) return;

    drawerRoot = document.createElement('div');
    drawerRoot.id = 'nmj-drawer-root';
    drawerRoot.innerHTML = `
      <div id="nmj-drawer-overlay"></div>
      <div id="nmj-drawer">
        <!-- Draggable Resizer Handle on Left Edge -->
        <div id="nmj-drawer-resizer" class="nmj-drawer-resizer" title="按住左右拖拽调整宽度">
          <div class="resizer-handle-pill">
            <span class="resizer-bar-line"></span>
            <span class="resizer-bar-line"></span>
          </div>
        </div>

        <div class="nmj-drawer-header">
          <div class="nmj-drawer-header-left">
            <button class="nmj-btn nmj-btn-close-drawer" id="nmj-drawer-close-btn" title="关闭 (Esc)">✕ 关闭</button>
          </div>
          <div class="nmj-drawer-header-right">
            <a href="#" target="_blank" rel="noopener noreferrer" class="nmj-btn nmj-btn-native-tab" id="nmj-drawer-open-native">
              ↗ 官方原网页新开
            </a>
          </div>
        </div>

        <!-- Attachment Quick Bar (if notice has attachments) -->
        <div class="nmj-drawer-attachment-bar" id="nmj-drawer-attachment-bar" style="display: none;"></div>

        <div class="nmj-drawer-frame-wrap" id="nmj-drawer-frame-wrap">
          <div class="nmj-frame-loading" id="nmj-frame-loading">
            <div class="nmj-spinner"></div>
            <span>正在载入官方公文原文...</span>
          </div>
          <!-- NOTE: No sandbox attribute to guarantee native browser file downloads -->
          <iframe id="nmj-drawer-iframe" frameborder="0"></iframe>
        </div>
      </div>
    `;
    document.body.appendChild(drawerRoot);

    drawerOverlay = document.getElementById('nmj-drawer-overlay');
    drawerPanel = document.getElementById('nmj-drawer');
    resizerEl = document.getElementById('nmj-drawer-resizer');
    iframeEl = document.getElementById('nmj-drawer-iframe');
    attBarEl = document.getElementById('nmj-drawer-attachment-bar');

    // Restore saved drawer width
    const savedWidth = parseInt(localStorage.getItem('nmj_drawer_width') || String(DEFAULT_WIDTH), 10);
    if (savedWidth && savedWidth >= MIN_WIDTH) {
      drawerPanel.style.width = Math.min(savedWidth, window.innerWidth * 0.95) + 'px';
    }

    bindEvents();
  }

  function bindEvents() {
    drawerOverlay.addEventListener('click', close);
    document.getElementById('nmj-drawer-close-btn').addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawerPanel && drawerPanel.classList.contains('active')) {
        close();
      }
    });

    // Resizer Dragging Logic
    resizerEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      document.body.classList.add('nmj-is-resizing');
      if (iframeEl) iframeEl.style.pointerEvents = 'none';

      const onMouseMove = (moveEvent) => {
        if (!isResizing) return;
        const maxW = window.innerWidth * 0.96;
        const newWidth = Math.max(MIN_WIDTH, Math.min(maxW, window.innerWidth - moveEvent.clientX));
        drawerPanel.style.width = `${newWidth}px`;
      };

      const onMouseUp = () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.classList.remove('nmj-is-resizing');
        if (iframeEl) iframeEl.style.pointerEvents = '';
        localStorage.setItem('nmj_drawer_width', drawerPanel.offsetWidth);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Handle iframe load event to clean left sidebar, footers and enable downloads
    iframeEl.addEventListener('load', () => {
      if (!iframeEl.src || iframeEl.src === 'about:blank') return;

      const loader = document.getElementById('nmj-frame-loading');
      if (loader) loader.style.display = 'none';

      try {
        const idoc = iframeEl.contentDocument || iframeEl.contentWindow.document;
        if (idoc) {
          cleanIframeDOM(idoc);
          // Re-run cleaning after short delays to catch late-rendered elements/tables
          setTimeout(() => cleanIframeDOM(idoc), 120);
          setTimeout(() => cleanIframeDOM(idoc), 450);
        }
      } catch (err) {
        console.warn('[need_more_jlu] 操作 iframe 内部样式提示:', err);
      }
    });
  }

  // Deep cleaning inside the iframe: remove left portal sidebar, top banner, footer; wire downloads
  // Ensure attachments inside iframe are easy to click and download cleanly without distorting original layouts
  function cleanIframeDOM(idoc) {
    if (!idoc) return;

    // Inject minimal, non-destructive enhancements only
    let style = idoc.getElementById('nmj-injected-style');
    if (!style) {
      style = idoc.createElement('style');
      style.id = 'nmj-injected-style';
      style.textContent = `
        /* In-Body Attachment Links: Make clickable, distinct, and obvious */
        .nmj-inbody-att-link {
          display: inline-flex !important;
          align-items: center !important;
          gap: 4px !important;
          color: #0284c7 !important;
          font-weight: 600 !important;
          text-decoration: underline !important;
          padding: 2px 6px !important;
          border-radius: 4px !important;
          background-color: #f0f9ff !important;
          cursor: pointer !important;
          transition: all 0.15s ease !important;
        }
        .nmj-inbody-att-link:hover {
          background-color: #e0f2fe !important;
          color: #0369a1 !important;
        }
      `;
      (idoc.head || idoc.documentElement).appendChild(style);
    }

    // 3. Process & Enhance Attachment Download Links
    try {
      const vpnPrefixMatch = window.location.pathname.match(/^(\/https\/[0-9a-fA-F]+)/);
      const vpnPrefix = vpnPrefixMatch ? vpnPrefixMatch[1] : '';

      const allLinks = idoc.querySelectorAll('a');
      const foundAttachments = [];

      allLinks.forEach(a => {
        const rawHref = a.getAttribute('href') || '';
        const text = (a.innerText || '').trim();

        const isAttachment = rawHref.includes('download') || 
                             rawHref.includes('Download') || 
                             rawHref.includes('accessory') || 
                             rawHref.includes('getInformation!download') ||
                             /\.(docx?|xlsx?|pptx?|pdf|zip|rar|7z|csv|txt|png|jpe?g)$/i.test(rawHref) ||
                             /\.(docx?|xlsx?|pptx?|pdf|zip|rar|7z|csv|txt)/i.test(text);

        if (isAttachment) {
          // Resolve relative paths properly under WebVPN
          let fullHref = rawHref;
          if (vpnPrefix && rawHref.startsWith('/defaultroot/')) {
            fullHref = vpnPrefix + rawHref;
            a.href = fullHref;
          } else {
            fullHref = a.href;
          }

          // Force download capability on click
          a.setAttribute('download', '');
          a.setAttribute('target', '_blank');
          a.classList.add('nmj-inbody-att-link');

          // Clean display name
          const fileName = text.replace(/^附件\s*[:：]?\s*/i, '') || '附件下载';
          if (!foundAttachments.some(att => att.href === fullHref)) {
            foundAttachments.push({
              name: text || fileName,
              href: fullHref
            });
          }
        }
      });

      // Update Attachment Quick Bar in Drawer Header
      if (attBarEl) {
        if (foundAttachments.length > 0) {
          attBarEl.style.display = 'flex';
          attBarEl.innerHTML = `
            <div class="nmj-att-header-inner">
              <span class="nmj-att-badge">📎 检测到本通知包含 ${foundAttachments.length} 个附件（点击直接下载）：</span>
              <div class="nmj-att-list">
                ${foundAttachments.map(att => `
                  <a href="${att.href}" download target="_blank" class="nmj-att-header-btn" title="点击立即下载 ${escapeHtml(att.name)}">
                    <span>💾</span>
                    <span class="nmj-att-btn-name">${escapeHtml(att.name)}</span>
                  </a>
                `).join('')}
              </div>
            </div>
          `;
        } else {
          attBarEl.style.display = 'none';
          attBarEl.innerHTML = '';
        }
      }
    } catch (e) {
      console.warn('[need_more_jlu] 附件处理提示:', e);
    }
  }

  function open(item) {
    init();

    const nativeLink = document.getElementById('nmj-drawer-open-native');
    const loader = document.getElementById('nmj-frame-loading');

    if (nativeLink) nativeLink.href = item.url;
    if (loader) loader.style.display = 'flex';
    if (attBarEl) {
      attBarEl.style.display = 'none';
      attBarEl.innerHTML = '';
    }

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
    if (attBarEl) {
      attBarEl.style.display = 'none';
      attBarEl.innerHTML = '';
    }
    if (iframeEl) {
      iframeEl.src = 'about:blank';
    }
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    init,
    open,
    close
  };
})();

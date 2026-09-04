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
        <div id="nmj-drawer-resizer" class="nmj-drawer-resizer" title="左右拖拽调整抽屉宽度">
          <div class="resizer-handle-bar"></div>
        </div>

        <div class="nmj-drawer-header">
          <div class="nmj-drawer-header-left">
            <button class="nmj-btn nmj-btn-close-drawer" id="nmj-drawer-close-btn" title="关闭 (Esc)">✕ 关闭</button>
            <span class="nmj-tag-authentic">🛡️ 官方原文保真模式</span>
            <span class="nmj-tip-drag">↔ 可左右拖拽调宽</span>
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
  function cleanIframeDOM(idoc) {
    if (!idoc) return;

    // 1. Inject comprehensive CSS rules into iframe
    let style = idoc.getElementById('nmj-injected-style');
    if (!style) {
      style = idoc.createElement('style');
      style.id = 'nmj-injected-style';
      style.textContent = `
        /* 1. Hide Top Banners, Logos, Header Tables */
        table[background*="top"], table[background*="banner"], 
        tr[background*="top"], td[background*="top"],
        img[src*="top"], img[src*="banner"], img[src*="header"], img[src*="logo"],
        .top, #top, .header, #header, #topTable, .banner-box {
          display: none !important;
        }

        /* 2. Hide Left Sidebar, Left Tree & Left Portal Columns (Widths 180px - 380px) */
        #left, .left, #leftTree, #leftMenu, #menuTree, #left_menu, #leftColumn,
        td#left, td.left, td#leftTree, td#leftMenu, div#left, div.left,
        td[id*="left"], td[class*="left"], div[id*="left"], div[class*="left"],
        td[width="180"], td[width="190"], td[width="200"], td[width="210"], 
        td[width="220"], td[width="230"], td[width="240"], td[width="250"],
        td[width="260"], td[width="270"], td[width="280"], td[width="290"],
        td[width="300"], td[width="310"], td[width="320"], td[width="330"],
        td[width="340"], td[width="350"], td[width="360"], td[width="380"],
        table[id*="left"], table[class*="left"],
        .dtree, #channelTree, #dTree {
          display: none !important;
        }

        /* 3. Hide Footers, Quick Links & Copyright */
        #footer, .footer, #bottom, .bottom, table[id*="footer"], table[class*="footer"],
        table[background*="foot"], tr[background*="foot"], td[background*="foot"],
        .quick-links, #quickLinks {
          display: none !important;
        }

        /* 4. Maximize Content Area */
        html, body {
          width: 100% !important;
          margin: 0 !important;
          padding: 16px 28px 80px 28px !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif !important;
          background-color: #ffffff !important;
          color: #1e293b !important;
          overflow-x: hidden !important;
          box-sizing: border-box !important;
        }

        /* Ensure parent layout tables span 100% width without blank margins */
        table {
          width: 100% !important;
          max-width: 100% !important;
        }

        td#right, td.right, td#content, td.content, #mainContent, .mainContent {
          width: 100% !important;
          display: block !important;
        }

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

    // 2. Direct DOM Pruning for JLU Portal Multi-Column Tables
    try {
      const KEYWORDS_LEFT = [
        '用户登录', '站内搜索', '融合门户', '网上办事大厅', '制度清单',
        '基本情况', '公共服务', '信息服务', '网络交流', '专题专栏',
        '吉大学报', '栏目导航', '信息分类', '管理、服务及业务机构',
        '院系设置', '树立和践行正确政绩观', '快速链接'
      ];

      const tables = idoc.querySelectorAll('table');
      tables.forEach(t => {
        // Reset fixed layout widths (e.g. width="1002", "980") to 100%
        if (t.getAttribute('width')) {
          t.setAttribute('width', '100%');
        }

        const trs = t.querySelectorAll(':scope > tbody > tr, :scope > tr');
        trs.forEach(tr => {
          const tds = tr.querySelectorAll(':scope > td');
          if (tds.length >= 2) {
            const firstTd = tds[0];
            const text0 = (firstTd.innerText || '').trim();
            const w0 = firstTd.offsetWidth || parseInt(firstTd.getAttribute('width') || '0', 10);
            
            // If first td is the left sidebar (matched by keyword, tree link, or column width)
            const hasLeftKeywords = KEYWORDS_LEFT.some(k => text0.includes(k));
            const hasNavLinks = firstTd.querySelector('a[href*="channelId"], a[href*="jldxList"], .dtree, img[src*="tree"]');
            
            if (hasLeftKeywords || hasNavLinks || (w0 > 0 && w0 <= 380)) {
              firstTd.style.setProperty('display', 'none', 'important');
              if (tds[1]) {
                tds[1].style.setProperty('width', '100%', 'important');
                tds[1].style.setProperty('max-width', '100%', 'important');
                tds[1].style.setProperty('display', 'table-cell', 'important');
              }
            }
          }

          // Hide copyright and footer rows
          const trText = (tr.innerText || '').trim();
          if (trText.includes('版权所有') || (trText.includes('快速链接') && trText.includes('教学工作'))) {
            tr.style.setProperty('display', 'none', 'important');
          }
        });
      });

      // Also hide standalone quick-links / footer blocks
      idoc.querySelectorAll('div, table').forEach(el => {
        const text = (el.innerText || '').trim();
        if (
          (text.includes('快速链接') && text.includes('教学工作') && text.includes('科研工作')) ||
          (text.includes('吉林大学版权所有') && text.includes('长春市'))
        ) {
          el.style.setProperty('display', 'none', 'important');
        }
      });
    } catch (e) {
      console.warn('[need_more_jlu] DOM 清洗提示:', e);
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

/**
 * need_more_jlu - Side Drawer Preview Component
 * Handles instant slide-out reading of notice details & attachments without opening new slow tabs.
 */

window.NMJDrawer = (function() {
  let drawerRoot = null;
  let drawerOverlay = null;
  let drawerPanel = null;
  let currentFetchController = null;

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
            <span class="nmj-tag-pill" id="nmj-drawer-dept">部门</span>
          </div>
          <div class="nmj-drawer-header-right">
            <a href="#" target="_blank" rel="noopener noreferrer" class="nmj-btn" id="nmj-drawer-open-native">
              ↗ 新标签页打开
            </a>
          </div>
        </div>
        <div class="nmj-drawer-body" id="nmj-drawer-body">
          <div class="nmj-drawer-title" id="nmj-drawer-title">加载中...</div>
          <div class="nmj-drawer-meta" id="nmj-drawer-meta"></div>
          <div class="nmj-drawer-content" id="nmj-drawer-content">
            <div class="nmj-skeleton" style="width: 100%; height: 28px;"></div>
            <div class="nmj-skeleton" style="width: 90%;"></div>
            <div class="nmj-skeleton" style="width: 95%;"></div>
            <div class="nmj-skeleton" style="width: 80%;"></div>
          </div>
          <div class="nmj-drawer-attachments" id="nmj-drawer-attachments" style="display: none;">
            <div class="nmj-attachments-title">📎 附件下载</div>
            <div id="nmj-attachment-list"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(drawerRoot);

    drawerOverlay = document.getElementById('nmj-drawer-overlay');
    drawerPanel = document.getElementById('nmj-drawer');

    drawerOverlay.addEventListener('click', close);
    document.getElementById('nmj-drawer-close-btn').addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawerPanel.classList.contains('active')) {
        close();
      }
    });
  }

  function open(item) {
    init();

    // Reset drawer state
    const titleEl = document.getElementById('nmj-drawer-title');
    const deptEl = document.getElementById('nmj-drawer-dept');
    const metaEl = document.getElementById('nmj-drawer-meta');
    const contentEl = document.getElementById('nmj-drawer-content');
    const attachBox = document.getElementById('nmj-drawer-attachments');
    const attachList = document.getElementById('nmj-attachment-list');
    const nativeLink = document.getElementById('nmj-drawer-open-native');

    titleEl.textContent = item.title;
    deptEl.textContent = item.department || '校内部门';
    metaEl.innerHTML = `<span>📅 发布时间：${item.publishTime}</span> <span>🏢 来源：${item.department}</span>`;
    nativeLink.href = item.url;

    attachBox.style.display = 'none';
    attachList.innerHTML = '';
    contentEl.innerHTML = `
      <div class="nmj-skeleton" style="width: 100%; height: 24px; margin-bottom: 16px;"></div>
      <div class="nmj-skeleton" style="width: 92%;"></div>
      <div class="nmj-skeleton" style="width: 96%;"></div>
      <div class="nmj-skeleton" style="width: 85%;"></div>
      <div class="nmj-skeleton" style="width: 90%;"></div>
    `;

    // Slide in
    drawerOverlay.classList.add('active');
    drawerPanel.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Cancel any previous ongoing fetch
    if (currentFetchController) {
      currentFetchController.abort();
    }
    currentFetchController = new AbortController();

    // Fetch detail content asynchronously
    fetch(item.url, { credentials: 'include', signal: currentFetchController.signal })
      .then(res => res.text())
      .then(htmlText => {
        parseAndRenderArticle(htmlText);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.error('[need_more_jlu] 抓取正文失败:', err);
        contentEl.innerHTML = `
          <div style="padding: 20px; text-align: center; color: var(--nmj-danger);">
            <p>⚠️ 无法直接载入该通知正文预览（可能由于会话失效或跨域策略）</p>
            <p><a href="${item.url}" target="_blank" class="nmj-btn nmj-btn-primary">点击直接在新窗口打开</a></p>
          </div>
        `;
      });
  }

  function parseAndRenderArticle(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const contentEl = document.getElementById('nmj-drawer-content');
    const attachBox = document.getElementById('nmj-drawer-attachments');
    const attachList = document.getElementById('nmj-attachment-list');

    // 1. Locate main body container
    // Typical OA structure: content is within a main table cell, or element with font styling
    let bodyNode = null;
    
    // Check if there is an element with class or id or specific font
    const candidates = [
      doc.querySelector('#content'),
      doc.querySelector('.content'),
      doc.querySelector('td.content'),
      doc.querySelector('div[align="left"]'),
      doc.querySelector('div.TRS_Editor')
    ];

    for (const c of candidates) {
      if (c && c.innerText.trim().length > 20) {
        bodyNode = c;
        break;
      }
    }

    if (!bodyNode) {
      // Fallback: search table cells for the one containing substantive text
      const tds = doc.querySelectorAll('td');
      let maxLen = 0;
      tds.forEach(td => {
        // Exclude headers/nav
        if (td.querySelectorAll('table').length > 3) return;
        const text = td.innerText.trim();
        if (text.length > maxLen) {
          maxLen = text.length;
          bodyNode = td;
        }
      });
    }

    if (bodyNode) {
      // Clean up inline styles that interfere with theme
      const clone = bodyNode.cloneNode(true);
      cleanLegacyNode(clone);
      contentEl.innerHTML = clone.innerHTML;
    } else {
      contentEl.innerHTML = '<p style="color: var(--nmj-text-muted);">未能自动解析正文结构，请点击右上角新标签页打开查看。</p>';
    }

    // 2. Locate Attachments
    // Look for download links: href containing "download" or "file" or "getInformation!download"
    const allLinks = doc.querySelectorAll('a');
    const attachments = [];

    const vpnPrefixMatch = window.location.pathname.match(/^(\/https\/[0-9a-fA-F]+)/);
    const vpnBase = vpnPrefixMatch ? window.location.origin + vpnPrefixMatch[1] : window.location.origin;

    allLinks.forEach(link => {
      const href = link.getAttribute('href') || '';
      const text = link.innerText.trim();
      if (
        href.includes('download') || 
        href.includes('Download') || 
        href.includes('accessory') || 
        text.includes('.doc') || 
        text.includes('.docx') || 
        text.includes('.pdf') || 
        text.includes('.xls') || 
        text.includes('.xlsx') || 
        text.includes('.zip') || 
        text.includes('.rar')
      ) {
        // Make absolute URL with WebVPN handling
        let absHref = href;
        if (href.startsWith('/defaultroot/')) {
          absHref = vpnBase + href;
        } else if (href.startsWith('/')) {
          absHref = window.location.origin + href;
        } else if (!href.startsWith('http')) {
          const base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
          absHref = base + href;
        }

        if (text && !attachments.some(a => a.href === absHref)) {
          attachments.push({ text: text || '附件下载', href: absHref });
        }
      }
    });

    if (attachments.length > 0) {
      attachBox.style.display = 'block';
      attachList.innerHTML = attachments.map(att => `
        <a href="${att.href}" target="_blank" rel="noopener noreferrer" class="nmj-attachment-link">
          💾 ${escapeHtml(att.text)}
        </a>
      `).join('');
    } else {
      attachBox.style.display = 'none';
    }
  }

  function cleanLegacyNode(node) {
    const vpnPrefixMatch = window.location.pathname.match(/^(\/https\/[0-9a-fA-F]+)/);
    const vpnBase = vpnPrefixMatch ? window.location.origin + vpnPrefixMatch[1] : window.location.origin;

    // Fix relative images under WebVPN
    node.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('/defaultroot/')) {
        img.src = vpnBase + src;
      }
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.margin = '10px 0';
    });

    // Fix relative links under WebVPN
    node.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (href && href.startsWith('/defaultroot/')) {
        a.href = vpnBase + href;
      }
    });

    // Remove inline fixed font sizes and colors so theme colors apply naturally
    const all = node.querySelectorAll('*');
    all.forEach(el => {
      el.removeAttribute('face');
      el.removeAttribute('color');
      el.removeAttribute('size');
      if (el.style) {
        el.style.fontFamily = '';
        el.style.backgroundColor = '';
        if (el.style.color && (el.style.color.includes('rgb(0, 0, 0)') || el.style.color === '#000' || el.style.color === '#000000')) {
          el.style.color = '';
        }
      }
      if (el.tagName === 'TABLE') {
        el.style.width = '100%';
        el.style.borderCollapse = 'collapse';
      }
    });
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function close() {
    if (!drawerPanel) return;
    drawerOverlay.classList.remove('active');
    drawerPanel.classList.remove('active');
    document.body.style.overflow = '';
    if (currentFetchController) {
      currentFetchController.abort();
    }
  }

  return {
    init,
    open,
    close
  };
})();

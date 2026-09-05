/**
 * need_more_jlu - Popup Controller (v2.0.0)
 * 智能通道感知：优先校园网直连，按需智能切换 WebVPN
 */

import { CAMPUS_NAMES, CHANNELS, DEFAULT_CAMPUS_CODE, WEBVPN_HASH } from '../config/constants.js';
import { CAMPUS_PORTALS } from './sites_data.js';
import { initDevToolsEasterEgg } from '../dashboard/js/easter_egg.js';

document.addEventListener('DOMContentLoaded', () => {
  initDevToolsEasterEgg();
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnOpenOA = document.getElementById('btn-open-oa');
  const btnOpenVPN = document.getElementById('btn-open-vpn');
  const btnOpenEmap = document.getElementById('btn-open-emap');
  const btnOpenLib = document.getElementById('btn-open-lib');
  const popupCampusName = document.getElementById('popupCampusName');

  // Accordion elements
  const btnToggleAccordion = document.getElementById('btnToggleAccordion');
  const portalAccordion = document.getElementById('portalAccordion');
  const portalBody = document.getElementById('accordionBody');
  const portalList = document.getElementById('portalList');
  const portalSearchInput = document.getElementById('portalSearchInput');
  const portalCountBadge = document.getElementById('portalCountBadge');
  const easterEggWrapper = document.getElementById('easterEggWrapper');
  const easterEggText = document.getElementById('easterEggText');

  // Load campus memory & dynamic version
  const campusKey = localStorage.getItem('nmj_campus') || DEFAULT_CAMPUS_CODE;
  if (popupCampusName) {
    popupCampusName.textContent = CAMPUS_NAMES[campusKey] || CAMPUS_NAMES[DEFAULT_CAMPUS_CODE] || '南岭校区';
  }
  const popupVersionLabel = document.getElementById('popupVersionLabel');
  if (popupVersionLabel && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
    const ver = chrome.runtime.getManifest()?.version;
    if (ver) popupVersionLabel.textContent = `v${ver}`;
  }

  // 1. OA 地址（默认直连）
  let currentOaUrl = CHANNELS.DIRECT.oaUrl;

  // 2. WebVPN 官方统一门户（直接进入统一身份认证登录页）
  const VPN_PORTAL_URL = CHANNELS.WEBVPN?.authUrl || 'https://vpn.jlu.edu.cn/login?cas_login=true';

  // 3. 教务微服务办事大厅（校园网直连 vs WebVPN 智能切换）
  const EMAP_DIRECT_URL = 'https://iedu.jlu.edu.cn/jwapp/sys/emaphome/portal/index.do';
  const EMAP_VPN_URL = `https://vpn.jlu.edu.cn${WEBVPN_HASH}/jwapp/sys/emaphome/portal/index.do`;
  let currentEmapUrl = EMAP_DIRECT_URL;

  // 4. 校图书馆官方主页
  const LIB_URL = 'https://lib.jlu.edu.cn/';

  // 探活并获取当前首选通道
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CHANNEL' }, (res) => {
      const isDirect = (res && res.channel === 'DIRECT');
      if (res && res.oaUrl) {
        currentOaUrl = res.oaUrl;
      }
      currentEmapUrl = isDirect ? EMAP_DIRECT_URL : EMAP_VPN_URL;

      if (btnOpenOA && res && res.channelName) {
        btnOpenOA.title = `打开吉大官方 OA (${res.channelName})`;
      }
      if (btnOpenEmap) {
        btnOpenEmap.title = `打开教务微服务办事大厅 (${isDirect ? '校园网直连' : 'WebVPN 网关'})`;
      }
    });
  }

  const navigateTo = (url) => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  // 1. 打开自习空教室速查仪表盘
  if (btnOpenDashboard) {
    btnOpenDashboard.addEventListener('click', () => {
      const dashboardUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('dashboard/index.html')
        : '../dashboard/index.html';
      navigateTo(dashboardUrl);
    });
  }

  // 2. 打开官方 OA (自适应直连 / WebVPN)
  if (btnOpenOA) {
    btnOpenOA.addEventListener('click', () => {
      navigateTo(currentOaUrl);
    });
  }

  // 3. 打开 WebVPN 统一门户
  if (btnOpenVPN) {
    btnOpenVPN.addEventListener('click', () => {
      navigateTo(VPN_PORTAL_URL);
    });
  }

  // 4. 打开教务微服务办事大厅 (自适应直连 / WebVPN)
  if (btnOpenEmap) {
    btnOpenEmap.addEventListener('click', () => {
      navigateTo(currentEmapUrl);
    });
  }

  // 5. 打开吉林大学图书馆
  if (btnOpenLib) {
    btnOpenLib.addEventListener('click', () => {
      navigateTo(LIB_URL);
    });
  }

  // ==========================================================================
  // 常用校内网站导航列表渲染与交互
  // ==========================================================================
  const renderPortals = (filterKeyword = '') => {
    if (!portalList) return;
    const query = filterKeyword.trim().toLowerCase();

    const filtered = CAMPUS_PORTALS.filter(item => {
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.desc.toLowerCase().includes(query) ||
        item.url.toLowerCase().includes(query)
      );
    });

    if (portalCountBadge) {
      portalCountBadge.textContent = filtered.length;
    }

    if (filtered.length === 0) {
      portalList.innerHTML = `
        <div class="portal-empty-hint">
          <span>未找到相关网站</span>
        </div>
      `;
      return;
    }

    portalList.innerHTML = filtered.map(item => {
      // 提取纯域名/展示路径
      let displayUrl = item.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return `
        <div class="portal-item-card" data-url="${item.url}" title="点击前往：${item.name} (${item.url})">
          <div class="portal-item-icon">${item.icon || '🔗'}</div>
          <div class="portal-item-info">
            <div class="portal-item-header">
              <span class="portal-item-name">${escapeHtml(item.name)}</span>
              <span class="portal-item-url">${escapeHtml(displayUrl)}</span>
            </div>
            <div class="portal-item-desc">${escapeHtml(item.desc)}</div>
          </div>
          <div class="portal-item-action">↗</div>
        </div>
      `;
    }).join('');

    // 为每个卡片绑定点击跳转
    portalList.querySelectorAll('.portal-item-card').forEach(el => {
      el.addEventListener('click', () => {
        const targetUrl = el.getAttribute('data-url');
        if (targetUrl) {
          navigateTo(targetUrl);
        }
      });
    });
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // 初始渲染导航列表
  renderPortals();

  // 搜索过滤监听
  if (portalSearchInput) {
    portalSearchInput.addEventListener('input', (e) => {
      renderPortals(e.target.value);
    });
    // 阻止输入框中的按键冒泡
    portalSearchInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // 折叠 / 展开切换
  if (btnToggleAccordion && portalAccordion) {
    btnToggleAccordion.addEventListener('click', () => {
      const isExpanded = portalAccordion.classList.toggle('expanded');
      localStorage.setItem('nmj_portal_accordion_expanded', isExpanded ? '1' : '0');
      if (isExpanded && portalSearchInput) {
        setTimeout(() => portalSearchInput.focus(), 150);
      }
    });

    // 记住上次展开状态
    const savedState = localStorage.getItem('nmj_portal_accordion_expanded');
    if (savedState === '1') {
      portalAccordion.classList.add('expanded');
    }
  }

  // 彩蛋交互："话说，直接百度会不会更快...?"
  if (easterEggWrapper) {
    easterEggWrapper.addEventListener('click', () => {
      if (easterEggText) {
        easterEggText.textContent = '自己动手丰衣足食！';
        easterEggText.classList.add('active');
        setTimeout(() => {
          navigateTo('https://www.baidu.com/s?wd=%E5%90%89%E6%9E%97%E5%A4%A7%E5%AD%A6');
          easterEggText.textContent = '话说，直接百度会不会更快...?';
          easterEggText.classList.remove('active');
        }, 600);
      }
    });
  }
});


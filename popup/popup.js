/**
 * need_more_jlu - Popup Controller (v2.0.0)
 * 智能通道感知：优先校园网直连，按需智能切换 WebVPN
 */

import { CAMPUS_NAMES, CHANNELS, DEFAULT_CAMPUS_CODE, WEBVPN_HASH } from '../config/constants.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnOpenOA = document.getElementById('btn-open-oa');
  const btnOpenVPN = document.getElementById('btn-open-vpn');
  const btnOpenEmap = document.getElementById('btn-open-emap');
  const popupCampusName = document.getElementById('popupCampusName');

  // Load campus memory
  const campusKey = localStorage.getItem('nmj_campus') || DEFAULT_CAMPUS_CODE;
  if (popupCampusName) {
    popupCampusName.textContent = CAMPUS_NAMES[campusKey] || CAMPUS_NAMES[DEFAULT_CAMPUS_CODE] || '南岭校区';
  }

  // 1. OA 地址（默认直连）
  let currentOaUrl = CHANNELS.DIRECT.oaUrl;

  // 2. WebVPN 官方统一门户（直接进入统一身份认证登录页）
  const VPN_PORTAL_URL = CHANNELS.WEBVPN?.authUrl || 'https://vpn.jlu.edu.cn/login?cas_login=true';

  // 3. 教务微服务办事大厅（校园网直连 vs WebVPN 智能切换）
  const EMAP_DIRECT_URL = 'https://iedu.jlu.edu.cn/jwapp/sys/emaphome/portal/index.do';
  const EMAP_VPN_URL = `https://vpn.jlu.edu.cn${WEBVPN_HASH}/jwapp/sys/emaphome/portal/index.do`;
  let currentEmapUrl = EMAP_DIRECT_URL;

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
});

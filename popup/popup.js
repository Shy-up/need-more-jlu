/**
 * need_more_jlu - Popup Controller (v2.0.0)
 * 智能通道感知：优先校园网直连，按需切换 WebVPN
 */

import { CAMPUS_NAMES, CHANNELS, DEFAULT_CAMPUS_CODE } from '../config/constants.js';

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnOpenOA = document.getElementById('btn-open-oa');
  const popupCampusName = document.getElementById('popupCampusName');

  // Load campus memory
  const campusKey = localStorage.getItem('nmj_campus') || DEFAULT_CAMPUS_CODE;
  if (popupCampusName) {
    popupCampusName.textContent = CAMPUS_NAMES[campusKey] || CAMPUS_NAMES[DEFAULT_CAMPUS_CODE] || '南岭校区';
  }

  // 默认优先使用校园网直连 OA 地址（防止校内无法连接 WebVPN）
  let currentOaUrl = CHANNELS.DIRECT.oaUrl;

  // 探活并获取当前首选通道
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CHANNEL' }, (res) => {
      if (res && res.oaUrl) {
        currentOaUrl = res.oaUrl;
      }
      if (btnOpenOA && res && res.channelName) {
        btnOpenOA.title = `打开吉大官方 OA (${res.channelName})`;
      }
    });
  }

  // Open Classroom Study Dashboard
  if (btnOpenDashboard) {
    btnOpenDashboard.addEventListener('click', () => {
      const dashboardUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) 
        ? chrome.runtime.getURL('dashboard/index.html')
        : '../dashboard/index.html';
      
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: dashboardUrl });
      } else {
        window.open(dashboardUrl, '_blank');
      }
    });
  }

  // Open OA (自适应校园网直连 / WebVPN)
  if (btnOpenOA) {
    btnOpenOA.addEventListener('click', () => {
      const targetUrl = currentOaUrl;
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: targetUrl });
      } else {
        window.open(targetUrl, '_blank');
      }
    });
  }
});

/**
 * need_more_jlu - Popup Controller (v2.0.0)
 * 智能通道感知：优先校园网直连，按需切换 WebVPN
 */

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnOpenOA = document.getElementById('btn-open-oa');
  const popupCampusName = document.getElementById('popupCampusName');

  // Load campus memory
  const campusKey = localStorage.getItem('nmj_campus') || '02';
  const campusNames = {
    '01': '前卫校区',
    'qianwei': '前卫校区',
    '02': '南岭校区',
    'nanling': '南岭校区',
    '03': '新民校区',
    'xinmin': '新民校区',
    '04': '朝阳校区',
    'chaoyang': '朝阳校区',
    '05': '南湖校区',
    'nanhu': '南湖校区',
    '06': '和平校区',
    'heping': '和平校区'
  };
  if (popupCampusName) {
    popupCampusName.textContent = campusNames[campusKey] || '南岭校区';
  }

  // 默认优先使用校园网直连 OA 地址（防止校内无法连接 WebVPN）
  let currentOaUrl = 'https://oa.jlu.edu.cn/defaultroot/PortalInformation!jldxList.action?channelId=179577';

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

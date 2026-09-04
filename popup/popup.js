/**
 * need_more_jlu - Popup Controller (v2.0.0)
 */

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnOpenOA = document.getElementById('btn-open-oa');
  const popupCampusName = document.getElementById('popupCampusName');

  // Load campus memory
  const campusKey = localStorage.getItem('nmj_campus') || 'nanling';
  const campusNames = {
    nanling: '南岭校区（工科）',
    qianwei: '前卫南区（中心）',
    chaoyang: '朝阳校区（地质）',
    xinmin: '新民校区（医学）',
    nanhu: '南湖校区（信息）',
    heping: '和平校区（农学）'
  };
  if (popupCampusName && campusNames[campusKey]) {
    popupCampusName.textContent = campusNames[campusKey];
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

  // Open OA
  if (btnOpenOA) {
    btnOpenOA.addEventListener('click', () => {
      const targetUrl = 'https://vpn.jlu.edu.cn/https/48714f71342f7a336d582f7e2857373750cd3d1004df80a0b5971c1b1a/defaultroot/PortalInformation!jldxList.action?channelId=179577';
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: targetUrl });
      } else {
        window.open(targetUrl, '_blank');
      }
    });
  }
});

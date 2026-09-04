/**
 * need_more_jlu - Popup Controller (v2.0.0)
 */

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnOpenOA = document.getElementById('btn-open-oa');
  const popupCampusName = document.getElementById('popupCampusName');

  // Load campus memory
  const campusKey = localStorage.getItem('nmj_campus') || '02';
  const campusNames = {
    '02': '南岭校区 (工科)',
    'nanling': '南岭校区 (工科)'
  };
  if (popupCampusName) {
    popupCampusName.textContent = campusNames[campusKey] || '南岭校区 (工科)';
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

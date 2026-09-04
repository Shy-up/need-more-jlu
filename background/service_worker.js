/**
 * need_more_jlu - Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[need_more_jlu] 扩展已安装或已更新');
  // Initialize default settings if not exists
  chrome.storage.local.get(['nmj_settings'], (res) => {
    if (!res.nmj_settings) {
      chrome.storage.local.set({
        nmj_settings: {
          theme: 'light',
          customWallpaper: '',
          customAccent: '#0284c7',
          onlyUnread: false,
          drawerEnabled: true
        }
      });
    }
  });
});

// Real Data API Bridge for Free Classrooms (cxkxjs.do)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_AUTH_STATUS') {
    chrome.cookies.get({ url: 'https://vpn.jlu.edu.cn', name: 'wengine_vpn_ticketvpn_jlu_edu_cn' }, (cookie) => {
      const isLoggedIn = Boolean(cookie && cookie.value);
      sendResponse({ isLoggedIn, ticket: isLoggedIn ? cookie.value : null });
    });
    return true; // async sendResponse
  }

  if (request.type === 'FETCH_CLASSROOMS') {
    handleFetchClassrooms(request.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
    return true; // async sendResponse
  }
});

async function handleFetchClassrooms(payload = {}) {
  const {
    campusCode = '02',
    buildingCode = '65',
    date,
    startSection = 1,
    endSection = 1,
    cleanOnly = true,
    pageSize = 300
  } = payload;

  // Ensure buildingCode is numeric code (legacy mock used 'yifu', real JLU is '65')
  const finalBuildingCode = (!buildingCode || buildingCode === 'yifu' || !/^\d+$/.test(buildingCode)) ? '65' : buildingCode;

  // Use today's date if not passed
  const queryDate = date || new Date().toISOString().slice(0, 10);

  // Classroom types: cleanOnly keeps 01 (multimedia) and 08 (general)
  const roomTypes = cleanOnly 
    ? '01,08' 
    : '03,02,01,04,05,06,13,08,09,10,11,12,07';

  // Construct EMAP querySetting
  const querySetting = [
    { name: "XXXQDM", value: campusCode, linkOpt: "AND", builder: "equal" },
    { name: "JXLDM", value: finalBuildingCode, linkOpt: "AND", builder: "equal" },
    { name: "JASLXDM", value: roomTypes, linkOpt: "AND", builder: "m_value_equal" },
    { name: "KXRQ", value: queryDate, linkOpt: "AND", builder: "equal" },
    { name: "KSJC", value: String(startSection), linkOpt: "AND", builder: "equal" },
    { name: "JSJC", value: String(endSection), linkOpt: "AND", builder: "equal" },
    { name: "KXJC", value: String(startSection), linkOpt: "AND", builder: "moreEqual" },
    { name: "KXJC", value: String(endSection), linkOpt: "AND", builder: "lessEqual" }
  ];

  const params = new URLSearchParams();
  params.append('XXXQDM', campusCode);
  params.append('JXLDM', finalBuildingCode);
  params.append('JASLXDM', roomTypes);
  params.append('KXRQ', queryDate);
  params.append('KSJC', String(startSection));
  params.append('JSJC', String(endSection));
  params.append('KXJC', String(startSection));
  params.append('querySetting', JSON.stringify(querySetting));
  params.append('pageSize', String(pageSize));
  params.append('pageNumber', '1');

  // WebVPN URL with the verified reverse-engineered hash prefix
  const webvpnHash = '/https/48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1';
  const url = `https://vpn.jlu.edu.cn${webvpnHash}/jwapp/sys/kxjas/modules/kxjscx/cxkxjs.do?vpn-12-o2-iedu.jlu.edu.cn`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: params.toString()
    });

    if (!resp.ok) {
      return {
        success: false,
        error: 'HTTP_' + resp.status,
        message: `教务系统接口响应异常 (HTTP ${resp.status})`
      };
    }

    const text = await resp.text();
    // Check if redirected to WebVPN login page (HTML)
    if (text.includes('<!DOCTYPE html>') || text.includes('<html') || text.includes('统一身份认证') || text.includes('login')) {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'WebVPN 未登录或认证会话已过期，请先登录吉大 WebVPN'
      };
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return {
        success: false,
        error: 'PARSE_ERROR',
        message: '教务系统返回非标准 JSON 响应',
        raw: text.slice(0, 300)
      };
    }

    const rows = json?.datas?.cxkxjs?.rows;
    if (!Array.isArray(rows)) {
      return {
        success: false,
        error: 'NO_DATA',
        message: '教务系统未返回有效的 rows 列表',
        raw: json
      };
    }

    return {
      success: true,
      totalSize: json?.datas?.cxkxjs?.totalSize || rows.length,
      rows: rows,
      queryMeta: {
        campusCode,
        buildingCode,
        date: queryDate,
        startSection,
        endSection,
        cleanOnly
      }
    };
  } catch (err) {
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: '网络连接失败，请确认是否处于校园网或已开启代理: ' + err.message
    };
  }
}


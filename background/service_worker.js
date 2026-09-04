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

  if (request.type === 'FETCH_TIMELINE') {
    handleFetchTimeline(request.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
    return true; // async sendResponse
  }
});

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function handleFetchTimeline(payload = {}) {
  // Slots 1 to 12 (100% matches official schedule slices)
  const slots = payload.slots || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  
  // Parallel fetch for each slot across requested buildings
  const slotPromises = slots.map(slotNum => {
    return handleFetchClassrooms({
      ...payload,
      startSection: slotNum,
      endSection: slotNum,
      pageSize: 400
    }).then(res => ({
      slot: slotNum,
      res
    }));
  });

  const results = await Promise.all(slotPromises);

  // Check if any request failed due to authentication
  const unauth = results.find(r => r.res && r.res.error === 'UNAUTHENTICATED');
  if (unauth) {
    return {
      success: false,
      error: 'UNAUTHENTICATED',
      message: '吉大教务会话未激活：如在校外请登录 WebVPN (vpn.jlu.edu.cn)；如在校内请确认已登录校园网认证'
    };
  }

  return {
    success: true,
    slotsData: results.map(r => ({
      slot: r.slot,
      success: r.res ? r.res.success : false,
      rows: (r.res && r.res.rows) ? r.res.rows : []
    })),
    queryMeta: payload
  };
}

async function handleFetchClassrooms(payload = {}) {
  const {
    campusCode = '02',
    buildingCode = '65,82,73',
    date,
    startSection = 1,
    endSection = 1,
    cleanOnly = false,
    pageSize = 400
  } = payload;

  const finalBuildingCode = (!buildingCode || buildingCode === 'yifu') 
    ? '65,82,73' 
    : buildingCode;

  // Use local date string instead of UTC to avoid early-morning day-lag
  const queryDate = date || getLocalDateString();

  // Classroom types: query all types to capture full rooms, clean on client-side
  const roomTypes = '03,02,01,04,05,06,13,08,09,10,11,12,07';

  // Construct canonical EMAP querySetting dynamically supporting any campus
  const querySetting = [
    { name: "XXXQDM", caption: "学校校区", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: campusCode },
    { name: "JXLDM", caption: "教学楼", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: finalBuildingCode },
    { name: "JASLXDM", caption: "教室类型", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: roomTypes },
    { name: "KXRQ", caption: "空闲日期", linkOpt: "AND", builderList: "cbl_Other", builder: "equal", value: queryDate },
    { name: "KXJC", caption: "空闲节次", builder: "lessEqual", linkOpt: "AND", builderList: "cbl_Other", value: String(startSection) },
    { name: "KXJC", caption: "空闲节次", linkOpt: "AND", builderList: "cbl_String", builder: "moreEqual", value: String(startSection) },
    { name: "XXXQDM", value: campusCode, linkOpt: "AND", builder: "equal" },
    { name: "JXLDM", value: finalBuildingCode, linkOpt: "AND", builder: "m_value_equal" },
    { name: "JASLXDM", value: roomTypes, linkOpt: "AND", builder: "m_value_equal" },
    { name: "KXRQ", value: queryDate, linkOpt: "AND", builder: "equal" },
    { name: "JSJC", value: String(endSection), linkOpt: "AND", builder: "equal" },
    { name: "KXJC", value: String(startSection), linkOpt: "AND", builder: "equal" },
    { name: "KSJC", value: String(startSection), linkOpt: "AND", builder: "equal" }
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

  // Dual-Channel support: WebVPN encrypted gateway & Campus LAN direct
  const webvpnHash = '/https/48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1';
  const webvpnUrl = `https://vpn.jlu.edu.cn${webvpnHash}/jwapp/sys/kxjas/modules/kxjscx/cxkxjs.do?vpn-12-o2-iedu.jlu.edu.cn`;
  const directUrl = `https://iedu.jlu.edu.cn/jwapp/sys/kxjas/modules/kxjscx/cxkxjs.do`;

  // First try WebVPN endpoint, if unauthenticated try direct LAN endpoint
  const targetUrls = [webvpnUrl, directUrl];
  let lastError = null;

  for (const url of targetUrls) {
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
        if (resp.status === 401) {
          lastError = {
            success: false,
            error: 'UNAUTHENTICATED',
            message: '教务系统提示未登录 (HTTP 401 Not login!)，请登录 WebVPN 或吉大统一身份认证'
          };
          continue;
        }
        lastError = {
          success: false,
          error: 'HTTP_' + resp.status,
          message: `教务系统接口响应异常 (HTTP ${resp.status})`
        };
        continue;
      }

      const text = await resp.text();
      // Check if redirected to login/401 page (HTML / Not login)
      if (
        text.includes('<!DOCTYPE') || 
        text.includes('<html') || 
        text.includes('Not login!') || 
        text.includes('401.png') || 
        text.includes('统一身份认证') || 
        text.includes('login')
      ) {
        lastError = {
          success: false,
          error: 'UNAUTHENTICATED',
          message: 'WebVPN 未登录或校园网会话过期 (Not login!)，请先登录 WebVPN 或连接吉大校园网'
        };
        continue;
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        lastError = {
          success: false,
          error: 'PARSE_ERROR',
          message: '教务系统返回非标准 JSON 响应',
          raw: text.slice(0, 300)
        };
        continue;
      }

      const rows = json?.datas?.cxkxjs?.rows;
      if (!Array.isArray(rows)) {
        lastError = {
          success: false,
          error: 'NO_DATA',
          message: '教务系统未返回有效的 rows 列表',
          raw: json
        };
        continue;
      }

      return {
        success: true,
        totalSize: json?.datas?.cxkxjs?.totalSize || rows.length,
        rows: rows,
        queryMeta: {
          campusCode,
          buildingCode: finalBuildingCode,
          date: queryDate,
          startSection,
          endSection,
          cleanOnly
        }
      };
    } catch (err) {
      lastError = {
        success: false,
        error: 'NETWORK_ERROR',
        message: '网络连接失败，请确认是否处于校园网或已登录 WebVPN: ' + err.message
      };
    }
  }

  return lastError || {
    success: false,
    error: 'UNKNOWN_ERROR',
    message: '教务系统双通道探测均失败'
  };
}


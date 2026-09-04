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

async function handleFetchTimeline(payload = {}) {
  // Slots 1 to 12
  const slots = payload.slots || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  
  // Parallel fetch for each slot across Nanling 65, 82, 73
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
      message: 'WebVPN 未登录或认证会话已过期，请先登录吉大 WebVPN'
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

  // Support Nanling trio 65(逸夫楼), 82(二教), 73(一教)
  const finalBuildingCode = (!buildingCode || buildingCode === 'yifu') 
    ? '65,82,73' 
    : buildingCode;

  // Use today's date if not passed
  const queryDate = date || new Date().toISOString().slice(0, 10);

  // Classroom types: query all types to capture full rooms, clean on client-side
  const roomTypes = '03,02,01,04,05,06,13,08,09,10,11,12,07';

  // Construct canonical EMAP querySetting exactly matching working network trace
  const querySetting = [
    { name: "XXXQDM", caption: "学校校区", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: "02", value_display: "南岭校区" },
    { name: "JXLDM", caption: "教学楼", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: finalBuildingCode, value_display: "南岭-逸夫楼,南岭-(二),南岭-(一)" },
    { name: "JASLXDM", caption: "教室类型", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: roomTypes, value_display: "公用资源,体育馆,多媒体,制图教室,多功能设计教室,体育场,运动场,操场,普通,画室,计算机房,语音室,实验室" },
    { name: "KXRQ", caption: "空闲日期", linkOpt: "AND", builderList: "cbl_Other", builder: "equal", value: queryDate },
    { name: "KXJC", caption: "空闲节次", builder: "lessEqual", linkOpt: "AND", builderList: "cbl_Other", value: String(startSection) },
    { name: "KXJC", caption: "空闲节次", linkOpt: "AND", builderList: "cbl_String", builder: "moreEqual", value: String(startSection) },
    { name: "XXXQDM", value: "02", linkOpt: "AND", builder: "equal" },
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


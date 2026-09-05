/**
 * need_more_jlu - Background Service Worker (Manifest V3)
 * 智能双通道探测架构：
 * 1. 直连 OA (oa.jlu.edu.cn) 测试校园网可达性：可连则校园网可达，优先走校园网；不可连则校园网不可达；
 * 2. 并行测试 WebVPN (vpn.jlu.edu.cn)：可连则支持 VPN，不可连则不支持；
 * 3. 都不可达时明确阻断提示两条均不可达；
 * 4. 校园网下若教务系统未登录/无权限，精准拦截 UNAUTHENTICATED，绝不回退至不可达的 WebVPN 导致超时。
 */

import {
  DEFAULT_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
  PROBE_CACHE_TTL_MS,
  CHANNELS,
  ALL_ROOM_TYPES_CODE,
  DEFAULT_CAMPUS_CODE,
  DEFAULT_BUILDINGS
} from '../config/constants.js';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[need_more_jlu] 扩展已安装或已更新');
  chrome.storage.local.get(['nmj_settings'], (res) => {
    if (!res.nmj_settings) {
      chrome.storage.local.set({
        nmj_settings: {
          theme: 'light',
          customWallpaper: '',
          oaToolsEnabled: true,
          drawerEnabled: true
        }
      });
    }
  });
});

// ============================================================================
// 1. 全局网络超时配置与包装工具 (严格 5 秒超时)
// ============================================================================

async function fetchWithTimeout(resource, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutError = new Error(`连接超时 (${timeoutMs / 1000}s)`);
      timeoutError.name = 'TimeoutError';
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// 2. 双通道定义与可达性并行探测引擎
// ============================================================================

let cachedProbeState = null;
let lastProbeTime = 0;

/**
 * 核心网络标头与 Session Cookie 注入同步：
 * 解决 Chrome MV3 中 Service Worker 跨域 POST 被浏览器 SameSite 机制拦截、
 * 以及 Origin/Referer 被浏览器强制重写为 chrome-extension:// 的问题。
 * 通过 declarativeNetRequest 动态规则，精确将 Origin、Referer、Cookie 补全为官方标准标头。
 */
let isSyncingRules = false;
async function syncCampusDirectNetRules() {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest || isSyncingRules) return;
  isSyncingRules = true;

  try {
    let cookieStr = '';
    if (chrome.cookies && chrome.cookies.getAll) {
      const [ieduCookies, rootCookies] = await Promise.all([
        chrome.cookies.getAll({ domain: 'iedu.jlu.edu.cn' }).catch(() => []),
        chrome.cookies.getAll({ domain: '.jlu.edu.cn' }).catch(() => [])
      ]);

      const cookieMap = new Map();
      for (const c of [...rootCookies, ...ieduCookies]) {
        cookieMap.set(c.name, c.value);
        if (c.sameSite !== 'no_restriction' && c.name && (c.name.includes('SESSION') || c.name === '_WEU' || c.name === 'route' || c.name === 'THEME' || c.name === 'EMAP_LANG')) {
          try {
            chrome.cookies.set({
              url: 'https://iedu.jlu.edu.cn',
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path || '/',
              secure: true,
              httpOnly: c.httpOnly,
              sameSite: 'no_restriction'
            }).catch(() => {});
          } catch (e) {}
        }
      }

      cookieStr = Array.from(cookieMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    }

    const ieduHeaders = [
      { header: 'Origin', operation: 'set', value: 'https://iedu.jlu.edu.cn' },
      { header: 'Referer', operation: 'set', value: 'https://iedu.jlu.edu.cn/jwapp/sys/kxjas/*default/index.do?THEME=purple&EMAP_LANG=en' },
      { header: 'X-Requested-With', operation: 'set', value: 'XMLHttpRequest' }
    ];

    if (cookieStr) {
      ieduHeaders.push({ header: 'Cookie', operation: 'set', value: cookieStr });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1001, 1002],
      addRules: [
        {
          id: 1001,
          priority: 10,
          action: {
            type: 'modifyHeaders',
            requestHeaders: ieduHeaders
          },
          condition: {
            urlFilter: '||iedu.jlu.edu.cn/jwapp/',
            resourceTypes: ['xmlhttprequest', 'main_frame', 'sub_frame']
          }
        },
        {
          id: 1002,
          priority: 10,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'set', value: 'https://vpn.jlu.edu.cn' },
              { header: 'Referer', operation: 'set', value: CHANNELS.WEBVPN.referer },
              { header: 'X-Requested-With', operation: 'set', value: 'XMLHttpRequest' }
            ]
          },
          condition: {
            urlFilter: '||vpn.jlu.edu.cn/',
            resourceTypes: ['xmlhttprequest', 'main_frame', 'sub_frame']
          }
        }
      ]
    });
  } catch (err) {
    console.warn('[need_more_jlu] syncCampusDirectNetRules 异常:', err);
  } finally {
    isSyncingRules = false;
  }
}

if (typeof chrome !== 'undefined' && chrome.cookies && chrome.cookies.onChanged) {
  chrome.cookies.onChanged.addListener((changeInfo) => {
    if (changeInfo.cookie && (changeInfo.cookie.domain.includes('jlu.edu.cn'))) {
      syncCampusDirectNetRules();
    }
  });
}

syncCampusDirectNetRules();

/**
 * 测试直连 OA 验证校园网可达性
 */
async function checkOaReachability() {
  try {
    const resp = await fetchWithTimeout(CHANNELS.DIRECT.probeUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': navigator.userAgent
      }
    }, PROBE_TIMEOUT_MS);
    return resp && resp.status > 0;
  } catch (e) {
    return false;
  }
}

/**
 * 测试 WebVPN 网关可达性
 */
async function checkVpnReachability() {
  try {
    const resp = await fetchWithTimeout(CHANNELS.WEBVPN.probeUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': navigator.userAgent
      }
    }, PROBE_TIMEOUT_MS);
    return resp && resp.status > 0;
  } catch (e) {
    return false;
  }
}

/**
 * 测试课表数据库 (iedu.jlu.edu.cn / cxkxjs.do) 是否真正可达且已认证
 * OA 可达仅代表物理上处于校园网，不代表课表数据库仍可达；必须确保课表可达且无需登录才算"课表可达"。
 */
async function checkTimetableReachability(channelKey) {
  const endpoint = CHANNELS[channelKey];
  if (!endpoint) return { reachable: false, authenticated: false, error: 'NO_ENDPOINT' };

  await syncCampusDirectNetRules();

  try {
    const campusCode = DEFAULT_CAMPUS_CODE;
    const buildingCode = DEFAULT_BUILDINGS;
    const roomTypes = ALL_ROOM_TYPES_CODE;
    const queryDate = getLocalDateString();

    const querySetting = [
      { name: "XXXQDM", caption: "学校校区", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: campusCode },
      { name: "JXLDM", caption: "教学楼", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: buildingCode },
      { name: "JASLXDM", caption: "教室类型", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: roomTypes },
      { name: "KXRQ", caption: "空闲日期", linkOpt: "AND", builderList: "cbl_Other", builder: "equal", value: queryDate },
      { name: "KXJC", caption: "空闲节次", builder: "lessEqual", linkOpt: "AND", builderList: "cbl_Other", value: "1" },
      { name: "KXJC", caption: "空闲节次", linkOpt: "AND", builderList: "cbl_String", builder: "moreEqual", value: "1" },
      { name: "XXXQDM", value: campusCode, linkOpt: "AND", builder: "m_value_equal" },
      { name: "JXLDM", value: buildingCode, linkOpt: "AND", builder: "m_value_equal" },
      { name: "JASLXDM", value: roomTypes, linkOpt: "AND", builder: "m_value_equal" },
      { name: "KXRQ", value: queryDate, linkOpt: "AND", builder: "equal" },
      { name: "JSJC", value: "1", linkOpt: "AND", builder: "equal" },
      { name: "KXJC", value: "1", linkOpt: "AND", builder: "equal" },
      { name: "KSJC", value: "1", linkOpt: "AND", builder: "equal" }
    ];

    const params = new URLSearchParams();
    params.append('XXXQDM', campusCode);
    params.append('JXLDM', buildingCode);
    params.append('JASLXDM', roomTypes);
    params.append('KXRQ', queryDate);
    params.append('KSJC', '1');
    params.append('JSJC', '1');
    params.append('KXJC', '1');
    params.append('querySetting', JSON.stringify(querySetting));
    params.append('pageSize', '1');
    params.append('pageNumber', '1');

    const resp = await fetchWithTimeout(endpoint.apiUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': endpoint.referer,
        'Origin': endpoint.origin
      },
      body: params.toString()
    }, PROBE_TIMEOUT_MS);

    // 1. 检查重定向 (例如被重定向到 CAS 统一认证或 WebVPN 登录)
    if (resp.redirected || (resp.url && (resp.url.includes('login') || resp.url.includes('cas') || resp.url.includes('tpass')))) {
      return {
        reachable: true,
        authenticated: false,
        error: 'UNAUTHENTICATED',
        message: channelKey === 'DIRECT' ? '校园网已连通，但课表数据库未登录，请完成统一身份认证' : 'WebVPN 会话未登录，请先登录 WebVPN'
      };
    }

    // 2. 检查 HTTP 状态码
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403 || resp.status === 302 || channelKey === 'DIRECT') {
        return {
          reachable: true,
          authenticated: false,
          error: 'UNAUTHENTICATED',
          message: channelKey === 'DIRECT' ? '校园网已连通，但课表数据库未登录，请完成统一身份认证' : 'WebVPN 会话未登录，请先登录 WebVPN'
        };
      }
      return {
        reachable: false,
        authenticated: false,
        error: 'HTTP_' + resp.status,
        message: `课表数据库接口响应异常 (HTTP ${resp.status})`
      };
    }

    // 3. 检查响应内容是否为登录页面 HTML
    const text = await resp.text();
    if (
      text.includes('<!DOCTYPE') ||
      text.includes('<html') ||
      text.includes('Not login!') ||
      text.includes('401.png') ||
      text.includes('统一身份认证') ||
      text.includes('login') ||
      text.includes('cas.jlu.edu.cn')
    ) {
      return {
        reachable: true,
        authenticated: false,
        error: 'UNAUTHENTICATED',
        message: channelKey === 'DIRECT' ? '校园网已连通，但课表数据库未登录，请完成统一身份认证' : 'WebVPN 会话未登录，请先登录 WebVPN'
      };
    }

    // 4. 解析 JSON 并验证是否包含合法 rows 结构
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return {
        reachable: channelKey === 'DIRECT',
        authenticated: false,
        error: channelKey === 'DIRECT' ? 'UNAUTHENTICATED' : 'PARSE_ERROR',
        message: channelKey === 'DIRECT' ? '校园网已连通，但课表数据库未登录，请完成统一身份认证' : '课表数据库返回非标准响应'
      };
    }

    const rows = json?.datas?.cxkxjs?.rows;
    if (Array.isArray(rows)) {
      return {
        reachable: true,
        authenticated: true,
        totalSize: json?.datas?.cxkxjs?.totalSize || rows.length
      };
    }

    return {
      reachable: true,
      authenticated: false,
      error: channelKey === 'DIRECT' ? 'UNAUTHENTICATED' : 'NO_DATA',
      message: channelKey === 'DIRECT' ? '校园网已连通，但课表数据库未登录，请完成统一身份认证' : '课表数据库未返回有效数据结构'
    };
  } catch (err) {
    const isTimeout = (err.code === 'TIMEOUT' || err.name === 'TimeoutError');
    // 关键：处于校园网时，OA 已经连通，如果请求课表数据库报错（例如 CAS 跨域重定向异常拦截或未登录），直接判定为 UNAUTHENTICATED，坚决提示直连认证！
    if (channelKey === 'DIRECT') {
      return {
        reachable: true,
        authenticated: false,
        error: 'UNAUTHENTICATED',
        message: '校园网已连通，但课表数据库未登录，请完成统一身份认证'
      };
    }
    return {
      reachable: false,
      authenticated: false,
      error: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout ? '课表数据库连接超时 (5s)' : `连接课表数据库失败: ${err.message || '网络中断'}`
    };
  }
}

/**
 * 并行测试双通道可达性，并严格检验课表数据库可达性：
 * 1. 测试 OA 直连确定是否处于校园网内；
 * 2. 测试 WebVPN 确定是否支持 VPN 网关；
 * 3. 关键：OA 可达时，必须进一步验证课表数据库是否可达且已认证！
 *    若 OA 可达但课表数据库返回未登录/被拦截，则明确判定"课表不可达"并提示登录！
 */
async function probeChannels(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedProbeState && (now - lastProbeTime < PROBE_CACHE_TTL_MS)) {
    return cachedProbeState;
  }

  // 1. 并行测试直连 OA 与 WebVPN
  const [oaOk, vpnOk] = await Promise.all([
    checkOaReachability(),
    checkVpnReachability()
  ]);

  let selectedChannel = null;
  let timetableStatus = { reachable: false, authenticated: false, error: 'NOT_PROBED' };

  if (oaOk) {
    // 处于校园网：坚决选用校园网直连通道！
    selectedChannel = 'DIRECT';
    // 关键：OA 可达并不代表课表数据库仍可达，必须确保课表可达才算"课表可达"
    timetableStatus = await checkTimetableReachability('DIRECT');
  } else if (vpnOk) {
    // 校园网不可达，但 WebVPN 可达
    selectedChannel = 'WEBVPN';
    timetableStatus = await checkTimetableReachability('WEBVPN');
  } else {
    // 两条都不可达
    selectedChannel = null;
    timetableStatus = {
      reachable: false,
      authenticated: false,
      error: 'DUAL_CHANNELS_UNREACHABLE',
      message: '吉大校园网 (oa.jlu.edu.cn) 与校外 WebVPN (vpn.jlu.edu.cn) 均不可达，请检查网络连接'
    };
  }

  cachedProbeState = {
    selectedChannel,
    oaOk,
    vpnOk,
    timetableOk: timetableStatus.authenticated === true,
    timetableReachable: timetableStatus.reachable === true,
    authStatus: timetableStatus.authenticated ? 'AUTHENTICATED' : (timetableStatus.error || 'UNAUTHENTICATED'),
    authMessage: timetableStatus.message || null,
    timestamp: now
  };
  lastProbeTime = now;

  console.log(`[need_more_jlu] 通道探测完成: 校园网(OA)=${oaOk}, WebVPN=${vpnOk}, 课表数据库可达=${cachedProbeState.timetableOk}, 认证状态=${cachedProbeState.authStatus}`);
  return cachedProbeState;
}

// ============================================================================
// 3. 运行时消息分发
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PREPARE_QR_LOGIN') {
    (async () => {
      try {
        const cookieConfigs = [
          { url: 'https://cas.jlu.edu.cn/tpass/login', name: 'last_select_type', value: 'qrcode_login', path: '/tpass' },
          { url: 'https://cas.jlu.edu.cn', name: 'last_select_type', value: 'qrcode_login', path: '/' },
          { url: 'https://vpn.jlu.edu.cn', name: 'last_select_type', value: 'qrcode_login', path: '/' },
          { url: 'https://iedu.jlu.edu.cn', name: 'last_select_type', value: 'qrcode_login', path: '/' }
        ];

        for (const conf of cookieConfigs) {
          try {
            await chrome.cookies.set(conf);
          } catch (err) {}
        }
      } catch (e) {}
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.type === 'GET_ACTIVE_CHANNEL') {
    probeChannels(request.forceRefresh || false)
      .then(probe => {
        const chKey = probe.selectedChannel || (probe.oaOk ? 'DIRECT' : 'WEBVPN');
        const ch = CHANNELS[chKey] || CHANNELS.DIRECT;
        sendResponse({
          success: true,
          channel: chKey,
          channelName: ch.name,
          oaOk: probe.oaOk,
          vpnOk: probe.vpnOk,
          timetableOk: probe.timetableOk,
          isLoggedIn: probe.timetableOk,
          authStatus: probe.authStatus,
          message: probe.authMessage,
          oaUrl: ch.oaUrl,
          authUrl: ch.authUrl
        });
      })
      .catch(err => {
        sendResponse({
          success: false,
          channel: 'DIRECT',
          timetableOk: false,
          isLoggedIn: false,
          authStatus: 'ERROR',
          oaUrl: CHANNELS.DIRECT.oaUrl,
          authUrl: CHANNELS.DIRECT.authUrl,
          error: err.message
        });
      });
    return true;
  }

  if (request.type === 'CHECK_AUTH_STATUS') {
    probeChannels(true)
      .then(probe => {
        sendResponse({ 
          isLoggedIn: probe.timetableOk === true, 
          channel: probe.selectedChannel || 'DIRECT',
          error: probe.timetableOk ? null : probe.authStatus,
          message: probe.authMessage
        });
      })
      .catch((err) => {
        sendResponse({ isLoggedIn: false, error: err.message });
      });
    return true;
  }

  if (request.type === 'FETCH_CLASSROOMS') {
    handleFetchClassrooms(request.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) }));
    return true;
  }

  if (request.type === 'FETCH_TIMELINE') {
    handleFetchTimeline(request.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.code || 'UNKNOWN_ERROR', message: err.message || String(err) }));
    return true;
  }
});

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// 4. 会话自动预热
// ============================================================================

let lastWarmupTime = 0;
async function ensureJluSessionWarmup(selectedChannel) {
  const now = Date.now();
  if (now - lastWarmupTime < 60000) return;
  lastWarmupTime = now;

  const targetCh = CHANNELS[selectedChannel] || CHANNELS.DIRECT;
  const warmupUrl = targetCh.referer;

  try {
    await fetchWithTimeout(warmupUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': navigator.userAgent
      }
    }, PROBE_TIMEOUT_MS);
  } catch (e) {}
}

// ============================================================================
// 5. 教室查询核心逻辑（严格遵循可达性与权限拦截）
// ============================================================================

async function handleFetchClassrooms(payload = {}) {
  const {
    campusCode = DEFAULT_CAMPUS_CODE,
    buildingCode = DEFAULT_BUILDINGS,
    date,
    startSection = 1,
    endSection = 1,
    cleanOnly = false,
    pageSize = 400
  } = payload;

  const finalBuildingCode = (!buildingCode || buildingCode === 'yifu') 
    ? DEFAULT_BUILDINGS 
    : buildingCode;

  const queryDate = date || getLocalDateString();
  const roomTypes = ALL_ROOM_TYPES_CODE;

  const querySetting = [
    { name: "XXXQDM", caption: "学校校区", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: campusCode },
    { name: "JXLDM", caption: "教学楼", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: finalBuildingCode },
    { name: "JASLXDM", caption: "教室类型", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: roomTypes },
    { name: "KXRQ", caption: "空闲日期", linkOpt: "AND", builderList: "cbl_Other", builder: "equal", value: queryDate },
    { name: "KXJC", caption: "空闲节次", builder: "lessEqual", linkOpt: "AND", builderList: "cbl_Other", value: String(startSection) },
    { name: "KXJC", caption: "空闲节次", linkOpt: "AND", builderList: "cbl_String", builder: "moreEqual", value: String(startSection) },
    { name: "XXXQDM", value: campusCode, linkOpt: "AND", builder: "m_value_equal" },
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

  // 1. 并行测试双通道可达性
  const probe = await probeChannels();

  // 场景 A: 两条通道均不可达
  if (!probe.selectedChannel) {
    return {
      success: false,
      error: 'DUAL_CHANNELS_UNREACHABLE',
      message: '吉大校园网 (oa.jlu.edu.cn) 与校外 WebVPN (vpn.jlu.edu.cn) 均不可达，请检查网络连接'
    };
  }

  // 场景 B: 确定首选通道
  const channelKey = probe.selectedChannel;
  const endpoint = CHANNELS[channelKey];

  try {
    await syncCampusDirectNetRules();
    const resp = await fetchWithTimeout(endpoint.apiUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': endpoint.referer,
        'Origin': endpoint.origin
      },
      body: params.toString()
    }, 5000);

    // 检查重定向 (例如被重定向到 CAS 统一认证或 WebVPN 登录)
    if (resp.redirected || (resp.url && (resp.url.includes('login') || resp.url.includes('cas') || resp.url.includes('tpass')))) {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        channel: channelKey,
        message: channelKey === 'DIRECT' 
          ? '校园网已连通，但课表数据库未登录，请完成统一身份认证'
          : 'WebVPN 网关未登录，请先登录 WebVPN'
      };
    }

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403 || resp.status === 302) {
        return {
          success: false,
          error: 'UNAUTHENTICATED',
          channel: channelKey,
          message: channelKey === 'DIRECT' 
            ? '校园网已连通，但课表数据库提示未登录，请完成统一身份认证'
            : 'WebVPN 网关提示未登录，请先登录 WebVPN'
        };
      }
      return {
        success: false,
        error: 'HTTP_' + resp.status,
        channel: channelKey,
        message: `教务系统接口响应异常 (HTTP ${resp.status})`
      };
    }

    const text = await resp.text();
    // 检查是否被拦截或重定向到登录页
    if (
      text.includes('<!DOCTYPE') || 
      text.includes('<html') || 
      text.includes('Not login!') || 
      text.includes('401.png') || 
      text.includes('统一身份认证') || 
      text.includes('login')
    ) {
      // 关键拦截：校园网环境下直连连通但未登录，坚决返回 UNAUTHENTICATED，绝不回退至不可达的 WebVPN！
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        channel: channelKey,
        message: channelKey === 'DIRECT'
          ? '校园网直连正常，但教务会话未登录或已过期，请完成统一身份认证'
          : 'WebVPN 会话未激活或已过期，请先登录 WebVPN'
      };
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return {
        success: false,
        error: 'PARSE_ERROR',
        channel: channelKey,
        message: '教务系统返回非标准 JSON 响应',
        raw: text.slice(0, 300)
      };
    }

    const rows = json?.datas?.cxkxjs?.rows;
    if (!Array.isArray(rows)) {
      return {
        success: false,
        error: 'NO_DATA',
        channel: channelKey,
        message: '教务系统未返回有效的 rows 列表',
        raw: json
      };
    }

    return {
      success: true,
      channel: channelKey,
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
    const isTimeout = (err.code === 'TIMEOUT' || err.name === 'TimeoutError');
    // 关键：校园网直连环境下，坚决走 direct 教务，绝不回退至可能不达的 WebVPN！
    if (channelKey === 'DIRECT') {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        channel: 'DIRECT',
        message: '校园网直连正常，但课表数据库未登录或会话过期，请完成统一身份认证'
      };
    }

    return {
      success: false,
      error: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      channel: channelKey,
      message: isTimeout 
        ? `连接${endpoint.name}超时 (5s)，排课数据未能及时响应`
        : `连接${endpoint.name}失败: ${err.message || '网络连接中断'}`
    };
  }
}

// ============================================================================
// 6. 全天 12 节课切片并行查询
// ============================================================================

async function handleFetchTimeline(payload = {}) {
  const slots = payload.slots || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  
  // 1. 先探活通道并验证课表数据库状态
  const probe = await probeChannels();
  if (!probe.selectedChannel) {
    return {
      success: false,
      error: 'DUAL_CHANNELS_UNREACHABLE',
      message: '吉大校园网 (oa.jlu.edu.cn) 与校外 WebVPN (vpn.jlu.edu.cn) 均不可达，请检查网络连接'
    };
  }

  // 关键：在 OA 可达时也必须确保课表数据库可达才认为"课表可达"，否则直接阻断并提示登录！
  if (probe.timetableOk === false) {
    return {
      success: false,
      error: (probe.selectedChannel === 'DIRECT' || probe.authStatus === 'UNAUTHENTICATED') ? 'UNAUTHENTICATED' : (probe.authStatus || 'NETWORK_ERROR'),
      channel: probe.selectedChannel,
      message: probe.authMessage || (probe.selectedChannel === 'DIRECT'
        ? '校园网已连通，但课表数据库未登录，请完成统一身份认证'
        : 'WebVPN 网关未登录，请先登录 WebVPN')
    };
  }

  // 2. 会话预热
  await ensureJluSessionWarmup(probe.selectedChannel);

  // 3. 并行拉取 12 个时段排课切片
  const slotPromises = slots.map(slotNum => {
    return handleFetchClassrooms({
      ...payload,
      startSection: slotNum,
      endSection: slotNum,
      pageSize: 600
    }).then(res => ({
      slot: slotNum,
      res
    }));
  });

  const results = await Promise.all(slotPromises);

  // 4. 优先检查是否存在未登录认证 (UNAUTHENTICATED)
  const unauth = results.find(r => r.res && r.res.error === 'UNAUTHENTICATED');
  if (unauth) {
    return {
      success: false,
      error: 'UNAUTHENTICATED',
      channel: unauth.res?.channel || probe.selectedChannel,
      message: unauth.res?.message || '吉大教务会话未激活：如在校内请登录校园网统一认证；如在校外请登录 WebVPN'
    };
  }

  // 5. 统计有效成功的切片
  const successfulSlots = results.filter(r => r.res && r.res.success === true);

  if (successfulSlots.length === 0) {
    const firstFail = results.find(r => r.res && !r.res.success)?.res;
    const errorType = firstFail?.error || 'NETWORK_ERROR';
    return {
      success: false,
      error: errorType,
      channel: firstFail?.channel || probe.selectedChannel,
      message: firstFail?.message || '无法连接吉大教务排课服务，未能获取真实排课数据'
    };
  }

  const activeCh = successfulSlots[0]?.res?.channel || probe.selectedChannel;
  return {
    success: true,
    channel: activeCh,
    slotsData: results.map(r => ({
      slot: r.slot,
      success: r.res ? r.res.success : false,
      rows: (r.res && r.res.rows) ? r.res.rows : []
    })),
    queryMeta: payload
  };
}

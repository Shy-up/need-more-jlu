/**
 * need_more_jlu - Data Service & JLU API Fetcher
 * 负责与 Background Service Worker 或直连吉大教务处通信，处理双通道探测与并发拉取。
 */

import {
  ALL_ROOM_TYPES_CODE,
  DEFAULT_CAMPUS_CODE,
  DEFAULT_BUILDINGS,
  CHANNELS
} from '../../config/constants.js';

const REMOTE_SOURCES = {
  recommendations: [
    'https://cdn.jsdelivr.net/gh/Shy-up/need-more-jlu@main/data/recommendations.json',
    'https://raw.githubusercontent.com/Shy-up/need-more-jlu/main/data/recommendations.json'
  ],
  campuses: [
    'https://cdn.jsdelivr.net/gh/Shy-up/need-more-jlu@main/data/campuses.json',
    'https://raw.githubusercontent.com/Shy-up/need-more-jlu/main/data/campuses.json'
  ]
};

const CACHE_KEYS = {
  REC: 'nmj_remote_recommendations',
  CAMPUS: 'nmj_remote_campuses',
  LAST_SYNC: 'nmj_remote_sync_time'
};

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1小时检查一次更新

async function getCachedConfig(key) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const res = await chrome.storage.local.get([key]);
      if (res && res[key]) return res[key];
    } catch (e) {}
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function setCachedConfig(key, value) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (e) {}
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

async function fetchFromSources(urls, timeoutMs = 3500) {
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data) return data;
      }
    } catch (err) {
      // 尝试下一个候选 CDN 源
    }
  }
  return null;
}

/**
 * 静默异步从 GitHub 远程热同步最新配置文件
 */
let isSyncing = false;
export async function syncRemoteConfigsSilently(force = false) {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const lastSync = await getCachedConfig(CACHE_KEYS.LAST_SYNC);
    const now = Date.now();
    if (!force && lastSync && now - Number(lastSync) < SYNC_INTERVAL_MS) {
      return;
    }

    const [remoteRec, remoteCampus] = await Promise.allSettled([
      fetchFromSources(REMOTE_SOURCES.recommendations),
      fetchFromSources(REMOTE_SOURCES.campuses)
    ]);

    if (remoteRec.status === 'fulfilled' && remoteRec.value && Array.isArray(remoteRec.value.recommendations)) {
      await setCachedConfig(CACHE_KEYS.REC, remoteRec.value);
      console.log('[need_more_jlu] 成功从 GitHub 热更新 recommendations.json');
    }

    if (remoteCampus.status === 'fulfilled' && remoteCampus.value && Array.isArray(remoteCampus.value.campuses)) {
      await setCachedConfig(CACHE_KEYS.CAMPUS, remoteCampus.value);
      console.log('[need_more_jlu] 成功从 GitHub 热更新 campuses.json');
    }

    await setCachedConfig(CACHE_KEYS.LAST_SYNC, now);
  } catch (e) {
    console.warn('[need_more_jlu] 静默同步远程配置遇到网络波动，已保留本地版本:', e);
  } finally {
    isSyncing = false;
  }
}

export async function loadRecommendationsConfig() {
  // 1. 优先读取已缓存的最新远程热更新版本（秒开）
  let recommendationsConfig = await getCachedConfig(CACHE_KEYS.REC);

  // 2. 若无缓存，读取扩展内置的离线版本作为基准
  if (!recommendationsConfig || !Array.isArray(recommendationsConfig.recommendations)) {
    try {
      const configUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('data/recommendations.json')
        : '../data/recommendations.json';
      const res = await fetch(configUrl);
      if (res.ok) {
        recommendationsConfig = await res.json();
      }
    } catch (e) {
      console.warn('[need_more_jlu] 读取本地 data/recommendations.json 失败:', e);
    }
  }

  // 3. 最终保底兜底（网络与本地均异常时）
  if (!recommendationsConfig || !Array.isArray(recommendationsConfig.recommendations)) {
    recommendationsConfig = {
      githubRepoUrl: 'https://github.com/Shy-up/need-more-jlu',
      recommendations: [
        { campusCode: '02', buildingCode: '65', buildingName: '南岭-逸夫楼', reason: '教室非常多' },
        { campusCode: '02', buildingCode: '73', buildingName: '南岭-(一)', reason: '阶梯教室打野' },
        { campusCode: '02', buildingCode: '82', buildingName: '南岭-(二)', reason: '看缘分' }
      ]
    };
  }

  // 4. 后台发起静默热更新探测（SWR 机制，不阻塞当前 UI 渲染）
  setTimeout(() => syncRemoteConfigsSilently().catch(() => {}), 100);

  return recommendationsConfig;
}

export function getBuildingRecommendation(bldg, campusCode, recommendationsConfig) {
  if (!recommendationsConfig || !Array.isArray(recommendationsConfig.recommendations)) return null;
  return recommendationsConfig.recommendations.find(r => {
    const matchCampus = !r.campusCode || String(r.campusCode) === String(campusCode);
    const matchCode = String(r.buildingCode) === String(bldg.code) || String(r.buildingCode) === String(bldg.id);
    const matchName = r.buildingName && (bldg.name.includes(r.buildingName) || r.buildingName.includes(bldg.name));
    return matchCampus && (matchCode || matchName);
  }) || null;
}

export function getSanitizedBuildingId(availableBuildings, targetCampusCode, recommendationsConfig) {
  const list = availableBuildings || [];
  let saved = localStorage.getItem('nmj_building');
  if (!saved || !list.some(b => b.id === saved)) {
    const firstRec = list.find(b => getBuildingRecommendation(b, targetCampusCode, recommendationsConfig));
    saved = firstRec ? firstRec.id : (list.length > 0 ? list[0].id : '65');
    localStorage.setItem('nmj_building', saved);
  }
  return saved;
}

export async function loadCampusConfig(recommendationsConfig) {
  // 1. 优先读取已缓存的最新远程热更新版本（秒开）
  let campusConfig = await getCachedConfig(CACHE_KEYS.CAMPUS);

  // 2. 若无缓存，读取扩展内置离线版本
  if (!campusConfig || !Array.isArray(campusConfig.campuses) || campusConfig.campuses.length === 0) {
    try {
      const configUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('data/campuses.json')
        : '../data/campuses.json';
      const res = await fetch(configUrl);
      if (res.ok) {
        campusConfig = await res.json();
      }
    } catch (e) {
      console.warn('[need_more_jlu] 读取本地 data/campuses.json 失败:', e);
    }
  }

  // 3. 最终保底兜底
  if (!campusConfig || !Array.isArray(campusConfig.campuses) || campusConfig.campuses.length === 0) {
    campusConfig = {
      defaultCampus: DEFAULT_CAMPUS_CODE,
      campuses: [
        {
          id: 'nanling',
          code: '02',
          name: '南岭校区',
          shortName: '南岭',
          buildings: [
            { id: '65', code: '65', name: '南岭-逸夫楼', shortName: '逸夫楼' },
            { id: '73', code: '73', name: '南岭-(一)', shortName: '第一教学楼' },
            { id: '82', code: '82', name: '南岭-(二)', shortName: '第二教学楼' }
          ]
        }
      ]
    };
  }

  return campusConfig;
}

export async function directFetchParallelTimeline(payload, currentCampus, currentBuildings) {
  const slots = payload.slots || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // 1. 并行探测直连 OA 和 WebVPN 可达性
  let oaOk = false;
  let vpnOk = false;
  try {
    const probeOa = fetch(CHANNELS.DIRECT.probeUrl, { method: 'GET', signal: AbortSignal.timeout(4000) }).then(r => r.status > 0).catch(() => false);
    const probeVpn = fetch(CHANNELS.WEBVPN.probeUrl, { method: 'GET', signal: AbortSignal.timeout(4000) }).then(r => r.status > 0).catch(() => false);
    const [resOa, resVpn] = await Promise.all([probeOa, probeVpn]);
    oaOk = resOa;
    vpnOk = resVpn;
  } catch (e) { }

  if (!oaOk && !vpnOk) {
    return {
      success: false,
      error: 'DUAL_CHANNELS_UNREACHABLE',
      message: '吉大校园网 (oa.jlu) 与校外 WebVPN (vpn.jlu) 均不可达，请检查本地网络连接'
    };
  }

  const candidateEndpoints = [];
  if (oaOk) {
    candidateEndpoints.push(CHANNELS.DIRECT);
  } else if (vpnOk) {
    candidateEndpoints.push(CHANNELS.WEBVPN);
  }

  const campusCode = payload.campusCode || DEFAULT_CAMPUS_CODE;
  const buildingCode = payload.buildingCode || (currentBuildings.map(b => b.code).join(',')) || DEFAULT_BUILDINGS;
  const campusName = currentCampus ? currentCampus.name : '南岭校区';
  const buildingNames = currentBuildings.length > 0 ? currentBuildings.map(b => b.name).join(',') : '逸夫楼,第二教学楼,第一教学楼';
  const roomTypes = ALL_ROOM_TYPES_CODE;

  // 关键：在 OA 可达时也必须确保课表数据库可达才算"课表可达"，否则提前阻断并提示登录
  const primaryEndpoint = candidateEndpoints[0];
  try {
    const probeParams = new URLSearchParams();
    probeParams.append('pageSize', '1');
    probeParams.append('pageNumber', '1');
    const testResp = await fetch(primaryEndpoint.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': primaryEndpoint.referer,
        'Origin': primaryEndpoint.origin
      },
      body: probeParams.toString(),
      signal: AbortSignal.timeout(4500)
    });

    if (testResp.redirected || (testResp.url && (testResp.url.includes('login') || testResp.url.includes('cas') || testResp.url.includes('tpass')))) {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        channel: primaryEndpoint.id,
        message: primaryEndpoint.id === 'DIRECT' ? '校园网已连通，但课表数据库未登录，请完成统一身份认证' : 'WebVPN 网关未登录'
      };
    }

    if (!testResp.ok && (testResp.status === 401 || testResp.status === 403 || testResp.status === 302)) {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        channel: primaryEndpoint.id,
        message: primaryEndpoint.id === 'DIRECT' ? '校园网已连通，但课表数据库未登录，请完成统一身份认证' : 'WebVPN 网关未登录'
      };
    }

    const testText = await testResp.text();
    if (
      testText.includes('<!DOCTYPE') ||
      testText.includes('<html') ||
      testText.includes('Not login!') ||
      testText.includes('401.png') ||
      testText.includes('统一身份认证') ||
      testText.includes('login') ||
      testText.includes('cas.jlu.edu.cn')
    ) {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        channel: primaryEndpoint.id,
        message: primaryEndpoint.id === 'DIRECT' ? '校园网已连通，但课表数据库未登录，请完成统一身份认证' : 'WebVPN 会话已失效'
      };
    }
  } catch (probeErr) {
    if (primaryEndpoint && primaryEndpoint.id === 'DIRECT') {
      return {
        success: false,
        error: 'UNAUTHENTICATED',
        channel: 'DIRECT',
        message: '校园网已连通，但课表数据库未登录，请完成统一身份认证'
      };
    }
  }

  let lastCandidateError = null;

  for (const endpoint of candidateEndpoints) {
    try {
      const promises = slots.map(async (slotNum) => {
        const querySetting = [
          { name: "XXXQDM", caption: "学校校区", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: campusCode, value_display: campusName },
          { name: "JXLDM", caption: "教学楼", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: buildingCode, value_display: buildingNames },
          { name: "JASLXDM", caption: "教室类型", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: roomTypes, value_display: "公用资源,体育馆,多媒体,制图教室,多功能设计教室,体育场,运动场,操场,普通,画室,计算机房,语音室,实验室" },
          { name: "KXRQ", caption: "空闲日期", linkOpt: "AND", builderList: "cbl_Other", builder: "equal", value: payload.date },
          { name: "KXJC", caption: "空闲节次", builder: "lessEqual", linkOpt: "AND", builderList: "cbl_Other", value: String(slotNum) },
          { name: "KXJC", caption: "空闲节次", linkOpt: "AND", builderList: "cbl_String", builder: "moreEqual", value: String(slotNum) },
          { name: "XXXQDM", value: campusCode, linkOpt: "AND", builder: "m_value_equal" },
          { name: "JXLDM", value: buildingCode, linkOpt: "AND", builder: "m_value_equal" },
          { name: "JASLXDM", value: roomTypes, linkOpt: "AND", builder: "m_value_equal" },
          { name: "KXRQ", value: payload.date, linkOpt: "AND", builder: "equal" },
          { name: "JSJC", value: String(slotNum), linkOpt: "AND", builder: "equal" },
          { name: "KXJC", value: String(slotNum), linkOpt: "AND", builder: "equal" },
          { name: "KSJC", value: String(slotNum), linkOpt: "AND", builder: "equal" }
        ];

        const params = new URLSearchParams();
        params.append('XXXQDM', campusCode);
        params.append('JXLDM', buildingCode);
        params.append('JASLXDM', roomTypes);
        params.append('KXRQ', payload.date);
        params.append('KSJC', String(slotNum));
        params.append('JSJC', String(slotNum));
        params.append('KXJC', String(slotNum));
        params.append('querySetting', JSON.stringify(querySetting));
        params.append('pageSize', '600');
        params.append('pageNumber', '1');

        const resp = await fetch(endpoint.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': endpoint.referer,
            'Origin': endpoint.origin
          },
          body: params.toString(),
          signal: AbortSignal.timeout(5000)
        });

        if (resp.redirected || (resp.url && (resp.url.includes('login') || resp.url.includes('cas') || resp.url.includes('tpass')))) {
          const err = new Error(endpoint.id === 'DIRECT' ? '校园网课表未登录' : 'WebVPN 未登录');
          err.code = 'UNAUTHENTICATED';
          throw err;
        }

        if (!resp.ok) {
          if (resp.status === 401 || resp.status === 403 || resp.status === 302 || endpoint.id === 'DIRECT') {
            const err = new Error(endpoint.id === 'DIRECT' ? '校园网课表未登录' : 'WebVPN 未登录');
            err.code = 'UNAUTHENTICATED';
            throw err;
          }
          const err = new Error(`HTTP ${resp.status}`);
          err.code = 'HTTP_' + resp.status;
          throw err;
        }

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
          const err = new Error(endpoint.id === 'DIRECT' ? '校园网课表未登录' : 'WebVPN 会话已失效');
          err.code = 'UNAUTHENTICATED';
          throw err;
        }

        let json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          const err = new Error(endpoint.id === 'DIRECT' ? '校园网课表未登录' : 'JSON 解析失败');
          err.code = endpoint.id === 'DIRECT' ? 'UNAUTHENTICATED' : 'PARSE_ERROR';
          throw err;
        }

        const rows = json?.datas?.cxkxjs?.rows;
        return {
          slot: slotNum,
          success: Array.isArray(rows),
          rows: Array.isArray(rows) ? rows : []
        };
      });

      const sliceResults = await Promise.all(promises);
      return {
        success: true,
        channel: endpoint.id,
        slotsData: sliceResults
      };
    } catch (err) {
      lastCandidateError = err;
      if (err.code === 'UNAUTHENTICATED' || endpoint.id === 'DIRECT') {
        return {
          success: false,
          error: 'UNAUTHENTICATED',
          channel: endpoint.id,
          message: endpoint.id === 'DIRECT' ? '校园网已连通，但课表数据库未登录，请完成统一身份认证' : 'WebVPN 网关未登录'
        };
      }
    }
  }

  const isTimeout = (lastCandidateError?.code === 'TIMEOUT' || lastCandidateError?.name === 'TimeoutError');
  return {
    success: false,
    error: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
    message: isTimeout ? '连接吉大教务服务超时 (5s)' : (lastCandidateError?.message || '无法获取排课数据')
  };
}

export async function fetchTimelineData(payload, currentCampus, currentBuildings) {
  let result = null;

  // 1. 优先通过 Background Service Worker 发送（增加 5s 超时兜底，防止 SW 挂起导致无限卡 loading）
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      result = await new Promise((resolve) => {
        let hasResolved = false;
        const timer = setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            console.warn('[need_more_jlu] FETCH_TIMELINE 通信超时 (5s)');
            resolve({ success: false, error: 'TIMEOUT', message: '连接教务排课服务超时 (5s)' });
          }
        }, 5000);

        chrome.runtime.sendMessage({ type: 'FETCH_TIMELINE', payload }, (res) => {
          if (hasResolved) return;
          hasResolved = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res);
          }
        });
      });
    } catch (err) {
      console.warn('[need_more_jlu] chrome.runtime.sendMessage 失败，尝试直接 fetch:', err);
    }
  }

  // 2. 直连降级（仅当 background 通信未就绪或未返回任何结果时才降级）
  if (!result) {
    result = await directFetchParallelTimeline(payload, currentCampus, currentBuildings);
  }

  return result;
}

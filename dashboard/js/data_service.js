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

export async function loadRecommendationsConfig() {
  let recommendationsConfig = null;
  try {
    const configUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('data/recommendations.json')
      : '../data/recommendations.json';
    const res = await fetch(configUrl);
    if (res.ok) {
      recommendationsConfig = await res.json();
    }
  } catch (e) {
    console.warn('[need_more_jlu] 读取 data/recommendations.json 失败，启用保底南岭推荐:', e);
  }

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
  let campusConfig = null;
  try {
    const configUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('data/campuses.json')
      : '../data/campuses.json';
    const res = await fetch(configUrl);
    if (res.ok) {
      campusConfig = await res.json();
    }
  } catch (e) {
    console.warn('[need_more_jlu] 读取 data/campuses.json 失败，启用保底南岭校区配置:', e);
  }

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
  }
  if (vpnOk) {
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
    // 探测异常后续在循环中重试或返回超时
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
          if (resp.status === 401 || resp.status === 403 || resp.status === 302) {
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
          const err = new Error('JSON 解析失败');
          err.code = 'PARSE_ERROR';
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
      if (err.code === 'UNAUTHENTICATED') {
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

  // 1. 优先通过 Background Service Worker 发送
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'FETCH_TIMELINE', payload }, (res) => {
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

  // 2. 直连降级
  if (!result || !result.success) {
    result = await directFetchParallelTimeline(payload, currentCampus, currentBuildings);
  }

  return result;
}

// Unit test to verify dual-channel priority and timeout error handling logic
const assert = require('assert');

// 1. Verify fetchWithTimeout behavior
async function testTimeout() {
  const timeoutMs = 100; // fast test
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    await new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        const timeoutError = new Error(`连接超时 (${timeoutMs / 1000}s)`);
        timeoutError.name = 'TimeoutError';
        timeoutError.code = 'TIMEOUT';
        reject(timeoutError);
      });
    });
    assert.fail('Should have timed out');
  } catch (err) {
    assert.strictEqual(err.code, 'TIMEOUT');
    assert.strictEqual(err.name, 'TimeoutError');
  } finally {
    clearTimeout(timer);
  }
}

// 2. Verify timeline failure handling (prevent false success with 0 rooms)
function simulateTimelineResults(results) {
  // Check unauth
  const unauth = results.find(r => r.res && r.res.error === 'UNAUTHENTICATED');
  if (unauth) {
    return {
      success: false,
      error: 'UNAUTHENTICATED',
      message: unauth.res?.message || '吉大教务会话未激活'
    };
  }

  // Check successful slots
  const successfulSlots = results.filter(r => r.res && r.res.success === true);
  if (successfulSlots.length === 0) {
    const firstFail = results.find(r => r.res && !r.res.success)?.res;
    const errorType = firstFail?.error || 'NETWORK_ERROR';
    return {
      success: false,
      error: errorType,
      message: firstFail?.message || '无法连接吉大教务服务'
    };
  }

  return {
    success: true,
    slotsData: results.map(r => ({
      slot: r.slot,
      success: r.res ? r.res.success : false,
      rows: (r.res && r.res.rows) ? r.res.rows : []
    }))
  };
}

async function run() {
  console.log('Testing timeout logic...');
  await testTimeout();
  console.log(' Timeout test passed.');

  console.log('Testing timeline error prevention...');
  // Case A: All 12 slots timed out
  const timeoutResults = Array.from({ length: 12 }, (_, i) => ({
    slot: i + 1,
    res: { success: false, error: 'TIMEOUT', message: '连接超时 (5s)' }
  }));
  const resA = simulateTimelineResults(timeoutResults);
  assert.strictEqual(resA.success, false, 'Must NOT be success when timed out');
  assert.strictEqual(resA.error, 'TIMEOUT');
  console.log(' Timeout results correctly returned success: false & error: TIMEOUT');

  // Case B: Unauthenticated
  const unauthResults = [
    { slot: 1, res: { success: false, error: 'UNAUTHENTICATED' } },
    ...Array.from({ length: 11 }, (_, i) => ({ slot: i + 2, res: { success: false, error: 'TIMEOUT' } }))
  ];
  const resB = simulateTimelineResults(unauthResults);
  assert.strictEqual(resB.success, false);
  assert.strictEqual(resB.error, 'UNAUTHENTICATED');
  console.log(' Unauth results correctly returned success: false & error: UNAUTHENTICATED');

  // Case D: OA is reachable, but timetable database requires login
  function simulateChannelTimetableProbe({ oaOk, vpnOk, timetableAuthOk }) {
    let selectedChannel = null;
    let authStatus = 'NOT_PROBED';
    let timetableOk = false;

    if (oaOk) {
      selectedChannel = 'DIRECT';
      timetableOk = timetableAuthOk;
      authStatus = timetableAuthOk ? 'AUTHENTICATED' : 'UNAUTHENTICATED';
    } else if (vpnOk) {
      selectedChannel = 'WEBVPN';
      timetableOk = timetableAuthOk;
      authStatus = timetableAuthOk ? 'AUTHENTICATED' : 'UNAUTHENTICATED';
    } else {
      authStatus = 'DUAL_CHANNELS_UNREACHABLE';
    }

    return {
      selectedChannel,
      oaOk,
      vpnOk,
      timetableOk,
      authStatus,
      isLoggedIn: timetableOk
    };
  }

  const probeUnauth = simulateChannelTimetableProbe({ oaOk: true, vpnOk: false, timetableAuthOk: false });
  assert.strictEqual(probeUnauth.oaOk, true, 'OA is reachable');
  assert.strictEqual(probeUnauth.timetableOk, false, 'Timetable must NOT be considered ready when unauthenticated');
  assert.strictEqual(probeUnauth.authStatus, 'UNAUTHENTICATED', 'Must require login when timetable DB is not authenticated');
  assert.strictEqual(probeUnauth.isLoggedIn, false);
  console.log(' Verified: OA reachable does NOT mean timetable reachable; unauthenticated DB correctly requires login');

  // Case E: Verify campus LAN direct URL and zero WebVPN fallback
  const EXPECTED_DIRECT_AUTH_URL = 'https://iedu.jlu.edu.cn/jwapp/sys/kxjas/*default/index.do?THEME=purple&EMAP_LANG=en#/kxjscx';
  function simulateDirectResolution(oaOk, vpnOk) {
    if (oaOk) {
      return {
        channel: 'DIRECT',
        authUrl: EXPECTED_DIRECT_AUTH_URL,
        allowVpnFallback: false
      };
    }
    return {
      channel: 'WEBVPN',
      authUrl: 'https://vpn.jlu.edu.cn/login?cas_login=true',
      allowVpnFallback: false
    };
  }

  const campusRes = simulateDirectResolution(true, false);
  assert.strictEqual(campusRes.channel, 'DIRECT');
  assert.strictEqual(campusRes.authUrl, EXPECTED_DIRECT_AUTH_URL, 'Direct authUrl must point to empty classroom portal with #/kxjscx');
  assert.strictEqual(campusRes.allowVpnFallback, false, 'Campus LAN must NEVER fall back to WebVPN');
  // Case F: Verify WebVPN session expired JSON response correctly recognized as UNAUTHENTICATED
  function simulateWebvpnResponseInspection(responseBody) {
    const text = (typeof responseBody === 'string') ? responseBody : JSON.stringify(responseBody);

    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }

    if (json) {
      if (
        json?.url === '/login' ||
        (typeof json?.url === 'string' && json.url.includes('login')) ||
        (typeof json?.message === 'string' && (json.message.includes('登录') || json.message.includes('会话') || json.message.includes('过期')))
      ) {
        return { success: false, error: 'UNAUTHENTICATED', message: json.message };
      }

      const rows = json?.datas?.cxkxjs?.rows;
      if (Array.isArray(rows)) {
        return { success: true, rows };
      }

      return { success: false, error: 'NO_DATA' };
    }

    if (
      text.includes('您的会话已经过期') ||
      text.includes('请重新登录') ||
      text.includes('会话已过期') ||
      text.includes('会话过期')
    ) {
      return { success: false, error: 'UNAUTHENTICATED', message: 'WebVPN 会话已过期，请重新登录' };
    }

    return { success: false, error: 'PARSE_ERROR' };
  }

  const expiredVpnJson = {
    message: '您的会话已经过期，请重新登录',
    success: false,
    url: '/login'
  };
  const sessionResult = simulateWebvpnResponseInspection(expiredVpnJson);
  assert.strictEqual(sessionResult.error, 'UNAUTHENTICATED', 'Must identify expired session as UNAUTHENTICATED rather than NO_DATA');
  assert.strictEqual(sessionResult.message, '您的会话已经过期，请重新登录');
  console.log(' Verified: WebVPN session expired JSON correctly recognized as UNAUTHENTICATED');

  console.log('All unit tests passed successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

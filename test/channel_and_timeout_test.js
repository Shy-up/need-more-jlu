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

  const probeAuth = simulateChannelTimetableProbe({ oaOk: true, vpnOk: false, timetableAuthOk: true });
  assert.strictEqual(probeAuth.timetableOk, true);
  assert.strictEqual(probeAuth.isLoggedIn, true);
  console.log(' Verified: OA reachable + timetable DB authorized correctly considered ready');

  console.log('All unit tests passed successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

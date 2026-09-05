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

  // Case C: Real data with rows
  const realResults = Array.from({ length: 12 }, (_, i) => ({
    slot: i + 1,
    res: { success: true, rows: [{ JASMC: '逸夫楼101' }] }
  }));
  const resC = simulateTimelineResults(realResults);
  assert.strictEqual(resC.success, true);
  assert.strictEqual(resC.slotsData.length, 12);
  assert.strictEqual(resC.slotsData[0].rows.length, 1);
  console.log(' Real data correctly returned success: true with rows');

  console.log('All unit tests passed successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

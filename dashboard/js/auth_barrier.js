/**
 * need_more_jlu - Auth Barrier & QR Login Controller
 * 负责严格拒绝假数据的阻断拦截屏障、微信扫码/统一身份认证一键唤起、弹窗生命周期与轮询自愈。
 */

let qrPollTimer = null;
let loginAuthWindow = null;

export function updateBadgeState(status, text) {
  const badge = document.getElementById('realDataBadge');
  const textEl = document.getElementById('realDataBadgeText');
  if (!badge || !textEl) return;

  badge.className = `real-data-badge ${status}`;
  textEl.textContent = text;
}

export function showLoadingPanel(show = true) {
  const el = document.getElementById('realDataLoadingPanel');
  if (el) el.style.display = show ? 'flex' : 'none';
}

export function hideLoadingPanel() {
  showLoadingPanel(false);
}

export function showContentArea() {
  const el = document.getElementById('realDataContentArea');
  if (el) el.style.display = 'block';
}

export function hideContentArea() {
  const el = document.getElementById('realDataContentArea');
  if (el) el.style.display = 'none';
}

export function hideBarrierPanel() {
  const el = document.getElementById('realDataBarrierPanel');
  if (el) el.style.display = 'none';
}

export function stopQrLoginPolling() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }
}

export function handleAuthSuccessNotification(onSuccess) {
  stopQrLoginPolling();

  if (loginAuthWindow && !loginAuthWindow.closed) {
    try { loginAuthWindow.close(); } catch (e) { }
  }

  const statusText = document.getElementById('qrStatusText');
  if (statusText) {
    statusText.innerHTML = '🎉 <strong>真实空闲教室数据获取成功！正在呈现课室舱位...</strong>';
  }

  setTimeout(() => {
    hideBarrierPanel();
    if (typeof onSuccess === 'function') onSuccess();
  }, 600);
}

export async function checkLoginAndAutoReload(onSuccess) {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    return;
  }

  chrome.runtime.sendMessage({ type: 'CHECK_AUTH_STATUS' }, async (res) => {
    const statusText = document.getElementById('qrStatusText');
    if (res && res.isLoggedIn === true) {
      handleAuthSuccessNotification(onSuccess);
    } else if (res && statusText) {
      if (res.channel === 'WEBVPN') {
        statusText.innerHTML = '<span class="qr-status-dot pulse"></span> 正在等待 WebVPN 教务系统会话确认... 登录后将自动同步';
      } else if (res.message) {
        statusText.innerHTML = `<span class="qr-status-dot pulse"></span> ${res.message}`;
      }
    }
  });
}

export function startEmbeddedQrLoginFlow(onSuccess) {
  const statusText = document.getElementById('qrStatusText');
  const qrContainer = document.getElementById('barrierQrContainer');

  if (qrContainer) qrContainer.style.display = 'flex';
  if (statusText) {
    statusText.innerHTML = '<span class="qr-status-dot pulse"></span> 正在准备官方认证通道...';
  }

  const openPopup = (authUrl, isVpn = false) => {
    const targetUrl = authUrl || 'https://iedu.jlu.edu.cn/jwapp/sys/kxjas/*default/index.do?THEME=purple&EMAP_LANG=en#/kxjscx';
    if (statusText) {
      statusText.innerHTML = isVpn
        ? '<span class="qr-status-dot pulse"></span> 正在等待 WebVPN 统一身份认证... 登录后将自动同步'
        : '<span class="qr-status-dot pulse"></span> 正在等待登录确认... 若弹出证书警告请点击【高级 ➔ 继续前往】放行';
    }

    const width = 760;
    const height = 720;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

    if (!loginAuthWindow || loginAuthWindow.closed) {
      loginAuthWindow = window.open(
        targetUrl,
        'JLU_AUTH_WINDOW',
        `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
      );
    } else {
      loginAuthWindow.focus();
    }

    // 持续探测真实排课数据，一旦登录成功自动进入
    stopQrLoginPolling();
    qrPollTimer = setInterval(() => checkLoginAndAutoReload(onSuccess), 2000);
  };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'PREPARE_QR_LOGIN' }, () => {
      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CHANNEL' }, (chRes) => {
        const resolvedAuthUrl = chRes?.authUrl;
        const isVpn = (chRes?.channel === 'WEBVPN');
        openPopup(resolvedAuthUrl, isVpn);
      });
    });
  } else {
    openPopup();
  }
}

export function showHardFailBarrier(errorResult, state = {}, currentCampus = null, currentBuildings = []) {
  hideContentArea();
  hideLoadingPanel();

  const barrierEl = document.getElementById('realDataBarrierPanel');
  if (!barrierEl) return;

  barrierEl.style.display = 'flex';
  updateBadgeState('disconnected', '教务未直连 · 拒绝假数据');

  const titleEl = document.getElementById('barrierTitle');
  const subtitleEl = document.getElementById('barrierSubtitle');
  const diagTextEl = document.getElementById('barrierDiagnosticsText');
  const iconEl = barrierEl.querySelector('.barrier-icon-large');

  const isDualFail = (errorResult?.error === 'DUAL_CHANNELS_UNREACHABLE');
  const isUnauth = (
    errorResult?.error === 'UNAUTHENTICATED' || 
    (errorResult?.channel === 'DIRECT' && !isDualFail) ||
    (typeof errorResult?.message === 'string' && (errorResult.message.includes('登录') || errorResult.message.includes('会话') || errorResult.message.includes('过期')))
  );
  const isTimeout = (errorResult?.error === 'TIMEOUT');
  const qrBtn = document.getElementById('btnToggleEmbeddedQr');
  const retryBtn = document.getElementById('btnRetryRealFetch');

  if (qrBtn) {
    qrBtn.style.display = isUnauth ? 'inline-flex' : 'none';
    if (errorResult?.channel === 'DIRECT') {
      qrBtn.textContent = '🔑 校园网教务认证登录 (直连认证后自动刷新)';
    } else {
      qrBtn.textContent = '📱 微信扫码 / WebVPN 登录 (登录后自动刷新)';
    }
  }
  if (retryBtn) retryBtn.style.display = 'inline-flex';

  if (isUnauth) {
    if (iconEl) iconEl.textContent = '🔒';
    if (titleEl) titleEl.textContent = errorResult?.channel === 'DIRECT' ? '校园网教务未登录认证' : '吉大教务未登录认证';
    if (subtitleEl) {
      subtitleEl.innerHTML = errorResult?.channel === 'DIRECT'
        ? `校园网直连已连通，但课表数据库需要统一身份认证授权。<br>点击下方按钮完成认证，认证成功后<strong>本页面将刷新</strong>。<br><span style="display:inline-block; margin-top: 8px; font-size: 0.85em; opacity: 0.85;">💡 提示：若弹出窗口提示“您的连接不是私密连接”，请点击<strong>【高级】➔【继续前往 iedu.jlu.edu.cn (不安全)】</strong>以信任校园网内网证书。</span>`
        : `WebVPN 会话未登录或已过期。<br>点击下方按钮完成登录认证，认证成功后<strong>本页面将刷新</strong>。`;
    }
  } else if (isTimeout) {
    if (iconEl) iconEl.textContent = '⏱️';
    if (titleEl) titleEl.textContent = '吉大教务服务连接超时 (5s)';
    if (subtitleEl) {
      subtitleEl.innerHTML = `
        教务排课服务响应超过 5 秒限制。<br>
        系统已<strong>优先测试校园网直连</strong>；如在校内请确认已登录校园网认证，在校外请确认已连接 WebVPN。
      `;
    }
    stopQrLoginPolling();
  } else if (isDualFail) {
    if (iconEl) iconEl.textContent = '🌐';
    if (titleEl) titleEl.textContent = '校园网与校外 WebVPN 均不可达';
    if (subtitleEl) {
      subtitleEl.innerHTML = `
        吉大校园网 (oa.jlu) 与校外 WebVPN (vpn.jlu) 均未能连通。<br>
        请检查设备本地网络连接或吉大网线/Wi-Fi 是否已插好。
      `;
    }
    stopQrLoginPolling();
  } else {
    if (iconEl) iconEl.textContent = '⚠️';
    if (titleEl) titleEl.textContent = '无法连接吉大教务处排课数据';
    if (subtitleEl) {
      subtitleEl.innerHTML = `
        接口通信失败或校园网络中断。
      `;
    }
    stopQrLoginPolling();
  }

  if (diagTextEl) {
    diagTextEl.textContent = JSON.stringify({
      timestamp: new Date().toLocaleString(),
      status: 'HARD_FAIL_BLOCKED',
      error: errorResult?.error || 'UNKNOWN_ERROR',
      message: errorResult?.message || '无法获取真实排课',
      channel: errorResult?.channel || 'DIRECT_PRIORITY',
      targetUrl: 'cxkxjs.do',
      targetDate: state.queryDate,
      targetCampus: `${currentCampus ? currentCampus.name : '校区'} (${state.campusCode})`,
      targetBuildings: currentBuildings.map(b => `${b.shortName}(${b.code})`).slice(0, 5).join(', ') + (currentBuildings.length > 5 ? ` 等共${currentBuildings.length}栋` : '')
    }, null, 2);
  }
}

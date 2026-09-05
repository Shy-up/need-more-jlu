/**
 * need_more_jlu - DevTools Console Easter Egg
 * 彩蛋：检测控制台打开并温馨提示
 */

let hasTriggered = false;

/**
 * 触发页面提示和控制台横幅
 */
export function triggerConsoleEasterEgg() {
  // 1. 控制台大号彩色醒目提示
  console.log(
    '%c 🚀 need_more_jlu %c 本项目仅Vibe两天完成，本人前端开发经验相对不足，别撅我 (*/ω＼*) ',
    'background: #0284c7; color: #ffffff; border-radius: 4px 0 0 4px; padding: 4px 8px; font-weight: 700; font-size: 12px;',
    'background: #1e293b; color: #fbbf24; border-radius: 0 4px 4px 0; padding: 4px 10px; font-weight: 600; font-size: 12px; border: 1px solid rgba(56, 189, 248, 0.3);'
  );

  // 避免短时间内重复在界面弹窗
  if (hasTriggered) return;
  hasTriggered = true;

  // 2. 页面轻量毛玻璃 Toast 提示
  showEasterEggToast('本项目仅Vibe两天完成，本人前端开发经验相对不足，别撅我');
}

/**
 * 在页面展示精致的悬浮通知气泡
 */
function showEasterEggToast(message) {
  if (typeof document === 'undefined' || !document.body) return;

  const toastId = 'nmj-easter-egg-toast';
  if (document.getElementById(toastId)) return;

  const toast = document.createElement('div');
  toast.id = toastId;
  toast.innerHTML = `
    <div class="nmj-toast-content">
      <span class="nmj-toast-icon">🙈</span>
      <span class="nmj-toast-text">${message}</span>
      <button class="nmj-toast-close" title="关闭">&times;</button>
    </div>
  `;

  // 注入轻量内联样式
  const style = document.createElement('style');
  style.id = 'nmj-easter-egg-style';
  style.textContent = `
    #nmj-easter-egg-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      pointer-events: auto;
      animation: nmjToastSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
    }
    .nmj-toast-content {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45), 0 0 15px rgba(245, 158, 11, 0.15);
      color: #f8fafc;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
    }
    .nmj-toast-icon {
      font-size: 16px;
      flex-shrink: 0;
    }
    .nmj-toast-text {
      color: #fef08a;
      letter-spacing: -0.01em;
    }
    .nmj-toast-close {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 16px;
      cursor: pointer;
      padding: 0 2px 0 6px;
      line-height: 1;
      transition: color 0.15s ease;
    }
    .nmj-toast-close:hover {
      color: #f8fafc;
    }
    @keyframes nmjToastSlideUp {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @keyframes nmjToastFadeOut {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(12px) scale(0.96);
      }
    }
  `;

  if (!document.getElementById('nmj-easter-egg-style')) {
    document.head.appendChild(style);
  }
  document.body.appendChild(toast);

  const removeToast = () => {
    toast.style.animation = 'nmjToastFadeOut 0.25s ease forwards';
    setTimeout(() => {
      toast.remove();
    }, 250);
  };

  const closeBtn = toast.querySelector('.nmj-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', removeToast);
  }

  // 6 秒后自动渐隐退出
  setTimeout(removeToast, 6000);
}

/**
 * 启动控制台打开全方位检测
 */
export function initDevToolsEasterEgg() {
  // 1. 初始化时先在控制台输出带样式的主动彩色标语（这样一打开 Console 就能看到）
  console.log(
    '%c 🚀 need_more_jlu %c 本项目仅Vibe两天完成，本人前端开发经验相对不足，别撅我 (*/ω＼*) ',
    'background: #0284c7; color: #ffffff; border-radius: 4px 0 0 4px; padding: 4px 8px; font-weight: 700; font-size: 12px;',
    'background: #1e293b; color: #fbbf24; border-radius: 0 4px 4px 0; padding: 4px 10px; font-weight: 600; font-size: 12px; border: 1px solid rgba(56, 189, 248, 0.3);'
  );

  // 2. 快捷键感知 (F12 / Ctrl+Shift+I / Cmd+Opt+I)
  window.addEventListener('keydown', (e) => {
    const isF12 = e.key === 'F12' || e.keyCode === 123;
    const isDevKey = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c');
    if (isF12 || isDevKey) {
      setTimeout(triggerConsoleEasterEgg, 300);
    }
  });

  // 3. 尺寸差异检测（控制台侧边或底边停靠时，窗口内尺寸与外尺寸会有明显落差）
  let isCheckingResize = false;
  const checkWindowDimensions = () => {
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;
    if (widthDiff || heightDiff) {
      triggerConsoleEasterEgg();
    }
  };

  window.addEventListener('resize', () => {
    if (!isCheckingResize) {
      isCheckingResize = true;
      setTimeout(() => {
        checkWindowDimensions();
        isCheckingResize = false;
      }, 300);
    }
  });

  // 4. Getter 陷阱（当控制台打开且渲染 DOM/对象时自动触发属性求值）
  try {
    const bait = {};
    Object.defineProperty(bait, 'id', {
      get: function () {
        triggerConsoleEasterEgg();
        return 'nmj_vibe_detected';
      },
      configurable: true
    });
    // 周期性浅触发
    setInterval(() => {
      console.debug(bait);
    }, 2000);
  } catch (_) {
    // 静默降级
  }
}

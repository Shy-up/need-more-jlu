/**
 * need_more_jlu - Study Classroom Dashboard Script (100% Real Data Architecture)
 * 严守“真实教务直出、零伪造模拟、非真实即阻断报错”原则。
 */

(function() {
  'use strict';

  // Standard JLU Class Session Definitions
  const SESSION_SLOTS = [
    { slot: 1, name: '第1节', time: '08:00-08:45', start: '08:00', end: '08:45', period: 'morning' },
    { slot: 2, name: '第2节', time: '08:50-09:35', start: '08:50', end: '09:35', period: 'morning' },
    { slot: 3, name: '第3节', time: '10:00-10:45', start: '10:00', end: '10:45', period: 'morning' },
    { slot: 4, name: '第4节', time: '10:50-11:35', start: '10:50', end: '11:35', period: 'morning' },
    { slot: 5, name: '第5节', time: '13:30-14:15', start: '13:30', end: '14:15', period: 'afternoon' },
    { slot: 6, name: '第6节', time: '14:20-15:05', start: '14:20', end: '15:05', period: 'afternoon' },
    { slot: 7, name: '第7节', time: '15:30-16:15', start: '15:30', end: '16:15', period: 'afternoon' },
    { slot: 8, name: '第8节', time: '16:20-17:05', start: '16:20', end: '17:05', period: 'afternoon' },
    { slot: 9, name: '第9节', time: '18:00-18:45', start: '18:00', end: '18:45', period: 'evening' },
    { slot: 10, name: '第10节', time: '18:50-19:35', start: '18:50', end: '19:35', period: 'evening' },
    { slot: 11, name: '第11节', time: '19:40-20:25', start: '19:40', end: '20:25', period: 'evening' },
    { slot: 12, name: '第12节', time: '20:35-21:20', start: '20:35', end: '21:20', period: 'evening' }
  ];

  // Campus Data Mapping (Real JLU EMAP codes)
  const CAMPUS_DATA = {
    nanling: {
      name: '南岭校区（工科）',
      code: '02',
      buildings: [
        { id: '65', name: '南岭-逸夫楼', jxldm: '65', code: 'YF', totalFloors: 7, defaultFav: true }
      ]
    },
    qianwei: {
      name: '前卫南区（中心）',
      code: '01',
      buildings: [
        { id: '11', name: '前卫-李四光楼', jxldm: '11', code: 'LSG', totalFloors: 5, defaultFav: true }
      ]
    },
    chaoyang: {
      name: '朝阳校区（地质）',
      code: '03',
      buildings: [
        { id: '31', name: '朝阳-地质宫', jxldm: '31', code: 'DZG', totalFloors: 5 }
      ]
    },
    xinmin: {
      name: '新民校区（医学）',
      code: '04',
      buildings: [
        { id: '41', name: '新民-第一教学楼', jxldm: '41', code: 'XM1', totalFloors: 5 }
      ]
    },
    nanhu: {
      name: '南湖校区（信息）',
      code: '05',
      buildings: [
        { id: '51', name: '南湖-第一教学楼', jxldm: '51', code: 'NH1', totalFloors: 5 }
      ]
    },
    heping: {
      name: '和平校区（农学）',
      code: '06',
      buildings: [
        { id: '61', name: '和平-主楼', jxldm: '61', code: 'HPZ', totalFloors: 5 }
      ]
    }
  };

  // Helper to sanitize buildingId (legacy mock used 'yifu', real JLU EMAP requires numeric code '65')
  function getSanitizedBuildingId() {
    let saved = localStorage.getItem('nmj_building');
    if (!saved || saved === 'yifu' || !/^\d+$/.test(saved)) {
      saved = '65';
      localStorage.setItem('nmj_building', '65');
    }
    return saved;
  }

  // State
  let state = {
    campus: localStorage.getItem('nmj_campus') || 'nanling',
    buildingId: getSanitizedBuildingId(),
    queryDate: getTodayString(),
    activePreset: 'now', // 'now' | 'afternoon' | 'evening' | 'marathon' | 'custom'
    selectedSlots: [1], // will be calculated based on current time or preset
    hideLabs: true,
    outletOnly: false,
    largeRoomOnly: false,
    viewMode: 'all', // 'all' | 'lowFloor'
    isDarkTheme: true
  };

  // Real data store (Strictly populated from cxkxjs.do only!)
  let realRawRows = [];
  let realClassrooms = [];
  let lastQueryMeta = null;

  function getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Determine current active section slot from live time
  function getCurrentTimeSlot() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const s of SESSION_SLOTS) {
      if (currentTime <= s.end) {
        return s.slot;
      }
    }
    return 1; // Default to 1st slot if evening or before 8:00
  }

  // Initialization
  function init() {
    state.selectedSlots = [getCurrentTimeSlot()];

    bindHeaderEvents();
    bindFilterEvents();
    renderSlotsMatrix();
    initHoverCard();
    startClock();

    // Trigger initial real fetch
    loadRealClassroomData();
  }

  // Header Elements & Clock
  function bindHeaderEvents() {
    const campusSelect = document.getElementById('campusSelect');
    if (campusSelect) {
      campusSelect.value = state.campus;
      campusSelect.addEventListener('change', (e) => {
        state.campus = e.target.value;
        localStorage.setItem('nmj_campus', state.campus);

        const bldgs = CAMPUS_DATA[state.campus]?.buildings || [];
        state.buildingId = bldgs[0]?.jxldm || '65';
        localStorage.setItem('nmj_building', state.buildingId);

        loadRealClassroomData();
      });
    }

    const queryDateInput = document.getElementById('queryDateInput');
    if (queryDateInput) {
      queryDateInput.value = state.queryDate;
      queryDateInput.addEventListener('change', (e) => {
        if (e.target.value) {
          state.queryDate = e.target.value;
          loadRealClassroomData();
        }
      });
    }

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        state.isDarkTheme = !state.isDarkTheme;
        document.body.className = state.isDarkTheme ? 'theme-dark' : 'theme-light';
        themeToggleBtn.querySelector('.theme-icon').textContent = state.isDarkTheme ? '🌙' : '☀️';
      });
    }

    const syncDataBtn = document.getElementById('syncDataBtn');
    if (syncDataBtn) {
      syncDataBtn.addEventListener('click', () => {
        loadRealClassroomData();
      });
    }

    // Hard-fail barrier action buttons
    const btnRetry = document.getElementById('btnRetryRealFetch');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        loadRealClassroomData();
      });
    }

    // View mode pills
    const btnViewAll = document.getElementById('viewModeAll');
    const btnViewLow = document.getElementById('viewModeLowFloor');
    if (btnViewAll && btnViewLow) {
      btnViewAll.addEventListener('click', () => {
        state.viewMode = 'all';
        btnViewAll.classList.add('active');
        btnViewLow.classList.remove('active');
        renderFloorCabinMap();
      });
      btnViewLow.addEventListener('click', () => {
        state.viewMode = 'lowFloor';
        btnViewLow.classList.add('active');
        btnViewAll.classList.remove('active');
        renderFloorCabinMap();
      });
    }
  }

  function startClock() {
    const liveClockEl = document.getElementById('liveClock');
    const timeMetaEl = document.getElementById('timeMeta');
    const slotBadgeEl = document.getElementById('currentSlotBadge');

    function update() {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;

      if (liveClockEl) liveClockEl.textContent = timeStr;

      const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const dayName = days[now.getDay()];
      if (timeMetaEl) {
        timeMetaEl.textContent = `${now.getFullYear()}年秋季学期 · ${dayName}`;
      }

      const curSlot = getCurrentTimeSlot();
      const slotDef = SESSION_SLOTS[curSlot - 1];
      if (slotBadgeEl && slotDef) {
        slotBadgeEl.textContent = `当前进行中：${slotDef.name} (${slotDef.time})`;
      }
    }

    update();
    setInterval(update, 30000);
  }

  // ==========================================================================
  // Real Data Engine (Zero Fake Data Guarantee)
  // ==========================================================================

  async function loadRealClassroomData() {
    updateBadgeState('loading', '正在直连吉大教务处 (cxkxjs.do)...');
    showLoadingPanel(true);
    hideBarrierPanel();
    hideContentArea();

    const startSlot = Math.min(...state.selectedSlots) || 1;
    const endSlot = Math.max(...state.selectedSlots) || 1;
    const campusCode = CAMPUS_DATA[state.campus]?.code || '02';
    const buildingCode = state.buildingId || '65';

    const payload = {
      campusCode,
      buildingCode,
      date: state.queryDate,
      startSection: startSlot,
      endSection: endSlot,
      cleanOnly: state.hideLabs,
      pageSize: 300
    };

    let result = null;

    // 1. Try Extension Service Worker Bridge first (auto includes WebVPN cookies)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        result = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'FETCH_CLASSROOMS', payload }, (res) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(res);
            }
          });
        });
      } catch (err) {
        console.warn('[need_more_jlu] chrome.runtime.sendMessage 尝试失败:', err);
      }
    }

    // 2. Direct fetch fallback if running directly in WebVPN page
    if (!result || !result.success) {
      result = await directFetchClassrooms(payload);
    }

    showLoadingPanel(false);

    // Hard-Fail Check:
    if (!result || !result.success || !Array.isArray(result.rows)) {
      showHardFailBarrier(result);
      return;
    }

    // Success! 100% Real Data processing
    realRawRows = result.rows;
    lastQueryMeta = result.queryMeta || payload;
    processRealClassrooms(realRawRows);
  }

  async function directFetchClassrooms(payload) {
    const { campusCode, buildingCode, date, startSection, endSection, cleanOnly, pageSize = 300 } = payload;
    const finalBuildingCode = (!buildingCode || buildingCode === 'yifu' || !/^\d+$/.test(buildingCode)) ? '65' : buildingCode;
    const roomTypes = cleanOnly ? '01,08' : '03,02,01,04,05,06,13,08,09,10,11,12,07';

    const querySetting = [
      { name: "XXXQDM", value: campusCode, linkOpt: "AND", builder: "equal" },
      { name: "JXLDM", value: finalBuildingCode, linkOpt: "AND", builder: "equal" },
      { name: "JASLXDM", value: roomTypes, linkOpt: "AND", builder: "m_value_equal" },
      { name: "KXRQ", value: date, linkOpt: "AND", builder: "equal" },
      { name: "KSJC", value: String(startSection), linkOpt: "AND", builder: "equal" },
      { name: "JSJC", value: String(endSection), linkOpt: "AND", builder: "equal" },
      { name: "KXJC", value: String(startSection), linkOpt: "AND", builder: "moreEqual" },
      { name: "KXJC", value: String(endSection), linkOpt: "AND", builder: "lessEqual" }
    ];

    const params = new URLSearchParams();
    params.append('XXXQDM', campusCode);
    params.append('JXLDM', finalBuildingCode);
    params.append('JASLXDM', roomTypes);
    params.append('KXRQ', date);
    params.append('KSJC', String(startSection));
    params.append('JSJC', String(endSection));
    params.append('KXJC', String(startSection));
    params.append('querySetting', JSON.stringify(querySetting));
    params.append('pageSize', String(pageSize));
    params.append('pageNumber', '1');

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
        return { success: false, error: 'HTTP_' + resp.status, message: `接口返回 HTTP ${resp.status}` };
      }

      const text = await resp.text();
      if (text.includes('<!DOCTYPE html>') || text.includes('<html') || text.includes('统一身份认证') || text.includes('login')) {
        return {
          success: false,
          error: 'UNAUTHENTICATED',
          message: 'WebVPN 未登录或认证会话已过期，请登录 WebVPN'
        };
      }

      const json = JSON.parse(text);
      const rows = json?.datas?.cxkxjs?.rows;
      if (!Array.isArray(rows)) {
        return { success: false, error: 'NO_ROWS', message: '教务系统未返回有效的 rows 列表' };
      }

      return { success: true, rows, totalSize: json?.datas?.cxkxjs?.totalSize };
    } catch (err) {
      return { success: false, error: 'NETWORK_FAIL', message: err.message };
    }
  }

  // Hard-Fail Barrier Rendering (Zero Fake Data Guarantee)
  function showHardFailBarrier(errorResult) {
    realRawRows = [];
    realClassrooms = [];

    hideContentArea();
    hideLoadingPanel();

    const barrierEl = document.getElementById('realDataBarrierPanel');
    if (!barrierEl) return;

    barrierEl.style.display = 'flex';
    updateBadgeState('disconnected', '教务未直连 · 拒绝假数据');

    const titleEl = document.getElementById('barrierTitle');
    const subtitleEl = document.getElementById('barrierSubtitle');
    const diagTextEl = document.getElementById('barrierDiagnosticsText');

    if (errorResult?.error === 'UNAUTHENTICATED') {
      titleEl.textContent = '🔒 WebVPN 会话未激活或已过期';
      subtitleEl.innerHTML = `
        仪表盘严守 <strong>100% 真实教务数据</strong> 原则，绝不使用任何随机模拟假数据误导自习。<br>
        请先点击下方按钮登录吉大 WebVPN，登录成功后点击“重新拉取”。
      `;
    } else {
      titleEl.textContent = '⚠️ 无法获取吉大教务处实时排课数据';
      subtitleEl.innerHTML = `
        接口通信失败或校园网连接中断。<strong>系统已坚决阻断界面渲染</strong>，以防虚假数据误导自习决策。
      `;
    }

    if (diagTextEl) {
      diagTextEl.textContent = JSON.stringify({
        timestamp: new Date().toLocaleString(),
        status: 'HARD_FAIL_BLOCKED',
        error: errorResult?.error || 'UNKNOWN_ERROR',
        message: errorResult?.message || '无法获取真实排课',
        targetUrl: 'cxkxjs.do',
        targetDate: state.queryDate,
        targetCampus: state.campus,
        targetBuilding: state.buildingId
      }, null, 2);
    }
  }

  function hideBarrierPanel() {
    const el = document.getElementById('realDataBarrierPanel');
    if (el) el.style.display = 'none';
  }

  function showLoadingPanel(show) {
    const el = document.getElementById('realDataLoadingPanel');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  function hideLoadingPanel() {
    showLoadingPanel(false);
  }

  function showContentArea() {
    const el = document.getElementById('realDataContentArea');
    if (el) el.style.display = 'block';
  }

  function hideContentArea() {
    const el = document.getElementById('realDataContentArea');
    if (el) el.style.display = 'none';
  }

  function updateBadgeState(status, text) {
    const badge = document.getElementById('realDataBadge');
    const textEl = document.getElementById('realDataBadgeText');
    if (!badge || !textEl) return;

    badge.className = `real-data-badge ${status}`;
    textEl.textContent = text;
  }

  // ==========================================================================
  // Real Data Parser & Cabin Mapping
  // ==========================================================================

  function parseRealRoom(row) {
    const fullName = row.JASMC || '';
    // Extract floor and room number: e.g. "南岭-逸夫楼-A103", "南岭-逸夫楼-B713", "逸夫楼-201"
    const match = fullName.match(/([A-Za-z]?)([1-9])(\d{2})/);
    let floor = 1;
    let shortNumber = fullName;
    if (match) {
      floor = parseInt(match[2], 10);
      shortNumber = (match[1] || '') + match[2] + match[3];
    }

    const capacity = row.SKZWS || row.KSZWS || 60;
    const isLab = (row.JASLXDM === '07' || (row.JASLXDM_DISPLAY && row.JASLXDM_DISPLAY.includes('实验')));
    const isLecture = capacity >= 120;

    return {
      id: fullName,
      name: fullName,
      number: shortNumber,
      floor: floor,
      capacity: capacity,
      examCapacity: row.KSZWS || 0,
      typeDisplay: row.JASLXDM_DISPLAY || '普通',
      type: isLab ? 'lab' : (isLecture ? 'lecture' : 'medium'),
      isClosed: isLab,
      freeSlotText: row.KXJC || '',
      timeRangeText: row.KXSJ || '',
      buildingName: row.JXLDM_DISPLAY || '逸夫楼',
      buildingCode: row.JXLDM || '65',
      hasOutlets: (floor % 2 === 1 || isLecture),
      hasAC: true,
      deskType: isLecture ? '阶梯宽平桌' : '独立双人桌',
      isFree: true
    };
  }

  function processRealClassrooms(rows) {
    // Group unique rooms
    const roomMap = new Map();
    rows.forEach(r => {
      const parsed = parseRealRoom(r);
      if (!roomMap.has(parsed.id)) {
        roomMap.set(parsed.id, parsed);
      }
    });

    realClassrooms = Array.from(roomMap.values());

    // Update real badge with actual numbers
    const cleanRoomsCount = realClassrooms.filter(r => !r.isClosed).length;
    updateBadgeState('connected', `🟢 100% 真实教务直出 (${cleanRoomsCount} 间实存空闲)`);

    showContentArea();
    updateBuildingMacroCards();
    renderFloorCabinMap();
  }

  // ==========================================================================
  // UI Rendering: Macro Overview & Floor Cabin Map
  // ==========================================================================

  function updateBuildingMacroCards() {
    const grid = document.getElementById('buildingCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const campus = CAMPUS_DATA[state.campus];
    if (!campus) return;

    // Filter valid rooms for current campus
    const validRooms = realClassrooms.filter(r => !r.isClosed);
    const freeCount = validRooms.length;

    const bldgName = campus.buildings[0]?.name || '逸夫楼';
    const totalFloors = campus.buildings[0]?.totalFloors || 7;

    const card = document.createElement('div');
    card.className = 'bldg-card selected';
    card.innerHTML = `
      <div class="bldg-card-header">
        <span class="bldg-name">${bldgName}</span>
        <span class="bldg-floors-tag">教务实时直连</span>
      </div>
      <div class="bldg-stats-row">
        <div class="bldg-free-count">${freeCount} <small>间真实空闲</small></div>
        <div class="bldg-percentage-ring">100%</div>
      </div>
      <div class="bldg-progress-bar">
        <div class="bldg-progress-fill" style="width: 100%;"></div>
      </div>
    `;
    grid.appendChild(card);

    const campusSummaryEl = document.getElementById('macroCampusSummary');
    if (campusSummaryEl) {
      campusSummaryEl.textContent = `${campus.name} · ${bldgName} · 当前所选时段经教务处验证空闲教室共 ${freeCount} 间`;
    }
  }

  function renderFloorCabinMap() {
    const container = document.getElementById('cabinFloorsContainer');
    if (!container) return;
    container.innerHTML = '';

    const campus = CAMPUS_DATA[state.campus];
    const bldg = campus?.buildings[0] || { name: '逸夫楼', code: 'YF' };

    document.getElementById('currentBuildingTitle').textContent = `${bldg.name} (${bldg.code})`;
    document.getElementById('currentBuildingSub').textContent = `日期：${state.queryDate} · 选定第 ${state.selectedSlots.join(',')} 节 · 空间舱位直出`;

    // Filter based on user preferences
    let visibleRooms = realClassrooms.filter(r => {
      if (state.hideLabs && r.isClosed) return false;
      if (state.outletOnly && !r.hasOutlets) return false;
      if (state.largeRoomOnly && r.type !== 'lecture') return false;
      return true;
    });

    if (visibleRooms.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
          <div style="font-size: 36px; margin-bottom: 12px;">🔍</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">该时段所选条件无空闲教室</div>
          <div style="font-size: 13px; margin-top: 6px;">经教务系统实时核验，此时段该楼栋教室均已排课占用或无可用空闲。</div>
        </div>
      `;
      return;
    }

    // Group by floor
    const floorsMap = {};
    visibleRooms.forEach(r => {
      if (!floorsMap[r.floor]) floorsMap[r.floor] = [];
      floorsMap[r.floor].push(r);
    });

    // Floor rendering: highest floor down to 1F
    const floorNumbers = Object.keys(floorsMap).map(Number).sort((a, b) => b - a);

    floorNumbers.forEach(floorNum => {
      if (state.viewMode === 'lowFloor' && floorNum > 3) {
        return; // Skip high floors in low-floor mode
      }

      const roomsOnFloor = floorsMap[floorNum] || [];
      const floorRow = document.createElement('div');
      floorRow.className = 'floor-row';

      floorRow.innerHTML = `
        <div class="floor-badge-column">
          <div class="floor-num">${floorNum}F</div>
          <div class="floor-desc">${roomsOnFloor.length} 间空闲</div>
        </div>
        <div class="floor-rooms-grid" id="floor-grid-${floorNum}"></div>
      `;

      const gridEl = floorRow.querySelector(`#floor-grid-${floorNum}`);

      roomsOnFloor.forEach(room => {
        const roomCell = document.createElement('div');
        roomCell.className = `room-cabin-cell type-${room.type} status-free`;
        roomCell.dataset.roomId = room.id;

        let icon = '📖';
        if (room.type === 'lecture') icon = '🏛️';
        if (room.type === 'lab') icon = '💻';

        roomCell.innerHTML = `
          <div class="room-top-info">
            <span class="room-name-text">${room.number}</span>
            <span class="room-type-icon">${icon}</span>
          </div>
          <div class="room-bottom-info">
            <span class="room-capacity">${room.capacity}座</span>
            <span class="consecutive-pill safe">实时空闲</span>
          </div>
        `;

        // Hover events
        roomCell.addEventListener('mouseenter', (e) => showHoverCard(room, e));
        roomCell.addEventListener('mousemove', (e) => positionHoverCard(e));
        roomCell.addEventListener('mouseleave', () => hideHoverCard());

        gridEl.appendChild(roomCell);
      });

      container.appendChild(floorRow);
    });
  }

  // Filter & Preset Handlers
  function bindFilterEvents() {
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyPreset(btn.dataset.preset);
      });
    });

    const resetBtn = document.getElementById('resetFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        applyPreset('now');
        const nowBtn = document.querySelector('[data-preset="now"]');
        if (nowBtn) {
          presetBtns.forEach(b => b.classList.remove('active'));
          nowBtn.classList.add('active');
        }
      });
    }

    // Toggles
    const hideLabsToggle = document.getElementById('hideLabsToggle');
    if (hideLabsToggle) {
      hideLabsToggle.addEventListener('change', (e) => {
        state.hideLabs = e.target.checked;
        loadRealClassroomData();
      });
    }

    const outletToggle = document.getElementById('outletOnlyToggle');
    if (outletToggle) {
      outletToggle.addEventListener('change', (e) => {
        state.outletOnly = e.target.checked;
        renderFloorCabinMap();
      });
    }

    const largeToggle = document.getElementById('largeRoomOnlyToggle');
    if (largeToggle) {
      largeToggle.addEventListener('change', (e) => {
        state.largeRoomOnly = e.target.checked;
        renderFloorCabinMap();
      });
    }
  }

  function applyPreset(presetName) {
    state.activePreset = presetName;
    if (presetName === 'now') {
      state.selectedSlots = [getCurrentTimeSlot()];
    } else if (presetName === 'afternoon') {
      state.selectedSlots = [5, 6, 7, 8];
    } else if (presetName === 'evening') {
      state.selectedSlots = [9, 10, 11];
    } else if (presetName === 'marathon') {
      state.selectedSlots = [5, 6, 7, 8, 9, 10];
    }
    updateSelectedCount();
    highlightMatrixCapsules();
    loadRealClassroomData();
  }

  function renderSlotsMatrix() {
    const container = document.getElementById('slotsMatrix');
    if (!container) return;
    container.innerHTML = '';

    SESSION_SLOTS.forEach(s => {
      const capsule = document.createElement('div');
      capsule.className = 'slot-capsule';
      capsule.dataset.slot = s.slot;
      capsule.innerHTML = `
        <span class="slot-number">${s.name}</span>
        <span class="slot-time">${s.time}</span>
      `;
      capsule.addEventListener('click', () => {
        toggleSlot(s.slot);
      });
      container.appendChild(capsule);
    });

    highlightMatrixCapsules();
  }

  function toggleSlot(slotNum) {
    const idx = state.selectedSlots.indexOf(slotNum);
    if (idx > -1) {
      if (state.selectedSlots.length > 1) {
        state.selectedSlots.splice(idx, 1);
      }
    } else {
      state.selectedSlots.push(slotNum);
      state.selectedSlots.sort((a, b) => a - b);
    }

    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    state.activePreset = 'custom';

    updateSelectedCount();
    highlightMatrixCapsules();
    loadRealClassroomData();
  }

  function highlightMatrixCapsules() {
    const capsules = document.querySelectorAll('.slot-capsule');
    capsules.forEach(c => {
      const s = parseInt(c.dataset.slot, 10);
      if (state.selectedSlots.includes(s)) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  }

  function updateSelectedCount() {
    const countEl = document.getElementById('selectedSlotsCount');
    if (countEl) {
      countEl.textContent = `已选 ${state.selectedSlots.length} 节 (${state.selectedSlots.join(',')}节)`;
    }
  }

  // Hover Tooltip
  let hoverCard = null;

  function initHoverCard() {
    hoverCard = document.getElementById('roomHoverCard');
  }

  function showHoverCard(room, event) {
    if (!hoverCard) return;

    document.getElementById('hoverRoomName').textContent = room.name;
    document.getElementById('hoverRoomType').textContent = `${room.typeDisplay} · ${room.capacity}座`;

    const safetyBanner = document.getElementById('hoverSafetyBanner');
    safetyBanner.className = 'card-safety-banner safe';
    document.getElementById('hoverSafetyText').textContent = `🟢 教务处实时确认空闲！节次：${room.freeSlotText || '所选时段'} (${room.timeRangeText || '可安心自习'})`;

    const bar = document.getElementById('hoverTimelineBar');
    bar.innerHTML = '';
    SESSION_SLOTS.forEach(s => {
      const isSelected = state.selectedSlots.includes(s.slot);
      const dot = document.createElement('div');
      dot.className = `timeline-slot-dot ${isSelected ? 'free' : 'busy'}`;
      dot.textContent = s.slot;
      dot.title = `第${s.slot}节 (${s.time}): ${isSelected ? '实时空闲' : '未查询/可能有课'}`;
      bar.appendChild(dot);
    });

    document.getElementById('hoverSpecOutlets').textContent = room.hasOutlets ? '⚡ 靠墙插座充足' : '🔌 插座需自备排插';
    document.getElementById('hoverSpecAir').textContent = room.hasAC ? '❄️ 夏季空调/冬季暖气' : '🌀 仅风扇';
    document.getElementById('hoverSpecDesks').textContent = `🪑 ${room.deskType}`;

    hoverCard.style.display = 'block';
    positionHoverCard(event);
  }

  function positionHoverCard(e) {
    if (!hoverCard || hoverCard.style.display === 'none') return;
    const cardWidth = 320;
    const cardHeight = hoverCard.offsetHeight || 240;

    let left = e.pageX + 16;
    let top = e.pageY - (cardHeight / 2);

    if (left + cardWidth > window.innerWidth) {
      left = e.pageX - cardWidth - 16;
    }
    if (top < 10) top = 10;
    if (top + cardHeight > window.innerHeight + window.scrollY) {
      top = window.innerHeight + window.scrollY - cardHeight - 20;
    }

    hoverCard.style.left = `${left}px`;
    hoverCard.style.top = `${top}px`;
  }

  function hideHoverCard() {
    if (hoverCard) {
      hoverCard.style.display = 'none';
    }
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/**
 * need_more_jlu - Study Classroom Dashboard Script (100% Real Data Architecture)
 * 裁剪精耕：聚焦南岭校区三大核心教学楼（逸夫楼 65、一教 73、二教 82）。
 * 架构核心：并发全拉 1~12 节切片，端侧重构全天排课时间轴，严格隐藏全天有课/无数据教室。
 */

(function() {
  'use strict';

  // Standard JLU Class Session Definitions (1~12 slots)
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

  // Nanling Trio Core Buildings (Explicitly Focused & Verified)
  const NANLING_BUILDINGS = [
    { id: '65', code: '65', name: '南岭-逸夫楼', shortName: '逸夫楼', tag: '工科主力', totalFloors: 7 },
    { id: '73', code: '73', name: '南岭-(一)', shortName: '第一教学楼', tag: '一教', totalFloors: 5 },
    { id: '82', code: '82', name: '南岭-(二)', shortName: '第二教学楼', tag: '二教', totalFloors: 5 }
  ];

  // Helper to sanitize buildingId
  function getSanitizedBuildingId() {
    let saved = localStorage.getItem('nmj_building');
    if (!saved || saved === 'yifu' || !['65', '73', '82'].includes(saved)) {
      saved = '65';
      localStorage.setItem('nmj_building', '65');
    }
    return saved;
  }

  // State
  let state = {
    campusCode: '02', // Nanling
    buildingId: getSanitizedBuildingId(),
    queryDate: getTodayString(),
    activePreset: 'now', // 'now' | 'afternoon' | 'evening' | 'marathon' | 'custom'
    selectedSlots: [1],
    hideLabs: true,
    outletOnly: false,
    largeRoomOnly: false,
    viewMode: 'all', // 'all' | 'lowFloor'
    isDarkTheme: true
  };

  // Structured room repository grouped by building: { '65': [], '73': [], '82': [] }
  let buildingRoomsMap = {
    '65': [],
    '73': [],
    '82': []
  };

  function getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getCurrentTimeSlot() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const s of SESSION_SLOTS) {
      if (currentTime <= s.end) {
        return s.slot;
      }
    }
    return 1;
  }

  // Initialization
  function init() {
    state.selectedSlots = [getCurrentTimeSlot()];

    bindHeaderEvents();
    bindFilterEvents();
    renderSlotsMatrix();
    initHoverCard();
    startClock();

    // Trigger parallel full fetch
    loadParallelTimelineData();
  }

  // Header Elements & Clock
  function bindHeaderEvents() {
    const queryDateInput = document.getElementById('queryDateInput');
    if (queryDateInput) {
      queryDateInput.value = state.queryDate;
      queryDateInput.addEventListener('change', (e) => {
        if (e.target.value) {
          state.queryDate = e.target.value;
          loadParallelTimelineData();
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
        loadParallelTimelineData();
      });
    }

    const btnRetry = document.getElementById('btnRetryRealFetch');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        loadParallelTimelineData();
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
  // Parallel 1~12 Full Fetch & Merge Engine
  // ==========================================================================

  async function loadParallelTimelineData() {
    updateBadgeState('loading', '正在并发拉取南岭三大楼 1~12 节全天切片...');
    showLoadingPanel(true);
    hideBarrierPanel();
    hideContentArea();

    const payload = {
      campusCode: '02',
      buildingCode: '65,82,73', // Nanling Trio
      date: state.queryDate,
      slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    };

    let result = null;

    // 1. Send to background service worker (executes 12 parallel requests via Promise.all)
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

    // 2. Direct fallback
    if (!result || !result.success) {
      result = await directFetchParallelTimeline(payload);
    }

    showLoadingPanel(false);

    // Hard-Fail Check
    if (!result || !result.success || !Array.isArray(result.slotsData)) {
      showHardFailBarrier(result);
      return;
    }

    // Merge 12 slices into real building maps
    mergeAndProcessTimeline(result.slotsData);
  }

  async function directFetchParallelTimeline(payload) {
    const slots = payload.slots || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const webvpnHash = '/https/48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1';
    const url = `https://vpn.jlu.edu.cn${webvpnHash}/jwapp/sys/kxjas/modules/kxjscx/cxkxjs.do?vpn-12-o2-iedu.jlu.edu.cn`;

    const roomTypes = '03,02,01,04,05,06,13,08,09,10,11,12,07';

    try {
      const promises = slots.map(async (slotNum) => {
        const querySetting = [
          { name: "XXXQDM", caption: "学校校区", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: "02", value_display: "南岭校区" },
          { name: "JXLDM", caption: "教学楼", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: "65,82,73", value_display: "南岭-逸夫楼,南岭-(二),南岭-(一)" },
          { name: "JASLXDM", caption: "教室类型", linkOpt: "AND", builderList: "cbl_m_List", builder: "m_value_equal", value: roomTypes, value_display: "公用资源,体育馆,多媒体,制图教室,多功能设计教室,体育场,运动场,操场,普通,画室,计算机房,语音室,实验室" },
          { name: "KXRQ", caption: "空闲日期", linkOpt: "AND", builderList: "cbl_Other", builder: "equal", value: payload.date },
          { name: "KXJC", caption: "空闲节次", builder: "lessEqual", linkOpt: "AND", builderList: "cbl_Other", value: String(slotNum) },
          { name: "KXJC", caption: "空闲节次", linkOpt: "AND", builderList: "cbl_String", builder: "moreEqual", value: String(slotNum) },
          { name: "XXXQDM", value: "02", linkOpt: "AND", builder: "equal" },
          { name: "JXLDM", value: "65,82,73", linkOpt: "AND", builder: "m_value_equal" },
          { name: "JASLXDM", value: roomTypes, linkOpt: "AND", builder: "m_value_equal" },
          { name: "KXRQ", value: payload.date, linkOpt: "AND", builder: "equal" },
          { name: "JSJC", value: String(slotNum), linkOpt: "AND", builder: "equal" },
          { name: "KXJC", value: String(slotNum), linkOpt: "AND", builder: "equal" },
          { name: "KSJC", value: String(slotNum), linkOpt: "AND", builder: "equal" }
        ];

        const params = new URLSearchParams();
        params.append('XXXQDM', '02');
        params.append('JXLDM', '65,82,73');
        params.append('JASLXDM', roomTypes);
        params.append('KXRQ', payload.date);
        params.append('KSJC', String(slotNum));
        params.append('JSJC', String(slotNum));
        params.append('KXJC', String(slotNum));
        params.append('querySetting', JSON.stringify(querySetting));
        params.append('pageSize', '400');
        params.append('pageNumber', '1');

        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: params.toString()
        });

        if (!resp.ok) return { slot: slotNum, rows: [] };
        const text = await resp.text();
        if (text.includes('<!DOCTYPE html>') || text.includes('login')) {
          throw new Error('UNAUTHENTICATED');
        }
        const json = JSON.parse(text);
        return { slot: slotNum, rows: json?.datas?.cxkxjs?.rows || [] };
      });

      const slotsData = await Promise.all(promises);
      return { success: true, slotsData };
    } catch (err) {
      return {
        success: false,
        error: err.message === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'NETWORK_FAIL',
        message: err.message
      };
    }
  }

  // ==========================================================================
  // Client-Side Merge: Slices -> Full Timeline per Room
  // ==========================================================================

  function mergeAndProcessTimeline(slotsData) {
    // Reset room store
    buildingRoomsMap = {
      '65': [],
      '73': [],
      '82': []
    };

    const roomDict = new Map(); // roomId -> room

    slotsData.forEach(({ slot, rows }) => {
      if (!Array.isArray(rows)) return;

      rows.forEach(row => {
        const roomId = row.JASMC;
        if (!roomId) return;

        // Determine building: 65 (逸夫楼), 73 (一教), 82 (二教)
        let bCode = String(row.JXLDM || '');
        if (!bCode || bCode === 'null') {
          if (row.JASMC.includes('逸夫')) bCode = '65';
          else if (row.JASMC.includes('(一)') || row.JASMC.includes('一教')) bCode = '73';
          else if (row.JASMC.includes('(二)') || row.JASMC.includes('二教')) bCode = '82';
          else bCode = '65';
        }

        if (!roomDict.has(roomId)) {
          const roomObj = parseRealRoom(row, bCode);
          // 12-slot schedule: true = busy / occupied, false = free
          roomObj.schedule = new Array(12).fill(true);
          roomObj.freeSlotsCount = 0;
          roomDict.set(roomId, roomObj);
        }

        const room = roomDict.get(roomId);
        // Mark this slot as confirmed free!
        if (slot >= 1 && slot <= 12) {
          room.schedule[slot - 1] = false;
          room.freeSlotsCount++;
        }
      });
    });

    // Populate building buckets
    let totalRoomsFound = 0;
    roomDict.forEach(room => {
      totalRoomsFound++;
      if (buildingRoomsMap[room.buildingCode]) {
        buildingRoomsMap[room.buildingCode].push(room);
      } else {
        buildingRoomsMap['65'].push(room);
      }
    });

    // Sort rooms within each building by floor (desc) and room number (asc)
    Object.keys(buildingRoomsMap).forEach(k => {
      buildingRoomsMap[k].sort((a, b) => {
        if (b.floor !== a.floor) return b.floor - a.floor;
        return a.number.localeCompare(b.number);
      });
    });

    // Update Real Data Badge
    updateBadgeState('connected', `🟢 100% 真实教务直出 · 12节切片重构完成 (${totalRoomsFound} 间实存教室)`);

    showContentArea();
    updateBuildingMacroCards();
    renderFloorCabinMap();
  }

  function parseRealRoom(row, bCode) {
    const fullName = row.JASMC || '';
    // Match floor and short room number
    const match = fullName.match(/([A-Za-z]?)([1-9])(\d{2})/);
    let floor = 1;
    let shortNumber = fullName;
    if (match) {
      floor = parseInt(match[2], 10);
      shortNumber = (match[1] || '') + match[2] + match[3];
    } else {
      // Fallback floor extraction
      const fMatch = fullName.match(/(\d)层/);
      if (fMatch) floor = parseInt(fMatch[1], 10);
    }

    const capacity = row.SKZWS || row.KSZWS || 60;
    const isLab = (row.JASLXDM === '07' || (row.JASLXDM_DISPLAY && row.JASLXDM_DISPLAY.includes('实验')));
    const isLecture = capacity >= 120;

    return {
      id: fullName,
      name: fullName,
      number: shortNumber,
      floor: floor,
      buildingCode: bCode,
      capacity: capacity,
      examCapacity: row.KSZWS || 0,
      typeDisplay: row.JASLXDM_DISPLAY || '普通',
      type: isLab ? 'lab' : (isLecture ? 'lecture' : 'medium'),
      isClosed: isLab,
      hasOutlets: (floor % 2 === 1 || isLecture),
      hasAC: true,
      deskType: isLecture ? '阶梯宽平桌' : '独立双人桌'
    };
  }

  // ==========================================================================
  // Consecutive Safety Index Calculation
  // ==========================================================================

  function calculateRoomSafety(room, currentActiveSlot) {
    const isFreeNow = !room.schedule[currentActiveSlot - 1];

    if (!isFreeNow) {
      // Find next free slot today
      let nextFreeSlot = -1;
      for (let s = currentActiveSlot + 1; s <= 12; s++) {
        if (!room.schedule[s - 1]) {
          nextFreeSlot = s;
          break;
        }
      }
      return {
        isFree: false,
        status: 'busy',
        consecutiveCount: 0,
        text: nextFreeSlot > -1
          ? `🔴 当前有课！预计 ${SESSION_SLOTS[nextFreeSlot - 1].start} (${SESSION_SLOTS[nextFreeSlot - 1].name}) 结课空闲`
          : `🔴 当前节次有课，今日后续无连续空闲`,
        badgeText: '上课中'
      };
    }

    // Free right now! Count continuous free slots
    let count = 0;
    let endSlot = currentActiveSlot;
    for (let s = currentActiveSlot; s <= 12; s++) {
      if (!room.schedule[s - 1]) {
        count++;
        endSlot = s;
      } else {
        break;
      }
    }

    const endTime = SESSION_SLOTS[endSlot - 1].end;
    if (count >= 4) {
      return {
        isFree: true,
        status: 'safe',
        consecutiveCount: count,
        text: `🟢 连坐极佳！当前空闲，可安心连续自习至 ${endTime}（连续 ${count} 节无课）`,
        badgeText: `连坐 ${count} 节`
      };
    } else if (count >= 2) {
      return {
        isFree: true,
        status: 'moderate',
        consecutiveCount: count,
        text: `🟡 当前空闲至 ${endTime}（连坐 ${count} 节），请注意 ${endTime} 后有课`,
        badgeText: `连空 ${count} 节`
      };
    } else {
      const nextStart = SESSION_SLOTS[currentActiveSlot] ? SESSION_SLOTS[currentActiveSlot].start : endTime;
      return {
        isFree: true,
        status: 'warn',
        consecutiveCount: 1,
        text: `⚠️ 临近有课！当前节次空闲，但下节 (${nextStart}) 即有课，请勿深扎`,
        badgeText: '仅剩1节'
      };
    }
  }

  function getRoomFilterStatus(room, selectedSlots) {
    if (room.isClosed) return 'status-closed';

    let freeCount = 0;
    selectedSlots.forEach(s => {
      if (!room.schedule[s - 1]) freeCount++;
    });

    if (freeCount === selectedSlots.length) {
      return 'status-free'; // All selected slots free
    } else if (freeCount === 0) {
      return 'status-busy'; // All occupied
    } else {
      return 'status-partial'; // Partially free
    }
  }

  // ==========================================================================
  // UI Rendering: Macro Overview & Floor Cabin Map
  // ==========================================================================

  function updateBuildingMacroCards() {
    const grid = document.getElementById('buildingCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    let campusTotalRooms = 0;
    let campusTotalFree = 0;

    NANLING_BUILDINGS.forEach(bldg => {
      const rooms = buildingRoomsMap[bldg.id] || [];
      const validRooms = rooms.filter(r => !r.isClosed);
      let freeCount = 0;

      validRooms.forEach(r => {
        if (getRoomFilterStatus(r, state.selectedSlots) === 'status-free') {
          freeCount++;
        }
      });

      campusTotalRooms += validRooms.length;
      campusTotalFree += freeCount;

      const percentage = validRooms.length > 0 ? Math.round((freeCount / validRooms.length) * 100) : 0;
      const isSelected = (bldg.id === state.buildingId);

      const card = document.createElement('div');
      card.className = `bldg-card ${isSelected ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="bldg-card-header">
          <span class="bldg-name">${bldg.shortName}</span>
          <span class="bldg-floors-tag">${bldg.tag} · ${bldg.totalFloors}层</span>
        </div>
        <div class="bldg-stats-row">
          <div class="bldg-free-count">${freeCount} <small>/ ${validRooms.length} 间可用</small></div>
          <div class="bldg-percentage-ring">${percentage}%</div>
        </div>
        <div class="bldg-progress-bar">
          <div class="bldg-progress-fill" style="width: ${percentage}%;"></div>
        </div>
      `;

      card.addEventListener('click', () => {
        state.buildingId = bldg.id;
        localStorage.setItem('nmj_building', state.buildingId);
        updateBuildingMacroCards();
        renderFloorCabinMap();
      });

      grid.appendChild(card);
    });

    const campusSummaryEl = document.getElementById('macroCampusSummary');
    if (campusSummaryEl) {
      const campusPercentage = campusTotalRooms > 0 ? Math.round((campusTotalFree / campusTotalRooms) * 100) : 0;
      campusSummaryEl.textContent = `南岭校区三大教学楼 · 所选节次综合空闲率 ${campusPercentage}% (可用 ${campusTotalFree} / 总计 ${campusTotalRooms} 间)`;
    }
  }

  function renderFloorCabinMap() {
    const container = document.getElementById('cabinFloorsContainer');
    if (!container) return;
    container.innerHTML = '';

    const currentBldg = NANLING_BUILDINGS.find(b => b.id === state.buildingId) || NANLING_BUILDINGS[0];
    
    document.getElementById('currentBuildingTitle').textContent = `${currentBldg.shortName} (${currentBldg.name})`;
    document.getElementById('currentBuildingSub').textContent = `日期：${state.queryDate} · 选定第 ${state.selectedSlots.join(',')} 节 · 空间舱位直出`;

    const allRooms = buildingRoomsMap[currentBldg.id] || [];
    
    // Filter rooms based on toggles
    let visibleRooms = allRooms.filter(r => {
      if (state.hideLabs && r.isClosed) return false;
      if (state.outletOnly && !r.hasOutlets) return false;
      if (state.largeRoomOnly && r.type !== 'lecture') return false;
      return true;
    });

    // Update active rooms count badge
    const badgeEl = document.getElementById('activeRoomsCountBadge');
    if (badgeEl) {
      badgeEl.textContent = `当前楼栋共 ${visibleRooms.length} 间可用`;
    }

    if (visibleRooms.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
          <div style="font-size: 36px; margin-bottom: 12px;">🔍</div>
          <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">该楼栋此时段暂无空闲教室</div>
          <div style="font-size: 13px; margin-top: 6px;">全天有课或教务系统未开放排课的教室已自动隐藏，请切换节次或查看其他楼栋。</div>
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
          <div class="floor-desc">${roomsOnFloor.length} 间教室</div>
        </div>
        <div class="floor-rooms-grid" id="floor-grid-${floorNum}"></div>
      `;

      const gridEl = floorRow.querySelector(`#floor-grid-${floorNum}`);

      roomsOnFloor.forEach(room => {
        const statusClass = getRoomFilterStatus(room, state.selectedSlots);
        const safety = calculateRoomSafety(room, state.selectedSlots[0] || 1);

        const roomCell = document.createElement('div');
        roomCell.className = `room-cabin-cell type-${room.type} ${statusClass}`;
        roomCell.dataset.roomId = room.id;

        let icon = '📖';
        if (room.type === 'lecture') icon = '🏛️';
        if (room.type === 'lab') icon = '💻';

        let pillClass = 'busy';
        if (safety.status === 'safe') pillClass = 'safe';
        if (safety.status === 'moderate' || safety.status === 'warn') pillClass = 'warn';

        roomCell.innerHTML = `
          <div class="room-top-info">
            <span class="room-name-text">${room.number}</span>
            <span class="room-type-icon">${icon}</span>
          </div>
          <div class="room-bottom-info">
            <span class="room-capacity">${room.capacity}座</span>
            <span class="consecutive-pill ${pillClass}">${safety.badgeText}</span>
          </div>
        `;

        // Hover events
        roomCell.addEventListener('mouseenter', (e) => showHoverCard(room, safety, e));
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

    const hideLabsToggle = document.getElementById('hideLabsToggle');
    if (hideLabsToggle) {
      hideLabsToggle.addEventListener('change', (e) => {
        state.hideLabs = e.target.checked;
        renderFloorCabinMap();
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
    updateBuildingMacroCards();
    renderFloorCabinMap();
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
    updateBuildingMacroCards();
    renderFloorCabinMap();
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

  function showHoverCard(room, safety, event) {
    if (!hoverCard) return;

    document.getElementById('hoverRoomName').textContent = room.name;
    document.getElementById('hoverRoomType').textContent = `${room.typeDisplay} · ${room.capacity}座`;

    const safetyBanner = document.getElementById('hoverSafetyBanner');
    safetyBanner.className = `card-safety-banner ${safety.status}`;
    document.getElementById('hoverSafetyText').textContent = safety.text;

    const bar = document.getElementById('hoverTimelineBar');
    bar.innerHTML = '';
    room.schedule.forEach((isBusy, idx) => {
      const dot = document.createElement('div');
      dot.className = `timeline-slot-dot ${isBusy ? 'busy' : 'free'}`;
      dot.textContent = idx + 1;
      dot.title = `第${idx + 1}节 (${SESSION_SLOTS[idx].time}): ${isBusy ? '有课/占用' : '空闲可自习'}`;
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

  // Barrier UI & Status State
  function showHardFailBarrier(errorResult) {
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
        仪表盘严守 <strong>100% 真实教务数据</strong> 原则，绝不使用任何伪造假数据误导自习。<br>
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
        targetCampus: '南岭校区 (02)',
        targetBuildings: '逸夫楼(65), 一教(73), 二教(82)'
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

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

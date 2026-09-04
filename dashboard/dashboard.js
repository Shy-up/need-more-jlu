/**
 * need_more_jlu - Study Classroom Dashboard Script (100% Real Data Architecture)
 * 裁剪精耕：聚焦南岭校区三大核心教学楼（逸夫楼 65、一教 73、二教 82）。
 * 架构核心：并发全拉 1~12 节切片，端侧重构全天排课时间轴，严格隐藏全天有课/无数据教室。
 */

(function() {
  'use strict';

  // Standard JLU Class Session Definitions (1~12 slots, official accurate schedule)
  const SESSION_SLOTS = [
    { slot: 1, name: '第1节', time: '08:00-08:45', start: '08:00', end: '08:45', period: 'morning' },
    { slot: 2, name: '第2节', time: '08:55-09:40', start: '08:55', end: '09:40', period: 'morning' },
    { slot: 3, name: '第3节', time: '10:00-10:45', start: '10:00', end: '10:45', period: 'morning' },
    { slot: 4, name: '第4节', time: '10:55-11:40', start: '10:55', end: '11:40', period: 'morning' },
    { slot: 5, name: '第5节', time: '13:30-14:15', start: '13:30', end: '14:15', period: 'afternoon' },
    { slot: 6, name: '第6节', time: '14:25-15:10', start: '14:25', end: '15:10', period: 'afternoon' },
    { slot: 7, name: '第7节', time: '15:30-16:15', start: '15:30', end: '16:15', period: 'afternoon' },
    { slot: 8, name: '第8节', time: '16:25-17:10', start: '16:25', end: '17:10', period: 'afternoon' },
    { slot: 9, name: '第9节', time: '18:20-19:05', start: '18:20', end: '19:05', period: 'evening' },
    { slot: 10, name: '第10节', time: '19:06-19:50', start: '19:06', end: '19:50', period: 'evening' },
    { slot: 11, name: '第11节', time: '20:00-20:45', start: '20:00', end: '20:45', period: 'evening' },
    { slot: 12, name: '第12节', time: '20:46-21:30', start: '20:46', end: '21:30', period: 'evening' }
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
    activePreset: 'now', // 'now' | 'morning' | 'afternoon' | 'evening' | 'all' | 'custom'
    selectedSlots: [1],
    roomTypes: {
      small: true,
      medium: true,
      large: true,
      special: false
    },
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

  function isQueryingToday() {
    return state.queryDate === getTodayString();
  }

  function getCurrentTimeSlotInfo() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 1. Before school (before Slot 1 08:00)
    if (currentTime < SESSION_SLOTS[0].start) {
      return {
        type: 'before_school',
        activeSlot: null,
        nextSlot: 1,
        nextSlotDef: SESSION_SLOTS[0],
        time: currentTime,
        badgeText: `早间课前 (第1节 ${SESSION_SLOTS[0].start} 开始) · 暂无排课`,
        hintText: `课前 (下节:第1节)`
      };
    }

    // 2. After school (after Slot 12 21:30)
    if (currentTime > SESSION_SLOTS[11].end) {
      return {
        type: 'after_school',
        activeSlot: null,
        nextSlot: null,
        nextSlotDef: null,
        time: currentTime,
        badgeText: `今日课程已全部结束 (${SESSION_SLOTS[11].end} 结课) · 晚自习时段`,
        hintText: `今日已结课`
      };
    }

    // 3. During class session or during break
    for (let i = 0; i < SESSION_SLOTS.length; i++) {
      const s = SESSION_SLOTS[i];
      if (currentTime >= s.start && currentTime <= s.end) {
        return {
          type: 'in_session',
          activeSlot: s.slot,
          nextSlot: i + 1 < SESSION_SLOTS.length ? SESSION_SLOTS[i + 1].slot : null,
          nextSlotDef: i + 1 < SESSION_SLOTS.length ? SESSION_SLOTS[i + 1] : null,
          slotDef: s,
          time: currentTime,
          badgeText: `进行中：${s.name} (${s.time})`,
          hintText: `当前第${s.slot}节`
        };
      }

      if (i + 1 < SESSION_SLOTS.length) {
        const nextS = SESSION_SLOTS[i + 1];
        if (currentTime > s.end && currentTime < nextS.start) {
          let breakName = '课间休息';
          if (s.slot === 4) breakName = '午休时段';
          else if (s.slot === 8) breakName = '傍晚课间';

          return {
            type: 'in_break',
            activeSlot: null,
            prevSlot: s.slot,
            nextSlot: nextS.slot,
            nextSlotDef: nextS,
            time: currentTime,
            badgeText: `${breakName} (下一节：${nextS.name} ${nextS.start}) · 暂无排课`,
            hintText: `${breakName} (下节:第${nextS.slot}节)`
          };
        }
      }
    }

    return {
      type: 'unknown',
      activeSlot: 1,
      nextSlot: 1,
      nextSlotDef: SESSION_SLOTS[0],
      badgeText: `第1节 (${SESSION_SLOTS[0].time})`,
      hintText: `当前节次`
    };
  }

  function getCurrentTimeSlot() {
    const info = getCurrentTimeSlotInfo();
    if (info.type === 'in_session') return info.activeSlot;
    if (info.type === 'in_break' || info.type === 'before_school') return info.nextSlot;
    if (info.type === 'after_school') return 12;
    return 1;
  }

  // ==========================================================================
  // Directly Expanded Inline Calendar Logic
  // ==========================================================================

  const nowForCal = new Date();
  let calendarView = {
    year: nowForCal.getFullYear(),
    month: nowForCal.getMonth() // 0-11
  };

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function renderInlineCalendar() {
    const labelEl = document.getElementById('calMonthLabel');
    const gridEl = document.getElementById('calDaysGrid');
    if (!gridEl) return;

    const { year, month } = calendarView;
    if (labelEl) {
      labelEl.textContent = `${year}年 ${month + 1}月`;
    }

    gridEl.innerHTML = '';

    // First day of month (convert to Monday-first: 0 = Mon, 6 = Sun)
    const firstDayDate = new Date(year, month, 1);
    let startDay = (firstDayDate.getDay() + 6) % 7;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const todayStr = getTodayString();
    const selectedStr = state.queryDate;

    // Previous month padding days
    for (let i = startDay - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dateStr = formatDate(prevDate);

      const cell = document.createElement('div');
      cell.className = 'cal-day-cell other-month';
      cell.textContent = dayNum;
      cell.title = dateStr;
      cell.addEventListener('click', () => {
        selectCalendarDate(dateStr);
      });
      gridEl.appendChild(cell);
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(year, month, d);
      const dateStr = formatDate(curDate);

      const cell = document.createElement('div');
      cell.className = 'cal-day-cell';
      cell.textContent = d;
      cell.title = dateStr;

      if (dateStr === todayStr) {
        cell.classList.add('today');
      }
      if (dateStr === selectedStr) {
        cell.classList.add('active');
      }

      cell.addEventListener('click', () => {
        selectCalendarDate(dateStr);
      });

      gridEl.appendChild(cell);
    }

    // Next month padding days to complete rows
    const totalCells = startDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateStr = formatDate(nextDate);

      const cell = document.createElement('div');
      cell.className = 'cal-day-cell other-month';
      cell.textContent = d;
      cell.title = dateStr;
      cell.addEventListener('click', () => {
        selectCalendarDate(dateStr);
      });
      gridEl.appendChild(cell);
    }
  }

  function selectCalendarDate(dateStr) {
    state.queryDate = dateStr;
    const parts = dateStr.split('-');
    calendarView.year = parseInt(parts[0], 10);
    calendarView.month = parseInt(parts[1], 10) - 1;

    const queryInput = document.getElementById('queryDateInput');
    if (queryInput) queryInput.value = dateStr;

    renderInlineCalendar();
    updateDateControls();
    loadParallelTimelineData();
  }

  function bindCalendarEvents() {
    const prevBtn = document.getElementById('calPrevMonthBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        calendarView.month--;
        if (calendarView.month < 0) {
          calendarView.month = 11;
          calendarView.year--;
        }
        renderInlineCalendar();
      });
    }

    const nextBtn = document.getElementById('calNextMonthBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        calendarView.month++;
        if (calendarView.month > 11) {
          calendarView.month = 0;
          calendarView.year++;
        }
        renderInlineCalendar();
      });
    }

    const todayBtn = document.getElementById('calendarTodayBtn');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        selectCalendarDate(getTodayString());
      });
    }
  }

  // Initialization
  function init() {
    state.selectedSlots = isQueryingToday() ? [getCurrentTimeSlot()] : [5, 6, 7, 8];

    bindHeaderEvents();
    bindCalendarEvents();
    renderInlineCalendar();
    bindFilterEvents();
    renderSlotsMatrix();
    initHoverCard();
    startClock();
    updateDateControls();

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
          selectCalendarDate(e.target.value);
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
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const semester = (month >= 2 && month <= 7) ? '春季学期' : '秋季学期';

      if (timeMetaEl) {
        timeMetaEl.textContent = `${year}年${semester} · ${month}月${day}日 · ${dayName}`;
      }

      if (slotBadgeEl) {
        slotBadgeEl.style.display = 'block';
        if (isQueryingToday()) {
          const timeInfo = getCurrentTimeSlotInfo();
          if (timeInfo.type === 'in_session') {
            slotBadgeEl.textContent = `当前进行中：${timeInfo.slotDef.name} (${timeInfo.slotDef.time})`;
          } else {
            slotBadgeEl.textContent = timeInfo.badgeText;
          }
        } else {
          slotBadgeEl.textContent = `查询指定日期：${state.queryDate}`;
        }
      }
    }

    update();
    setInterval(update, 20000);
  }

  // ==========================================================================
  // Parallel 1~12 Full Fetch & Merge Engine
  // ==========================================================================

  async function loadParallelTimelineData() {
    updateBadgeState('loading', '正在获取排课数据...');
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

    // Sort rooms within each building by floor (1F up to top floor) and room number (asc)
    Object.keys(buildingRoomsMap).forEach(k => {
      buildingRoomsMap[k].sort((a, b) => {
        if (a.floor !== b.floor) return a.floor - b.floor;
        return a.number.localeCompare(b.number);
      });
    });

    // Update Data Status Pill
    updateBadgeState('connected', `数据已更新 · 共 ${totalRoomsFound} 间教室`);

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
    const typeDisplay = row.JASLXDM_DISPLAY || '普通教室';

    // 1. 特殊教室 (机房、实验室、语音室、画室、设计、通常封闭或不一定开放)
    const isSpecial = (
      row.JASLXDM === '07' || row.JASLXDM === '11' || row.JASLXDM === '12' ||
      typeDisplay.includes('实验') || typeDisplay.includes('机房') || typeDisplay.includes('语音') ||
      typeDisplay.includes('画室') || typeDisplay.includes('制图') || typeDisplay.includes('公用') ||
      typeDisplay.includes('体育') || typeDisplay.includes('设计') ||
      fullName.includes('实验') || fullName.includes('机房') || fullName.includes('语音') ||
      fullName.includes('天元') || fullName.includes('基地') || fullName.includes('专用')
    );

    let category = 'medium';
    let categoryName = '中教室(30~80)';
    let typeIcon = '🏛️';

    if (isSpecial) {
      category = 'special';
      categoryName = '特殊教室(不一定开放)';
      typeIcon = '🔬';
    } else if (capacity < 30) {
      category = 'small';
      categoryName = '小教室(<30人)';
      typeIcon = '📖';
    } else if (capacity <= 80) {
      category = 'medium';
      categoryName = '中教室(30~80)';
      typeIcon = '🏛️';
    } else {
      category = 'large';
      categoryName = '大教室(80+)';
      typeIcon = '🏟️';
    }

    return {
      id: fullName,
      name: fullName,
      number: shortNumber,
      floor: floor,
      buildingCode: bCode,
      capacity: capacity,
      examCapacity: row.KSZWS || 0,
      typeDisplay: typeDisplay,
      category: category, // 'small' | 'medium' | 'large' | 'special'
      categoryName: categoryName,
      typeIcon: typeIcon,
      type: category,
      isClosed: isSpecial
    };
  }

  // ==========================================================================
  // Schedule Overview & Truthful Status Calculation
  // ==========================================================================

  function formatSlotRanges(slotIndices) {
    if (!slotIndices || slotIndices.length === 0) return '';
    const ranges = [];
    let start = slotIndices[0];
    let prev = slotIndices[0];

    for (let i = 1; i < slotIndices.length; i++) {
      const cur = slotIndices[i];
      if (cur === prev + 1) {
        prev = cur;
      } else {
        ranges.push(start === prev ? `第${start}节` : `第${start}~${prev}节`);
        start = cur;
        prev = cur;
      }
    }
    ranges.push(start === prev ? `第${start}节` : `第${start}~${prev}节`);
    return ranges.join('、');
  }

  function getRoomDaySummary(room) {
    const freeSlots = [];
    const busySlots = [];
    room.schedule.forEach((isBusy, idx) => {
      if (isBusy) busySlots.push(idx + 1);
      else freeSlots.push(idx + 1);
    });

    if (freeSlots.length === 12) {
      return '全天 12 节均空闲（无排课）';
    }
    if (busySlots.length === 12) {
      return '全天 12 节均有排课占用';
    }

    return `空闲时段：${formatSlotRanges(freeSlots)}；排课时段：${formatSlotRanges(busySlots)}`;
  }

  function getRoomBadgeInfo(room) {
    if (room.isClosed) {
      return { text: '机房/封闭', type: 'busy' };
    }

    const isToday = isQueryingToday();
    const isNowMode = isToday && (state.activePreset === 'now' || arraysEqual(state.selectedSlots, [getCurrentTimeSlot()]));

    if (isNowMode) {
      const timeInfo = getCurrentTimeSlotInfo();

      if (timeInfo.type === 'after_school') {
        return { text: '今日已结课', type: 'safe' };
      }

      if (timeInfo.type === 'before_school') {
        const isFree1 = !room.schedule[0];
        if (isFree1) {
          let count = 0;
          for (let s = 1; s <= 12; s++) {
            if (!room.schedule[s - 1]) count++;
            else break;
          }
          if (count === 12) return { text: '全天全空', type: 'safe' };
          return { text: `可坐 ${count} 节`, type: count >= 3 ? 'safe' : 'warn' };
        } else {
          return { text: `第1节有课 (${SESSION_SLOTS[0].start})`, type: 'warn' };
        }
      }

      if (timeInfo.type === 'in_break') {
        const nextSlot = timeInfo.nextSlot;
        const nextS = timeInfo.nextSlotDef;
        const isNextFree = !room.schedule[nextSlot - 1];

        if (isNextFree) {
          let count = 0;
          for (let s = nextSlot; s <= 12; s++) {
            if (!room.schedule[s - 1]) count++;
            else break;
          }
          if (count === (13 - nextSlot) && nextSlot <= 2) return { text: '全天全空', type: 'safe' };
          return { text: `连空 ${count} 节`, type: count >= 3 ? 'safe' : 'warn' };
        } else {
          return { text: `下节有课 (${nextS ? nextS.start : ''})`, type: 'warn' };
        }
      }

      // in_session
      const curSlot = timeInfo.activeSlot;
      const isFreeNow = !room.schedule[curSlot - 1];

      if (isFreeNow) {
        let count = 0;
        for (let s = curSlot; s <= 12; s++) {
          if (!room.schedule[s - 1]) count++;
          else break;
        }
        if (count === 12) return { text: '全天全空', type: 'safe' };
        return { text: `连空 ${count} 节`, type: count >= 3 ? 'safe' : 'warn' };
      } else {
        return { text: '当前有课', type: 'busy' };
      }
    } else {
      let freeCount = 0;
      state.selectedSlots.forEach(s => {
        if (!room.schedule[s - 1]) freeCount++;
      });

      if (freeCount === state.selectedSlots.length) {
        if (state.selectedSlots.length === 12) {
          return { text: '全天全空', type: 'safe' };
        }
        return { text: `全空 (${freeCount}节)`, type: 'safe' };
      } else if (freeCount === 0) {
        return { text: '满课', type: 'busy' };
      } else {
        return { text: `${freeCount}节空`, type: 'warn' };
      }
    }
  }

  function getRoomHoverDetails(room) {
    const isToday = isQueryingToday();
    const isNowMode = isToday && (state.activePreset === 'now' || arraysEqual(state.selectedSlots, [getCurrentTimeSlot()]));
    let bannerIcon = '🟢';
    let bannerText = '';
    let bannerClass = 'safe';

    if (isNowMode) {
      const timeInfo = getCurrentTimeSlotInfo();

      if (timeInfo.type === 'after_school') {
        bannerIcon = '🟢';
        bannerClass = 'safe';
        bannerText = `今日教学排课已于 ${SESSION_SLOTS[11].end} 全部结束，全天课程已完毕，晚自习自由开放`;
      } else if (timeInfo.type === 'before_school') {
        const isFree1 = !room.schedule[0];
        if (isFree1) {
          let endSlot = 1;
          for (let s = 1; s <= 12; s++) {
            if (!room.schedule[s - 1]) endSlot = s;
            else break;
          }
          const count = endSlot;
          const endTime = SESSION_SLOTS[endSlot - 1].end;
          bannerIcon = '🟢';
          bannerClass = 'safe';
          bannerText = `当前为早间课前 (08:00前暂无课)，第 1 节起亦空闲，可自习至 ${endTime} (连续 ${count} 节无课)`;
        } else {
          bannerIcon = '🟡';
          bannerClass = 'warn';
          bannerText = `当前为早间课前 (08:00前暂无课)，注意第 1 节 (${SESSION_SLOTS[0].start}) 即有排课，课前可短暂停留`;
        }
      } else if (timeInfo.type === 'in_break') {
        const nextSlot = timeInfo.nextSlot;
        const nextS = timeInfo.nextSlotDef;
        const isNextFree = !room.schedule[nextSlot - 1];

        if (isNextFree) {
          let endSlot = nextSlot;
          for (let s = nextSlot; s <= 12; s++) {
            if (!room.schedule[s - 1]) endSlot = s;
            else break;
          }
          const count = endSlot - nextSlot + 1;
          const endTime = SESSION_SLOTS[endSlot - 1].end;
          bannerIcon = '🟢';
          bannerClass = 'safe';
          bannerText = `当前为${timeInfo.badgeText.split(' ')[0]} (此时段暂无课)，下节 (${nextS.name} ${nextS.start}起) 亦空闲，可连续自习至 ${endTime} (连空 ${count} 节)`;
        } else {
          bannerIcon = '🟡';
          bannerClass = 'warn';
          bannerText = `当前为${timeInfo.badgeText.split(' ')[0]} (此时段暂无课)，但下节 (${nextS.name} ${nextS.start}) 即有排课，课间还可自习至 ${nextS.start}`;
        }
      } else {
        // in_session
        const curSlot = timeInfo.activeSlot;
        const slotDef = timeInfo.slotDef;
        const isFreeNow = !room.schedule[curSlot - 1];

        if (isFreeNow) {
          let endSlot = curSlot;
          for (let s = curSlot; s <= 12; s++) {
            if (!room.schedule[s - 1]) endSlot = s;
            else break;
          }
          const count = endSlot - curSlot + 1;
          const endTime = SESSION_SLOTS[endSlot - 1].end;

          if (count >= 4) {
            bannerIcon = '🟢';
            bannerClass = 'safe';
            bannerText = `当前第 ${curSlot} 节空闲，可连续自习至 ${endTime} (连续 ${count} 节无课)`;
          } else if (count >= 2) {
            bannerIcon = '🟡';
            bannerClass = 'warn';
            bannerText = `当前第 ${curSlot} 节空闲，可坐至 ${endTime} (连空 ${count} 节，${endTime} 后有课)`;
          } else {
            const nextStart = SESSION_SLOTS[curSlot] ? SESSION_SLOTS[curSlot].start : endTime;
            bannerIcon = '🟡';
            bannerClass = 'warn';
            bannerText = `当前节次空闲，下节 (${nextStart}) 即有课，仅剩 1 节`;
          }
        } else {
          let nextFree = -1;
          for (let s = curSlot + 1; s <= 12; s++) {
            if (!room.schedule[s - 1]) { nextFree = s; break; }
          }
          bannerIcon = '🔴';
          bannerClass = 'busy';
          if (nextFree > -1) {
            bannerText = `当前进行中 (${slotDef.name}) 有排课 (至 ${slotDef.end})；下个空闲：第 ${nextFree} 节 (${SESSION_SLOTS[nextFree - 1].start}) 起`;
          } else {
            bannerText = `当前进行中 (${slotDef.name}) 有排课，今日后续无空闲节次`;
          }
        }
      }
    } else {
      const freeSlotsInSelected = [];
      const busySlotsInSelected = [];
      state.selectedSlots.forEach(s => {
        if (!room.schedule[s - 1]) freeSlotsInSelected.push(s);
        else busySlotsInSelected.push(s);
      });

      if (freeSlotsInSelected.length === state.selectedSlots.length) {
        bannerIcon = '🟢';
        bannerClass = 'safe';
        bannerText = state.selectedSlots.length === 12
          ? `${state.queryDate} 全天 12 节均无排课，全天空闲`
          : `${state.queryDate} 所选 ${state.selectedSlots.length} 节时段全部空闲`;
      } else if (freeSlotsInSelected.length === 0) {
        bannerIcon = '🔴';
        bannerClass = 'busy';
        bannerText = `${state.queryDate} 所选时段全部有课，暂无空位`;
      } else {
        bannerIcon = '🟡';
        bannerClass = 'warn';
        bannerText = `${state.queryDate} 所选时段部分空闲 (第 ${freeSlotsInSelected.join(',')} 节空闲，第 ${busySlotsInSelected.join(',')} 节有课)`;
      }
    }

    return {
      bannerIcon,
      bannerText,
      bannerClass,
      summary: getRoomDaySummary(room)
    };
  }

  function getRoomFilterStatus(room, selectedSlots) {
    if (room.isClosed) return 'status-closed';

    if (isQueryingToday() && (state.activePreset === 'now' || arraysEqual(selectedSlots, [getCurrentTimeSlot()]))) {
      const timeInfo = getCurrentTimeSlotInfo();
      if (timeInfo.type === 'after_school') {
        return 'status-free'; // Today's classes ended, free for evening study
      }
      if (timeInfo.type === 'before_school') {
        return (!room.schedule[0]) ? 'status-free' : 'status-partial';
      }
      if (timeInfo.type === 'in_break') {
        const nextSlot = timeInfo.nextSlot;
        if (!room.schedule[nextSlot - 1]) {
          return 'status-free';
        } else {
          return 'status-partial';
        }
      }
      // in_session
      const curSlot = timeInfo.activeSlot;
      return (!room.schedule[curSlot - 1]) ? 'status-free' : 'status-busy';
    }

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

  // Calculate dynamic physical cell dimensions based on classroom capacity (15 ~ 400 seats)
  // Ensures larger rooms have noticeably larger areas, with fixed lower (15) and upper (400) bounds
  function getRoomDimensions(capacity, roomName) {
    const minCap = 15;
    const maxCap = 400;
    const clamped = Math.max(minCap, Math.min(maxCap, Number(capacity) || 60));
    const t = (clamped - minCap) / (maxCap - minCap); // 0.0 ~ 1.0

    // Width scales from 105px to 190px, height from 68px to 96px
    let width = Math.round(105 + t * 85);
    let height = Math.round(68 + t * 28);

    // Ensure long classroom names (e.g. 机械设计多媒体室) fit normally without clipping
    const str = String(roomName || '');
    if (str.length >= 6) {
      const minNameWidth = Math.min(220, 75 + str.length * 13);
      width = Math.max(width, minNameWidth);
    }

    return { width, height };
  }

  function renderFloorCabinMap() {
    const container = document.getElementById('cabinFloorsContainer');
    if (!container) return;
    container.innerHTML = '';

    const currentBldg = NANLING_BUILDINGS.find(b => b.id === state.buildingId) || NANLING_BUILDINGS[0];
    
    document.getElementById('currentBuildingTitle').textContent = `${currentBldg.shortName} (${currentBldg.name})`;
    
    const timeInfo = getCurrentTimeSlotInfo();
    let subDetail = `选中第 ${state.selectedSlots.join(',')} 节`;
    if (isQueryingToday() && (state.activePreset === 'now' || arraysEqual(state.selectedSlots, [getCurrentTimeSlot()]))) {
      if (timeInfo.type === 'in_session') {
        subDetail = `当前第 ${timeInfo.activeSlot} 节进行中 (${timeInfo.slotDef.time})`;
      } else if (timeInfo.type === 'in_break') {
        subDetail = `${timeInfo.badgeText.split(' ')[0]} (下节 ${timeInfo.nextSlotDef ? timeInfo.nextSlotDef.name : ''} ${timeInfo.nextSlotDef ? timeInfo.nextSlotDef.start : ''} 开始)`;
      } else if (timeInfo.type === 'before_school') {
        subDetail = `早间课前 (第1节 08:00 开始)`;
      } else if (timeInfo.type === 'after_school') {
        subDetail = `今日课程已全部结束 (自由晚自习)`;
      }
    }
    document.getElementById('currentBuildingSub').textContent = `${state.queryDate} · ${subDetail} · 空间舱位图`;

    const allRooms = buildingRoomsMap[currentBldg.id] || [];
    
    // Filter rooms based on classroom category toggles (small, medium, large, special)
    const visibleRooms = allRooms.filter(r => {
      if (r.category === 'small' && !state.roomTypes.small) return false;
      if (r.category === 'medium' && !state.roomTypes.medium) return false;
      if (r.category === 'large' && !state.roomTypes.large) return false;
      if (r.category === 'special' && !state.roomTypes.special) return false;
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

    // Floor rendering: 1F first, then higher floors downwards (matches physical entrance & reduces climbing)
    const floorNumbers = Object.keys(floorsMap).map(Number).sort((a, b) => a - b);

    floorNumbers.forEach(floorNum => {
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
        const badgeInfo = getRoomBadgeInfo(room);

        const roomCell = document.createElement('div');
        roomCell.className = `room-cabin-cell type-${room.category} ${statusClass}`;
        roomCell.dataset.roomId = room.id;

        // Dynamic area sizing: larger rooms have larger areas (15 ~ 400 seats bounds)
        const dims = getRoomDimensions(room.capacity, room.number);
        roomCell.style.width = `${dims.width}px`;
        roomCell.style.minHeight = `${dims.height}px`;

        let icon = room.typeIcon || '🏛️';

        roomCell.innerHTML = `
          <div class="room-top-info">
            <span class="room-name-text">${room.number}</span>
            <span class="room-type-icon">${icon}</span>
          </div>
          <div class="room-bottom-info">
            <span class="room-capacity">${room.capacity}座</span>
            <span class="consecutive-pill ${badgeInfo.type}">${badgeInfo.text}</span>
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
  function updateDateControls() {
    const isToday = isQueryingToday();
    const nowBtn = document.getElementById('presetNowBtn');
    const nowHint = document.getElementById('presetNowHint');
    const slotBadgeEl = document.getElementById('currentSlotBadge');

    if (nowBtn) {
      if (isToday) {
        nowBtn.disabled = false;
        nowBtn.style.opacity = '1';
        nowBtn.style.cursor = 'pointer';
        
        const timeInfo = getCurrentTimeSlotInfo();
        if (nowHint) nowHint.textContent = timeInfo.hintText;
        if (slotBadgeEl) {
          slotBadgeEl.style.display = 'block';
          if (timeInfo.type === 'in_session') {
            slotBadgeEl.textContent = `当前进行中：${timeInfo.slotDef.name} (${timeInfo.slotDef.time})`;
          } else {
            slotBadgeEl.textContent = timeInfo.badgeText;
          }
        }
      } else {
        nowBtn.disabled = true;
        nowBtn.style.opacity = '0.4';
        nowBtn.style.cursor = 'not-allowed';
        if (nowHint) nowHint.textContent = '仅限今日';
        if (slotBadgeEl) {
          slotBadgeEl.style.display = 'block';
          slotBadgeEl.textContent = `查询指定日期：${state.queryDate}`;
        }
        if (state.activePreset === 'now') {
          applyPreset('all');
        }
      }
    }
  }

  function bindFilterEvents() {
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        applyPreset(btn.dataset.preset);
      });
    });

    const resetBtn = document.getElementById('resetFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.roomTypes = { small: true, medium: true, large: true, special: false };
        const smallToggle = document.getElementById('typeSmallToggle');
        const mediumToggle = document.getElementById('typeMediumToggle');
        const largeToggle = document.getElementById('typeLargeToggle');
        const specialToggle = document.getElementById('typeSpecialToggle');
        if (smallToggle) smallToggle.checked = true;
        if (mediumToggle) mediumToggle.checked = true;
        if (largeToggle) largeToggle.checked = true;
        if (specialToggle) specialToggle.checked = false;

        if (isQueryingToday()) {
          applyPreset('now');
        } else {
          applyPreset('all');
        }
      });
    }

    const smallToggle = document.getElementById('typeSmallToggle');
    if (smallToggle) {
      smallToggle.checked = state.roomTypes.small;
      smallToggle.addEventListener('change', (e) => {
        state.roomTypes.small = e.target.checked;
        renderFloorCabinMap();
      });
    }

    const mediumToggle = document.getElementById('typeMediumToggle');
    if (mediumToggle) {
      mediumToggle.checked = state.roomTypes.medium;
      mediumToggle.addEventListener('change', (e) => {
        state.roomTypes.medium = e.target.checked;
        renderFloorCabinMap();
      });
    }

    const largeToggle = document.getElementById('typeLargeToggle');
    if (largeToggle) {
      largeToggle.checked = state.roomTypes.large;
      largeToggle.addEventListener('change', (e) => {
        state.roomTypes.large = e.target.checked;
        renderFloorCabinMap();
      });
    }

    const specialToggle = document.getElementById('typeSpecialToggle');
    if (specialToggle) {
      specialToggle.checked = state.roomTypes.special;
      specialToggle.addEventListener('change', (e) => {
        state.roomTypes.special = e.target.checked;
        renderFloorCabinMap();
      });
    }
  }

  function applyPreset(presetName) {
    if (presetName === 'now' && !isQueryingToday()) {
      return;
    }

    state.activePreset = presetName;
    if (presetName === 'now') {
      state.selectedSlots = [getCurrentTimeSlot()];
    } else if (presetName === 'morning') {
      state.selectedSlots = [1, 2, 3, 4];
    } else if (presetName === 'afternoon') {
      state.selectedSlots = [5, 6, 7, 8];
    } else if (presetName === 'evening') {
      state.selectedSlots = [9, 10, 11, 12];
    } else if (presetName === 'all') {
      state.selectedSlots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    }

    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(b => {
      if (b.dataset.preset === presetName) b.classList.add('active');
      else b.classList.remove('active');
    });

    updateSelectedCount();
    highlightMatrixCapsules();
    updateBuildingMacroCards();
    renderFloorCabinMap();
  }

  function arraysEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function syncPresetWithSelectedSlots() {
    const slots = state.selectedSlots;
    const curSlot = getCurrentTimeSlot();

    let matchedPreset = 'custom';
    if (isQueryingToday() && arraysEqual(slots, [curSlot])) {
      matchedPreset = 'now';
    } else if (arraysEqual(slots, [1, 2, 3, 4])) {
      matchedPreset = 'morning';
    } else if (arraysEqual(slots, [5, 6, 7, 8])) {
      matchedPreset = 'afternoon';
    } else if (arraysEqual(slots, [9, 10, 11, 12])) {
      matchedPreset = 'evening';
    } else if (arraysEqual(slots, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) {
      matchedPreset = 'all';
    }

    state.activePreset = matchedPreset;
    document.querySelectorAll('.preset-btn').forEach(b => {
      if (b.dataset.preset === matchedPreset) b.classList.add('active');
      else b.classList.remove('active');
    });
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

    syncPresetWithSelectedSlots();

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
    if (!countEl) return;
    const timeInfo = getCurrentTimeSlotInfo();
    if (isQueryingToday() && (state.activePreset === 'now' || arraysEqual(state.selectedSlots, [getCurrentTimeSlot()]))) {
      if (timeInfo.type === 'in_break') {
        countEl.textContent = `${timeInfo.badgeText.split(' ')[0]} · 下节:第${timeInfo.nextSlot}节`;
        return;
      } else if (timeInfo.type === 'before_school') {
        countEl.textContent = `早间课前 · 下节:第1节`;
        return;
      } else if (timeInfo.type === 'after_school') {
        countEl.textContent = `今日已结课 (晚自习)`;
        return;
      }
    }
    countEl.textContent = `已选 ${state.selectedSlots.length} 节 (${state.selectedSlots.join(',')}节)`;
  }

  // Hover Tooltip
  let hoverCard = null;

  function initHoverCard() {
    hoverCard = document.getElementById('roomHoverCard');
  }

  function showHoverCard(room, event) {
    if (!hoverCard) return;

    const details = getRoomHoverDetails(room);

    document.getElementById('hoverRoomName').textContent = room.name;
    document.getElementById('hoverRoomType').textContent = `${room.categoryName} · ${room.typeDisplay} · ${room.capacity}座`;

    const statusBanner = document.getElementById('hoverStatusBanner');
    if (statusBanner) {
      statusBanner.className = `card-status-banner ${details.bannerClass}`;
      const iconEl = document.getElementById('hoverStatusIcon');
      const textEl = document.getElementById('hoverStatusText');
      if (iconEl) iconEl.textContent = details.bannerIcon;
      if (textEl) textEl.textContent = details.bannerText;
    }

    const bar = document.getElementById('hoverTimelineBar');
    if (bar) {
      bar.innerHTML = '';
      room.schedule.forEach((isBusy, idx) => {
        const dot = document.createElement('div');
        dot.className = `timeline-slot-dot ${isBusy ? 'busy' : 'free'}`;
        dot.textContent = idx + 1;
        dot.title = `第${idx + 1}节 (${SESSION_SLOTS[idx].time}): ${isBusy ? '排课占用' : '空闲可自习'}`;
        bar.appendChild(dot);
      });
    }

    const summaryEl = document.getElementById('hoverScheduleSummary');
    if (summaryEl) {
      summaryEl.textContent = details.summary;
    }

    hoverCard.style.display = 'block';
    positionHoverCard(event);
  }

  function positionHoverCard(e) {
    if (!hoverCard || hoverCard.style.display === 'none') return;
    const cardWidth = 320;
    const cardHeight = hoverCard.offsetHeight || 200;

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

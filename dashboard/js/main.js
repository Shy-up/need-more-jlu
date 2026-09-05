/**
 * need_more_jlu - Main Dashboard Application Controller (Native ESM)
 * 吉大自习直达仪表盘主控制器：协调日历感知、作息时钟、双通道真实排课查询、宏观微观视图联动。
 */

import {
  DEFAULT_CAMPUS_CODE,
  DEFAULT_BUILDING_CODE,
  DEFAULT_BUILDINGS,
  SESSION_SLOTS
} from '../../config/constants.js';

import {
  getTodayString,
  isQueryingToday,
  formatDate,
  arraysEqual,
  getCurrentTimeSlotInfo,
  getCurrentTimeSlot,
  mergeAndProcessTimeline
} from './timeline_engine.js';

import {
  loadRecommendationsConfig,
  getSanitizedBuildingId,
  loadCampusConfig,
  fetchTimelineData
} from './data_service.js';

import {
  syncBuildingCardSelectedState,
  updateBuildingMacroCards
} from './render_macro.js';

import {
  renderFloorCabinMap
} from './render_cabin.js';

import {
  initHoverCard,
  showHoverCard,
  positionHoverCard,
  hideHoverCard
} from './tooltip.js';

import {
  updateBadgeState,
  showLoadingPanel,
  hideLoadingPanel,
  showContentArea,
  hideContentArea,
  hideBarrierPanel,
  showHardFailBarrier,
  startEmbeddedQrLoginFlow
} from './auth_barrier.js';

import {
  initWallpaperAndTheme,
  applyTheme,
  saveSettings
} from './wallpaper_theme.js';

// ============================================================================
// 1. 全局核心状态
// ============================================================================

const state = {
  campusCode: DEFAULT_CAMPUS_CODE,
  buildingId: DEFAULT_BUILDING_CODE,
  queryDate: getTodayString(),
  activePreset: 'now', // 'now' | 'morning' | 'afternoon' | 'evening' | 'all' | 'custom'
  selectedSlots: [1],
  roomTypes: {
    small: true,
    medium: true,
    large: true,
    special: false
  },
  isDarkTheme: false,
  customWallpaper: '',
  uiOpacity: 0.85,
  wallpaperOpacity: 0.90,
  fetchStatus: 'IDLE', // 'IDLE' | 'LOADING' | 'SUCCESS' | 'UNAUTHENTICATED' | 'NETWORK_ERROR' | 'TIMEOUT'
  isDataLoaded: false
};

const nowForCal = new Date();
const calendarView = {
  year: nowForCal.getFullYear(),
  month: nowForCal.getMonth() // 0-11
};

let campusConfig = null;
let currentCampus = null;
let currentBuildings = [];
let buildingRoomsMap = {};
let recommendationsConfig = null;

// ============================================================================
// 2. 日历组件渲染与事件
// ============================================================================

function renderInlineCalendar() {
  const labelEl = document.getElementById('calMonthLabel');
  const gridEl = document.getElementById('calDaysGrid');
  if (!gridEl) return;

  const { year, month } = calendarView;
  if (labelEl) {
    labelEl.textContent = `${year}年 ${month + 1}月`;
  }

  gridEl.innerHTML = '';

  const firstDayDate = new Date(year, month, 1);
  const startDay = (firstDayDate.getDay() + 6) % 7;

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
    cell.addEventListener('click', () => selectCalendarDate(dateStr));
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

    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr === selectedStr) cell.classList.add('active');

    cell.addEventListener('click', () => selectCalendarDate(dateStr));
    gridEl.appendChild(cell);
  }

  // Next month padding days
  const totalCells = startDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nextDate = new Date(year, month + 1, d);
    const dateStr = formatDate(nextDate);

    const cell = document.createElement('div');
    cell.className = 'cal-day-cell other-month';
    cell.textContent = d;
    cell.title = dateStr;
    cell.addEventListener('click', () => selectCalendarDate(dateStr));
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

// ============================================================================
// 3. 校区与楼栋切换管理
// ============================================================================

function initCampusSelector() {
  const campusSelect = document.getElementById('campusSelect');
  if (!campusSelect) return;

  campusSelect.innerHTML = '';
  const savedCampusCode = localStorage.getItem('nmj_campus') || campusConfig.defaultCampus || DEFAULT_CAMPUS_CODE;

  campusConfig.campuses.forEach(camp => {
    const opt = document.createElement('option');
    opt.value = camp.code;
    opt.textContent = camp.name;
    if (camp.code === savedCampusCode) opt.selected = true;
    campusSelect.appendChild(opt);
  });

  currentCampus = campusConfig.campuses.find(c => c.code === campusSelect.value) || campusConfig.campuses[0];
  state.campusCode = currentCampus.code;
  currentBuildings = currentCampus.buildings || [];
  state.buildingId = getSanitizedBuildingId(currentBuildings, state.campusCode, recommendationsConfig);

  campusSelect.addEventListener('change', (e) => {
    const newCode = e.target.value;
    const targetCamp = campusConfig.campuses.find(c => c.code === newCode);
    if (targetCamp) {
      currentCampus = targetCamp;
      state.campusCode = targetCamp.code;
      currentBuildings = targetCamp.buildings || [];
      state.buildingId = getSanitizedBuildingId(currentBuildings, targetCamp.code, recommendationsConfig);
      localStorage.setItem('nmj_campus', newCode);

      const collapseEl = document.getElementById('allBuildingsCollapse');
      if (collapseEl) collapseEl.open = false;

      buildingRoomsMap = {};
      currentBuildings.forEach(b => {
        buildingRoomsMap[b.id] = [];
      });

      renderMacro();
      renderCabin();
      loadParallelTimelineData();
    }
  });

  buildingRoomsMap = {};
  currentBuildings.forEach(b => {
    buildingRoomsMap[b.id] = [];
  });
}

// ============================================================================
// 4. 数据拉取与渲染编排
// ============================================================================

function renderMacro() {
  updateBuildingMacroCards({
    currentBuildings,
    buildingRoomsMap,
    state,
    currentCampus,
    recommendationsConfig,
    onSelectBuilding: (bldgId) => {
      state.buildingId = bldgId;
      localStorage.setItem('nmj_building', state.buildingId);
      syncBuildingCardSelectedState(state.buildingId);
      renderCabin();
    }
  });
}

function renderCabin() {
  renderFloorCabinMap({
    currentBuildings,
    buildingRoomsMap,
    state,
    onRetry: () => loadParallelTimelineData(),
    onRelogin: () => startEmbeddedQrLoginFlow(() => loadParallelTimelineData()),
    onResetRoomTypes: () => {
      state.roomTypes = { small: true, medium: true, large: true, special: true };
      ['typeSmallToggle', 'typeMediumToggle', 'typeLargeToggle', 'typeSpecialToggle'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
      });
      renderCabin();
    },
    onSwitchBuilding: (targetId) => {
      state.buildingId = targetId;
      localStorage.setItem('nmj_building', state.buildingId);
      renderMacro();
      renderCabin();
    },
    onSelectTomorrow: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      selectCalendarDate(formatDate(d));
    },
    onShowHover: (room, e) => showHoverCard(room, e, state),
    onPositionHover: (e) => positionHoverCard(e),
    onHideHover: () => hideHoverCard()
  });
}

async function loadParallelTimelineData() {
  state.fetchStatus = 'LOADING';
  updateBadgeState('loading', '正在获取排课数据...');
  showLoadingPanel(true);
  hideBarrierPanel();
  hideContentArea();

  const payload = {
    campusCode: state.campusCode,
    buildingCode: currentBuildings.map(b => b.code).join(',') || DEFAULT_BUILDINGS,
    date: state.queryDate,
    slots: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  };

  const result = await fetchTimelineData(payload, currentCampus, currentBuildings);

  showLoadingPanel(false);

  // Hard-Fail Check
  if (!result || !result.success || !Array.isArray(result.slotsData)) {
    state.fetchStatus = result?.error || 'NETWORK_ERROR';
    state.isDataLoaded = false;
    showHardFailBarrier(result, state, currentCampus, currentBuildings);
    return;
  }

  state.fetchStatus = 'SUCCESS';
  state.isDataLoaded = true;

  // Process timeline slices
  const processed = mergeAndProcessTimeline(result.slotsData, currentBuildings);
  buildingRoomsMap = processed.buildingRoomsMap;

  updateBadgeState('connected', `数据已更新 · 共 ${processed.totalRoomsFound} 间教室`);
  showContentArea();
  renderMacro();
  renderCabin();
}

// ============================================================================
// 5. 顶栏时钟感知与作息事件
// ============================================================================

function startClock() {
  const liveClockEl = document.getElementById('liveClock');
  const timeMetaEl = document.getElementById('timeMeta');
  const slotBadgeEl = document.getElementById('currentSlotBadge');

  function update() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;

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
      if (isQueryingToday(state.queryDate)) {
        const timeInfo = getCurrentTimeSlotInfo();
        if (timeInfo.type === 'in_session') {
          slotBadgeEl.textContent = `进行中：${timeInfo.slotDef.name} (${timeInfo.slotDef.time})`;
        } else {
          slotBadgeEl.textContent = timeInfo.badgeText;
        }
      } else {
        slotBadgeEl.textContent = `查询指定日期：${state.queryDate}`;
      }
    }
  }

  update();
  setInterval(update, 1000);
}

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
      applyTheme(!state.isDarkTheme, state);
      saveSettings({ theme: state.isDarkTheme ? 'dark' : 'light' });
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

  const btnToggleQr = document.getElementById('btnToggleEmbeddedQr');
  if (btnToggleQr) {
    btnToggleQr.addEventListener('click', () => {
      startEmbeddedQrLoginFlow(() => loadParallelTimelineData());
    });
  }
}

// ============================================================================
// 6. 筛选器与节次矩阵
// ============================================================================

function updateDateControls() {
  const isToday = isQueryingToday(state.queryDate);
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

      if (isQueryingToday(state.queryDate)) {
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
      renderCabin();
    });
  }

  const mediumToggle = document.getElementById('typeMediumToggle');
  if (mediumToggle) {
    mediumToggle.checked = state.roomTypes.medium;
    mediumToggle.addEventListener('change', (e) => {
      state.roomTypes.medium = e.target.checked;
      renderCabin();
    });
  }

  const largeToggle = document.getElementById('typeLargeToggle');
  if (largeToggle) {
    largeToggle.checked = state.roomTypes.large;
    largeToggle.addEventListener('change', (e) => {
      state.roomTypes.large = e.target.checked;
      renderCabin();
    });
  }

  const specialToggle = document.getElementById('typeSpecialToggle');
  if (specialToggle) {
    specialToggle.checked = state.roomTypes.special;
    specialToggle.addEventListener('change', (e) => {
      state.roomTypes.special = e.target.checked;
      renderCabin();
    });
  }
}

function applyPreset(presetName) {
  if (presetName === 'now' && !isQueryingToday(state.queryDate)) {
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
  renderMacro();
  renderCabin();
}

function syncPresetWithSelectedSlots() {
  const slots = state.selectedSlots;
  const curSlot = getCurrentTimeSlot();

  let matchedPreset = 'custom';
  if (isQueryingToday(state.queryDate) && arraysEqual(slots, [curSlot])) {
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
  renderMacro();
  renderCabin();
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
  if (isQueryingToday(state.queryDate) && (state.activePreset === 'now' || arraysEqual(state.selectedSlots, [getCurrentTimeSlot()]))) {
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

// ============================================================================
// 7. 应用程序主入口
// ============================================================================

async function init() {
  recommendationsConfig = await loadRecommendationsConfig();
  campusConfig = await loadCampusConfig(recommendationsConfig);

  initCampusSelector();

  state.selectedSlots = isQueryingToday(state.queryDate) ? [getCurrentTimeSlot()] : [5, 6, 7, 8];

  bindHeaderEvents();
  bindCalendarEvents();
  renderInlineCalendar();
  bindFilterEvents();
  renderSlotsMatrix();
  initHoverCard();
  startClock();
  updateDateControls();
  initWallpaperAndTheme(state);

  // Trigger parallel full fetch
  loadParallelTimelineData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

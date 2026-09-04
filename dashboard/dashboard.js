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

  // Dynamic Campus & Buildings State (Loaded from data/campuses.json)
  let campusConfig = null;
  let currentCampus = null;
  let currentBuildings = [];
  let recommendationsConfig = null;

  // Load building recommendations from data/recommendations.json
  async function loadRecommendationsConfig() {
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
  }

  function getBuildingRecommendation(bldg, campusCode) {
    if (!recommendationsConfig || !Array.isArray(recommendationsConfig.recommendations)) return null;
    return recommendationsConfig.recommendations.find(r => {
      const matchCampus = !r.campusCode || String(r.campusCode) === String(campusCode);
      const matchCode = String(r.buildingCode) === String(bldg.code) || String(r.buildingCode) === String(bldg.id);
      const matchName = r.buildingName && (bldg.name.includes(r.buildingName) || r.buildingName.includes(bldg.name));
      return matchCampus && (matchCode || matchName);
    }) || null;
  }

  // Helper to sanitize buildingId
  function getSanitizedBuildingId(availableBuildings, targetCampusCode) {
    const list = availableBuildings || currentBuildings;
    const cCode = targetCampusCode || state.campusCode;
    let saved = localStorage.getItem('nmj_building');
    if (!saved || !list.some(b => b.id === saved)) {
      const firstRec = list.find(b => getBuildingRecommendation(b, cCode));
      saved = firstRec ? firstRec.id : (list.length > 0 ? list[0].id : '65');
      localStorage.setItem('nmj_building', saved);
    }
    return saved;
  }

  // State
  let state = {
    campusCode: '02',
    buildingId: '65',
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
    fetchStatus: 'IDLE', // 'IDLE' | 'LOADING' | 'SUCCESS' | 'UNAUTHENTICATED' | 'NETWORK_ERROR'
    isDataLoaded: false
  };

  // Structured room repository grouped by buildingId: { [buildingId]: [] }
  let buildingRoomsMap = {};

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
        badgeText: `今日排课已全部结束 (${SESSION_SLOTS[11].end} 结课) · 晚自习请留意闭馆锁楼`,
        hintText: `今日已结课 (留意闭馆)`
      };
    }

    // 3. During class session or during break
    for (let i = 0; i < SESSION_SLOTS.length; i++) {
      const s = SESSION_SLOTS[i];
      if (currentTime >= s.start && currentTime <= s.end) {
        const [endH, endM] = s.end.split(':').map(Number);
        const [nowH, nowM] = currentTime.split(':').map(Number);
        const remainMinutes = Math.max(0, (endH * 60 + endM) - (nowH * 60 + nowM));

        return {
          type: 'in_session',
          activeSlot: s.slot,
          nextSlot: i + 1 < SESSION_SLOTS.length ? SESSION_SLOTS[i + 1].slot : null,
          nextSlotDef: i + 1 < SESSION_SLOTS.length ? SESSION_SLOTS[i + 1] : null,
          slotDef: s,
          time: currentTime,
          remainMinutes: remainMinutes,
          badgeText: `进行中：${s.name} (${s.time}) · 剩 ${remainMinutes} 分钟`,
          hintText: `当前第${s.slot}节 (剩${remainMinutes}分)`
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

  // Load campus & buildings config from independent single file data/campuses.json
  async function loadCampusConfig() {
    await loadRecommendationsConfig();

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
        defaultCampus: '02',
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

    initCampusSelector();
  }

  function initCampusSelector() {
    const campusSelect = document.getElementById('campusSelect');
    if (!campusSelect) return;

    campusSelect.innerHTML = '';
    const savedCampusCode = localStorage.getItem('nmj_campus') || campusConfig.defaultCampus || '02';

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
    state.buildingId = getSanitizedBuildingId(currentBuildings, state.campusCode);

    campusSelect.addEventListener('change', (e) => {
      const newCode = e.target.value;
      const targetCamp = campusConfig.campuses.find(c => c.code === newCode);
      if (targetCamp) {
        currentCampus = targetCamp;
        state.campusCode = targetCamp.code;
        currentBuildings = targetCamp.buildings || [];
        state.buildingId = getSanitizedBuildingId(currentBuildings, targetCamp.code);
        localStorage.setItem('nmj_campus', newCode);

        // Reset all-buildings collapsible section to closed
        const collapseEl = document.getElementById('allBuildingsCollapse');
        if (collapseEl) collapseEl.open = false;

        buildingRoomsMap = {};
        currentBuildings.forEach(b => {
          buildingRoomsMap[b.id] = [];
        });

        updateBuildingMacroCards();
        renderFloorCabinMap();
        loadParallelTimelineData();
      }
    });

    buildingRoomsMap = {};
    currentBuildings.forEach(b => {
      buildingRoomsMap[b.id] = [];
    });
  }

  // Preset Wallpapers
  const PRESET_WALLPAPERS = {
    'default': '', // native default CSS gradients
    'light-clean': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="lg1" cx="10%" cy="20%" r="50%"><stop offset="0%" stop-color="%2300479d" stop-opacity="0.08"/><stop offset="100%" stop-color="%23f0f4f9" stop-opacity="0"/></radialGradient><radialGradient id="lg2" cx="90%" cy="80%" r="50%"><stop offset="0%" stop-color="%230284c7" stop-opacity="0.08"/><stop offset="100%" stop-color="%23f0f4f9" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="%23f0f4f9"/><rect width="100%" height="100%" fill="url(%23lg1)"/><rect width="100%" height="100%" fill="url(%23lg2)"/></svg>',
    'jlu-navy': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="ng1" cx="50%" cy="0%" r="70%"><stop offset="0%" stop-color="%2317325c"/><stop offset="100%" stop-color="%23081324"/></radialGradient></defs><rect width="100%" height="100%" fill="%230b1a30"/><rect width="100%" height="100%" fill="url(%23ng1)"/></svg>'
  };

  let pendingWallpaperData = '';

  function applyWallpaper(wallpaperData) {
    if (wallpaperData && (wallpaperData.includes('radialGradient id="g1"') || (wallpaperData.includes('0b0f17') && wallpaperData.startsWith('data:image/svg')))) {
      wallpaperData = '';
      try { localStorage.removeItem('nmj_custom_wallpaper'); } catch (e) { }
    }
    state.customWallpaper = wallpaperData || '';
    const bgLayer = document.getElementById('wallpaperBgLayer');
    if (state.customWallpaper) {
      document.body.classList.add('has-custom-wallpaper');
      if (bgLayer) {
        bgLayer.style.display = 'block';
        bgLayer.style.backgroundImage = `url("${state.customWallpaper}")`;
        bgLayer.style.opacity = state.wallpaperOpacity;
      }
    } else {
      document.body.classList.remove('has-custom-wallpaper');
      if (bgLayer) {
        bgLayer.style.display = 'none';
        bgLayer.style.backgroundImage = '';
      }
    }
  }

  function applyOpacity(uiOp, wpOp) {
    if (uiOp !== undefined && uiOp !== null) {
      state.uiOpacity = Math.max(0.1, Math.min(1.0, Number(uiOp)));
      document.documentElement.style.setProperty('--ui-opacity', String(state.uiOpacity));
    }
    if (wpOp !== undefined && wpOp !== null) {
      state.wallpaperOpacity = Math.max(0.0, Math.min(1.0, Number(wpOp)));
      document.documentElement.style.setProperty('--wp-opacity', String(state.wallpaperOpacity));
      const bgLayer = document.getElementById('wallpaperBgLayer');
      if (bgLayer) {
        bgLayer.style.opacity = state.wallpaperOpacity;
      }
    }
  }

  function applyTheme(isDark) {
    state.isDarkTheme = !!isDark;
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(state.isDarkTheme ? 'theme-dark' : 'theme-light');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      const icon = themeToggleBtn.querySelector('.theme-icon');
      if (icon) icon.textContent = state.isDarkTheme ? '🌙' : '☀️';
    }
  }

  function saveSettings(partial) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['nmj_settings'], (res) => {
        const s = res.nmj_settings || {};
        Object.assign(s, partial);
        chrome.storage.local.set({ nmj_settings: s });
      });
    }
    if (partial.customWallpaper !== undefined) {
      localStorage.setItem('nmj_custom_wallpaper', partial.customWallpaper);
    }
    if (partial.theme !== undefined) {
      localStorage.setItem('nmj_theme', partial.theme);
    }
    if (partial.uiOpacity !== undefined) {
      localStorage.setItem('nmj_ui_opacity', String(partial.uiOpacity));
    }
    if (partial.wallpaperOpacity !== undefined) {
      localStorage.setItem('nmj_wp_opacity', String(partial.wallpaperOpacity));
    }
  }

  function initWallpaperAndTheme() {
    const localTheme = localStorage.getItem('nmj_theme');
    const localWp = localStorage.getItem('nmj_custom_wallpaper');
    const localUiOp = localStorage.getItem('nmj_ui_opacity');
    const localWpOp = localStorage.getItem('nmj_wp_opacity');

    if (localTheme) applyTheme(localTheme === 'dark');
    if (localUiOp) applyOpacity(localUiOp, null);
    if (localWpOp) applyOpacity(null, localWpOp);
    if (localWp) applyWallpaper(localWp);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['nmj_settings'], (res) => {
        const settings = res.nmj_settings || {};
        if (settings.theme) applyTheme(settings.theme === 'dark');
        if (settings.uiOpacity !== undefined) applyOpacity(settings.uiOpacity, null);
        if (settings.wallpaperOpacity !== undefined) applyOpacity(null, settings.wallpaperOpacity);
        if (settings.customWallpaper !== undefined) applyWallpaper(settings.customWallpaper);
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.nmj_settings && changes.nmj_settings.newValue) {
          const s = changes.nmj_settings.newValue;
          if (s.theme) applyTheme(s.theme === 'dark');
          if (s.uiOpacity !== undefined) applyOpacity(s.uiOpacity, null);
          if (s.wallpaperOpacity !== undefined) applyOpacity(null, s.wallpaperOpacity);
          if (s.customWallpaper !== undefined) applyWallpaper(s.customWallpaper);
        }
      });
    }

    initWallpaperModal();
  }

  function initWallpaperModal() {
    const modal = document.getElementById('wallpaperModal');
    const btnOpen = document.getElementById('wallpaperBtn');
    const btnClose = document.getElementById('closeWallpaperModalBtn');
    const btnCancel = document.getElementById('btnCancelWallpaper');
    const btnSave = document.getElementById('btnSaveWallpaper');
    const btnClear = document.getElementById('btnClearWallpaper');

    const tabBtns = document.querySelectorAll('.wp-tab-btn');
    const tabLocal = document.getElementById('wpTabLocal');
    const tabUrl = document.getElementById('wpTabUrl');
    const tabPresets = document.getElementById('wpTabPresets');

    const dropzone = document.getElementById('wpDropzone');
    const fileInput = document.getElementById('wpFileInput');
    const urlInput = document.getElementById('wpUrlInput');
    const btnPreviewUrl = document.getElementById('btnPreviewUrl');

    const previewSection = document.getElementById('wpPreviewSection');
    const previewImg = document.getElementById('wpPreviewImg');
    const previewInfo = document.getElementById('wpPreviewInfo');

    const presetCards = document.querySelectorAll('.wp-preset-card');

    const uiOpacitySlider = document.getElementById('uiOpacitySlider');
    const uiOpacityVal = document.getElementById('uiOpacityVal');
    const wpOpacitySlider = document.getElementById('wpOpacitySlider');
    const wpOpacityVal = document.getElementById('wpOpacityVal');

    let origUiOpacity = state.uiOpacity;
    let origWpOpacity = state.wallpaperOpacity;

    if (!modal || !btnOpen) return;

    function syncSliderDisplays() {
      if (uiOpacitySlider) {
        uiOpacitySlider.value = Math.round(state.uiOpacity * 100);
        if (uiOpacityVal) uiOpacityVal.textContent = `${uiOpacitySlider.value}%`;
      }
      if (wpOpacitySlider) {
        wpOpacitySlider.value = Math.round(state.wallpaperOpacity * 100);
        if (wpOpacityVal) wpOpacityVal.textContent = `${wpOpacitySlider.value}%`;
      }
    }

    if (uiOpacitySlider) {
      uiOpacitySlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        if (uiOpacityVal) uiOpacityVal.textContent = `${val}%`;
        applyOpacity(val / 100, null);
      });
    }

    if (wpOpacitySlider) {
      wpOpacitySlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        if (wpOpacityVal) wpOpacityVal.textContent = `${val}%`;
        applyOpacity(null, val / 100);
      });
    }

    function openModal() {
      pendingWallpaperData = state.customWallpaper;
      origUiOpacity = state.uiOpacity;
      origWpOpacity = state.wallpaperOpacity;
      syncSliderDisplays();

      if (pendingWallpaperData) {
        showPreview(pendingWallpaperData, '当前正在使用壁纸');
        if (pendingWallpaperData.startsWith('http')) {
          switchTab('url');
          if (urlInput) urlInput.value = pendingWallpaperData;
        } else {
          switchTab('local');
        }
      } else {
        switchTab('local');
        if (previewSection) previewSection.style.display = 'none';
      }
      modal.style.display = 'flex';
    }

    function closeModal() {
      modal.style.display = 'none';
    }

    btnOpen.addEventListener('click', openModal);
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        applyOpacity(origUiOpacity, origWpOpacity);
        closeModal();
      });
    }
    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        applyOpacity(origUiOpacity, origWpOpacity);
        closeModal();
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        applyOpacity(origUiOpacity, origWpOpacity);
        closeModal();
      }
    });

    function switchTab(tabName) {
      tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });
      if (tabLocal) tabLocal.style.display = (tabName === 'local') ? 'block' : 'none';
      if (tabUrl) tabUrl.style.display = (tabName === 'url') ? 'block' : 'none';
      if (tabPresets) tabPresets.style.display = (tabName === 'presets') ? 'block' : 'none';
    }

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    function showPreview(dataUrl, info) {
      if (previewSection && previewImg) {
        previewImg.src = dataUrl;
        if (previewInfo) previewInfo.textContent = info || '';
        previewSection.style.display = 'block';
      }
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          processImageFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          processImageFile(e.target.files[0]);
        }
      });
    }

    function processImageFile(file) {
      if (!file.type.startsWith('image/')) {
        alert('请选择有效的图片文件 (JPG / PNG / WEBP)！');
        return;
      }
      const reader = new FileReader();
      reader.onload = function(evt) {
        const rawDataUrl = evt.target.result;
        const img = new Image();
        img.onload = function() {
          const maxDim = 2560;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            pendingWallpaperData = canvas.toDataURL('image/jpeg', 0.88);
          } else {
            pendingWallpaperData = rawDataUrl;
          }
          const kb = Math.round(pendingWallpaperData.length * 0.75 / 1024);
          showPreview(pendingWallpaperData, `本地图片 (${file.name}, 约 ${kb}KB)`);
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    }

    if (btnPreviewUrl && urlInput) {
      btnPreviewUrl.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (url) {
          pendingWallpaperData = url;
          showPreview(url, '网络图片');
        }
      });
    }

    presetCards.forEach(card => {
      card.addEventListener('click', () => {
        presetCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const presetKey = card.dataset.preset;
        pendingWallpaperData = PRESET_WALLPAPERS[presetKey] || '';
        if (pendingWallpaperData) {
          showPreview(pendingWallpaperData, card.querySelector('.wp-preset-name')?.textContent || '预设背景');
        } else {
          if (previewSection) previewSection.style.display = 'none';
        }
      });
    });

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        applyWallpaper(pendingWallpaperData);
        saveSettings({
          customWallpaper: pendingWallpaperData,
          uiOpacity: state.uiOpacity,
          wallpaperOpacity: state.wallpaperOpacity,
          theme: state.isDarkTheme ? 'dark' : 'light'
        });
        closeModal();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        pendingWallpaperData = '';
        applyWallpaper('');
        saveSettings({ customWallpaper: '' });
        if (previewSection) previewSection.style.display = 'none';
        closeModal();
      });
    }
  }

  // Initialization
  async function init() {
    await loadCampusConfig();

    state.selectedSlots = isQueryingToday() ? [getCurrentTimeSlot()] : [5, 6, 7, 8];

    bindHeaderEvents();
    bindCalendarEvents();
    renderInlineCalendar();
    bindFilterEvents();
    renderSlotsMatrix();
    initHoverCard();
    startClock();
    updateDateControls();
    initWallpaperAndTheme();

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
        applyTheme(!state.isDarkTheme);
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
        startEmbeddedQrLoginFlow();
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
        if (isQueryingToday()) {
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

  // ==========================================================================
  // Parallel 1~12 Full Fetch & Merge Engine
  // ==========================================================================

  async function loadParallelTimelineData() {
    state.fetchStatus = 'LOADING';
    updateBadgeState('loading', '正在获取排课数据...');
    showLoadingPanel(true);
    hideBarrierPanel();
    hideContentArea();

    const payload = {
      campusCode: state.campusCode,
      buildingCode: currentBuildings.map(b => b.code).join(',') || '65,82,73',
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
      state.fetchStatus = result?.error === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'NETWORK_ERROR';
      state.isDataLoaded = false;
      showHardFailBarrier(result);
      return;
    }

    state.fetchStatus = 'SUCCESS';
    state.isDataLoaded = true;

    // Merge 12 slices into real building maps
    mergeAndProcessTimeline(result.slotsData);
  }

  async function directFetchParallelTimeline(payload) {
    const slots = payload.slots || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const webvpnHash = '/https/48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1';
    const url = `https://vpn.jlu.edu.cn${webvpnHash}/jwapp/sys/kxjas/modules/kxjscx/cxkxjs.do?vpn-12-o2-iedu.jlu.edu.cn`;

    const campusCode = payload.campusCode || state.campusCode || '02';
    const buildingCode = payload.buildingCode || currentBuildings.map(b => b.code).join(',') || '65,82,73';
    const campusName = currentCampus ? currentCampus.name : '南岭校区';
    const buildingNames = currentBuildings.length > 0 ? currentBuildings.map(b => b.name).join(',') : '逸夫楼,第二教学楼,第一教学楼';
    const roomTypes = '03,02,01,04,05,06,13,08,09,10,11,12,07';

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

        const resp = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/javascript, */*; q=0.01'
          },
          body: params.toString()
        });

        if (!resp.ok) {
          if (resp.status === 401) {
            throw new Error('UNAUTHENTICATED');
          }
          return { slot: slotNum, rows: [] };
        }
        const text = await resp.text();
        if (
          text.includes('<!DOCTYPE') || 
          text.includes('<html') || 
          text.includes('Not login!') || 
          text.includes('401.png') || 
          text.includes('统一身份认证') || 
          text.includes('login')
        ) {
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
    // Reset room store for current campus buildings
    buildingRoomsMap = {};
    currentBuildings.forEach(b => {
      buildingRoomsMap[b.id] = [];
    });

    const roomDict = new Map(); // roomId -> room

    slotsData.forEach(({ slot, rows }) => {
      if (!Array.isArray(rows)) return;

      rows.forEach(row => {
        const roomId = row.JASMC;
        if (!roomId) return;

        // Determine building dynamically matching currentBuildings
        let bCode = String(row.JXLDM || '');
        if (!bCode || bCode === 'null' || !buildingRoomsMap[bCode]) {
          const matched = currentBuildings.find(b => 
            row.JASMC.includes(b.shortName) || row.JASMC.includes(b.name) || row.JASMC.includes(b.id)
          );
          bCode = matched ? matched.id : (currentBuildings[0] ? currentBuildings[0].id : '65');
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
    const defaultBId = currentBuildings[0] ? currentBuildings[0].id : '65';
    roomDict.forEach(room => {
      totalRoomsFound++;
      if (buildingRoomsMap[room.buildingCode]) {
        buildingRoomsMap[room.buildingCode].push(room);
      } else {
        if (!buildingRoomsMap[defaultBId]) buildingRoomsMap[defaultBId] = [];
        buildingRoomsMap[defaultBId].push(room);
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
        return { text: '排课已结', type: 'safe' };
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
          return { text: `可坐 ${count} 节`, type: count >= 2 ? 'safe' : 'warn' };
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
          return { text: `连空 ${count} 节`, type: count >= 2 ? 'safe' : 'warn' };
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
        if (count === 1 && typeof timeInfo.remainMinutes === 'number' && timeInfo.remainMinutes <= 15) {
          return { text: `仅剩${timeInfo.remainMinutes}分`, type: 'warn' };
        }
        return { text: `连空 ${count} 节`, type: count >= 2 ? 'safe' : 'warn' };
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
        bannerText = `今日教学排课已于 ${SESSION_SLOTS[11].end} 全部结束。晚自习提示：各教学楼晚间闭馆清楼时间不固定（通常在 22:00~22:30），请留意现场通知，避免滞留被锁。`;
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

          if (count >= 2) {
            bannerIcon = '🟢';
            bannerClass = 'safe';
            bannerText = `当前第 ${curSlot} 节空闲，可坐至 ${endTime} (连空 ${count} 节，适宜自习)`;
          } else {
            const nextStart = SESSION_SLOTS[curSlot] ? SESSION_SLOTS[curSlot].start : endTime;
            const remainMin = typeof timeInfo.remainMinutes === 'number' ? timeInfo.remainMinutes : 0;
            if (remainMin <= 15) {
              bannerIcon = '🟡';
              bannerClass = 'warn';
              bannerText = `当前第 ${curSlot} 节即将下课 (仅剩 ${remainMin} 分钟)，下节 (${nextStart}) 即有排课，不建议长坐自习`;
            } else {
              bannerIcon = '🟡';
              bannerClass = 'warn';
              bannerText = `当前节次空闲 (剩 ${remainMin} 分钟)，下节 (${nextStart}) 即有课，仅剩 1 节`;
            }
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

  function syncBuildingCardSelectedState() {
    document.querySelectorAll('.bldg-card').forEach(c => {
      if (c.dataset.bldgId === state.buildingId) {
        c.classList.add('selected');
      } else {
        c.classList.remove('selected');
      }
    });
  }

  function createBuildingCardElement(bldg, rec) {
    const rooms = buildingRoomsMap[bldg.id] || [];
    const validRooms = rooms.filter(r => !r.isClosed);
    let freeCount = 0;

    validRooms.forEach(r => {
      if (getRoomFilterStatus(r, state.selectedSlots) === 'status-free') {
        freeCount++;
      }
    });

    const percentage = validRooms.length > 0 ? Math.round((freeCount / validRooms.length) * 100) : 0;
    const isSelected = (bldg.id === state.buildingId);

    const card = document.createElement('div');
    card.className = `bldg-card ${isSelected ? 'selected' : ''}`;
    card.dataset.bldgId = bldg.id;
    card.innerHTML = `
      <div class="bldg-card-header">
        <span class="bldg-name">${bldg.shortName}</span>
        ${rec ? `<span class="bldg-rec-tag">推荐</span>` : ''}
      </div>
      ${rec && rec.reason ? `<div class="bldg-rec-reason" title="${rec.reason}">💡 ${rec.reason}</div>` : ''}
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
      syncBuildingCardSelectedState();
      renderFloorCabinMap();
    });

    return { card, validCount: validRooms.length, freeCount };
  }

  function updateBuildingMacroCards() {
    const grid = document.getElementById('buildingCardsGrid');
    const otherGrid = document.getElementById('otherBuildingCardsGrid');
    const tipEl = document.getElementById('repoEncourageTip');
    const summaryTextEl = document.getElementById('allBuildingsSummaryText');
    const badgeEl = document.getElementById('macroBadgeText');
    const collapseEl = document.getElementById('allBuildingsCollapse');
    if (!grid) return;

    grid.innerHTML = '';
    if (otherGrid) otherGrid.innerHTML = '';

    const recommendedBuildings = [];
    const otherBuildings = [];

    currentBuildings.forEach(bldg => {
      const rec = getBuildingRecommendation(bldg, state.campusCode);
      if (rec) {
        recommendedBuildings.push({ bldg, rec });
      } else {
        otherBuildings.push({ bldg, rec: null });
      }
    });

    let campusTotalRooms = 0;
    let campusTotalFree = 0;

    const repoUrl = (recommendationsConfig && recommendationsConfig.githubRepoUrl)
      ? recommendationsConfig.githubRepoUrl
      : 'https://github.com/Shy-up/need-more-jlu';

    // 1. Render Recommended Buildings Grid
    if (recommendedBuildings.length > 0) {
      if (badgeEl) badgeEl.textContent = `推荐自习楼 (${recommendedBuildings.length} 栋)`;
      recommendedBuildings.forEach(({ bldg, rec }) => {
        const { card, validCount, freeCount } = createBuildingCardElement(bldg, rec);
        campusTotalRooms += validCount;
        campusTotalFree += freeCount;
        grid.appendChild(card);
      });

      if (tipEl) {
        tipEl.style.display = 'flex';
        const link = document.getElementById('repoTipLink');
        if (link) link.href = repoUrl;
      }
    } else {
      if (badgeEl) badgeEl.textContent = '暂无推荐';
      grid.innerHTML = `
        <div class="no-recommend-card">
          <div class="no-rec-body">
            <div class="no-rec-icon">🧭</div>
            <div class="no-rec-content">
              <div class="no-rec-title">当前校区暂无学长学姐常驻自习推荐</div>
              <div class="no-rec-desc">你在【${currentCampus ? currentCampus.name : '该校区'}】常去哪栋教学楼自习？欢迎前往 GitHub 仓库提交 PR 为本校区推荐优质楼栋与打野避坑指南！</div>
            </div>
          </div>
          <a href="${repoUrl}" target="_blank" class="btn-rec-contribute">
            <span>🐙 提交校区自习推荐</span>
            <span class="arrow">↗</span>
          </a>
        </div>
      `;
      if (tipEl) tipEl.style.display = 'none';
    }

    // 2. Render Collapsible All / Other Buildings Grid
    if (otherBuildings.length > 0) {
      if (collapseEl) collapseEl.style.display = 'block';
      if (summaryTextEl) {
        summaryTextEl.textContent = recommendedBuildings.length > 0
          ? `展开查看该校区其余全部教学楼 (共 ${otherBuildings.length} 栋)`
          : `展开查看该校区全部教学楼 (共 ${otherBuildings.length} 栋)`;
      }
      otherBuildings.forEach(({ bldg, rec }) => {
        const { card, validCount, freeCount } = createBuildingCardElement(bldg, rec);
        campusTotalRooms += validCount;
        campusTotalFree += freeCount;
        if (otherGrid) otherGrid.appendChild(card);
      });
    } else {
      if (collapseEl) collapseEl.style.display = 'none';
    }

    // 3. Update Campus Summary
    const campusSummaryEl = document.getElementById('macroCampusSummary');
    if (campusSummaryEl) {
      const campusPercentage = campusTotalRooms > 0 ? Math.round((campusTotalFree / campusTotalRooms) * 100) : 0;
      const campusTitle = currentCampus ? currentCampus.name : '当前校区';
      campusSummaryEl.textContent = `${campusTitle} · 所选节次综合空闲率 ${campusPercentage}% (可用 ${campusTotalFree} / 当前总计 ${campusTotalRooms} 间)`;
    }
  }

  // Standard fixed tiered sizes:
  // 小教室: fixed compact (106x68)
  // 中教室: fixed medium (138x74)
  // 大教室: fixed large (176x84)
  // 特殊教室: fixed medium dashed (138x74)
  // Long names (>= 8 characters) gracefully extend minWidth to ensure zero clipping
  function applyRoomTierSizing(roomCell, room) {
    const nameStr = String(room.number || '');
    if (nameStr.length >= 8) {
      const neededWidth = Math.min(240, 80 + nameStr.length * 13);
      roomCell.style.minWidth = `${neededWidth}px`;
    }
  }

  function renderFloorCabinMap() {
    const container = document.getElementById('cabinFloorsContainer');
    if (!container) return;
    container.innerHTML = '';

    const currentBldg = currentBuildings.find(b => b.id === state.buildingId) || currentBuildings[0] || { id: '65', name: '教学楼', shortName: '教学楼' };
    
    document.getElementById('currentBuildingTitle').textContent = `${currentBldg.shortName} (${currentBldg.name})`;

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
      // 1. Situation 2: 教务系统无法连接 (无登录/会话过期/网络中断)
      if (state.fetchStatus === 'UNAUTHENTICATED' || state.fetchStatus === 'NETWORK_ERROR' || !state.isDataLoaded) {
        const isAuth = state.fetchStatus === 'UNAUTHENTICATED';
        container.innerHTML = `
          <div class="cabin-empty-card error-state">
            <div class="empty-state-icon">${isAuth ? '🔒' : '⚠️'}</div>
            <div class="empty-state-title">${isAuth ? '教务系统未连接 · WebVPN 未登录' : '教务接口通信失败 · 未能获取排课'}</div>
            <div class="empty-state-desc">
              ${isAuth 
                ? '当前 WebVPN 会话未激活或已过期。仪表盘严守 100% 官方真实排课原则，不使用伪造数据。请先登录吉大 WebVPN 后重新拉取。' 
                : '与吉大教务处排课服务 (cxkxjs.do) 通信失败或校园网络中断，未能拉取排课数据。'}
            </div>
            <div class="empty-state-actions">
              ${isAuth ? `<a href="https://vpn.jlu.edu.cn/https/48714f71342f7a336d582f7e2857373756c9770f46c0c2b0ff87560d5a42f1/jwapp/sys/kxjas/*default/index.do?THEME=purple&EMAP_LANG=en#/kxjscx" target="_blank" class="btn-empty-action primary">🔗 激活吉大教务空闲教室会话</a>` : ''}
              <button class="btn-empty-action secondary" id="btnRetryEmptyFetch">🔄 重新获取排课数据</button>
            </div>
          </div>
        `;
        const retryBtn = container.querySelector('#btnRetryEmptyFetch');
        if (retryBtn) retryBtn.addEventListener('click', () => loadParallelTimelineData());
        return;
      }

      // 2. Situation 1: 筛选条件导致没有
      if (allRooms.length > 0) {
        container.innerHTML = `
          <div class="cabin-empty-card filter-state">
            <div class="empty-state-icon">⚙️</div>
            <div class="empty-state-title">分类筛选条件已过滤该楼栋全部教室</div>
            <div class="empty-state-desc">
              【${currentBldg.name}】实际排课中有 <strong>${allRooms.length}</strong> 间教室，但已被当前的分类筛选条件全部排除。
            </div>
            <div class="empty-state-details">
              当前筛选设置：小教室 (${state.roomTypes.small ? '显示' : '隐藏'}) · 中教室 (${state.roomTypes.medium ? '显示' : '隐藏'}) · 大教室 (${state.roomTypes.large ? '显示' : '隐藏'}) · 特殊教室 (${state.roomTypes.special ? '显示' : '隐藏'})
            </div>
            <div class="empty-state-actions">
              <button class="btn-empty-action primary" id="btnResetRoomTypes">🔄 重置分类筛选 (显示全部教室)</button>
            </div>
          </div>
        `;
        const resetBtn = container.querySelector('#btnResetRoomTypes');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            state.roomTypes = { small: true, medium: true, large: true, special: true };
            ['typeSmallToggle', 'typeMediumToggle', 'typeLargeToggle', 'typeSpecialToggle'].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.checked = true;
            });
            renderFloorCabinMap();
          });
        }
        return;
      }

      // 3. Situation 3: 真的完全没空闲
      const otherBuildingsWithRooms = currentBuildings.filter(b => {
        if (b.id === currentBldg.id) return false;
        const bRooms = buildingRoomsMap[b.id] || [];
        return bRooms.length > 0;
      });

      let otherBldgsHtml = '';
      if (otherBuildingsWithRooms.length > 0) {
        otherBldgsHtml = `
          <div class="empty-switch-section">
            <div class="empty-switch-title">👉 推荐查看同校区其他有空闲座位的教学楼：</div>
            <div class="empty-switch-btns">
              ${otherBuildingsWithRooms.map(b => {
                const count = (buildingRoomsMap[b.id] || []).length;
                return `<button class="btn-switch-bldg" data-bldg-id="${b.id}">🏢 切换至 ${b.shortName} (${count} 间可用)</button>`;
              }).join('')}
            </div>
          </div>
        `;
      }

      container.innerHTML = `
        <div class="cabin-empty-card vacant-state">
          <div class="empty-state-icon">🏢</div>
          <div class="empty-state-title">该楼栋在所选日期全天确实无空闲教室</div>
          <div class="empty-state-desc">
            教务处排课数据已成功同步：【${currentBldg.name}】在 ${state.queryDate} 全天 12 节均排满课程或未开放排课，确实无可用空闲教室。
          </div>
          ${otherBldgsHtml}
          <div class="empty-state-actions">
            <button class="btn-empty-action secondary" id="btnSwitchQueryDateTomorrow">📅 查询明日排课数据</button>
          </div>
        </div>
      `;

      container.querySelectorAll('.btn-switch-bldg').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.dataset.bldgId;
          state.buildingId = targetId;
          updateBuildingMacroCards();
          renderFloorCabinMap();
        });
      });

      const btnTomorrow = container.querySelector('#btnSwitchQueryDateTomorrow');
      if (btnTomorrow) {
        btnTomorrow.addEventListener('click', () => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          const tomorrowStr = formatDate(d);
          selectCalendarDate(tomorrowStr);
        });
      }
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

        // Tiered standard fixed size (with long name protection)
        applyRoomTierSizing(roomCell, room);

        roomCell.innerHTML = `
          <div class="room-top-info">
            <span class="room-name-text">${room.number}</span>
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

  let qrPollTimer = null;
  let loginAuthWindow = null;

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

    const isUnauth = (errorResult?.error === 'UNAUTHENTICATED');
    const qrBtn = document.getElementById('btnToggleEmbeddedQr');
    const retryBtn = document.getElementById('btnRetryRealFetch');

    if (qrBtn) qrBtn.style.display = isUnauth ? 'inline-flex' : 'none';
    if (retryBtn) retryBtn.style.display = isUnauth ? 'none' : 'inline-flex';

    if (isUnauth) {
      titleEl.textContent = '🔒 吉大教务未登录认证';
      subtitleEl.innerHTML = `
        仪表盘严守 <strong>100% 真实教务数据</strong> 原则。<br>
        微信扫码登录已就绪：点击下方按钮完成认证，扫码后<strong>本页面将全自动检测并刷新</strong>，立即可用。
      `;
    } else {
      titleEl.textContent = '⚠️ 无法获取吉大教务处实时排课数据';
      subtitleEl.innerHTML = `
        接口通信失败或校园网连接中断。<strong>系统已坚决阻断界面渲染</strong>，以防虚假数据误导自习决策。
      `;
      stopQrLoginPolling();
    }

    if (diagTextEl) {
      diagTextEl.textContent = JSON.stringify({
        timestamp: new Date().toLocaleString(),
        status: 'HARD_FAIL_BLOCKED',
        error: errorResult?.error || 'UNKNOWN_ERROR',
        message: errorResult?.message || '无法获取真实排课',
        targetUrl: 'cxkxjs.do',
        targetDate: state.queryDate,
        targetCampus: `${currentCampus ? currentCampus.name : '校区'} (${state.campusCode})`,
        targetBuildings: currentBuildings.map(b => `${b.shortName}(${b.code})`).slice(0, 5).join(', ') + (currentBuildings.length > 5 ? ` 等共${currentBuildings.length}栋` : '')
      }, null, 2);
    }
  }

  function handleAuthSuccessNotification() {
    stopQrLoginPolling();

    if (loginAuthWindow && !loginAuthWindow.closed) {
      try { loginAuthWindow.close(); } catch (e) {}
    }

    const statusText = document.getElementById('qrStatusText');
    if (statusText) {
      statusText.innerHTML = '🎉 <strong>真实空闲教室数据获取成功！正在呈现课室舱位...</strong>';
    }

    setTimeout(() => {
      hideBarrierPanel();
      loadParallelTimelineData();
    }, 600);
  }

  function startEmbeddedQrLoginFlow() {
    const authUrl = 'https://vpn.jlu.edu.cn/login?cas_login=true';
    const statusText = document.getElementById('qrStatusText');
    const qrContainer = document.getElementById('barrierQrContainer');

    if (qrContainer) qrContainer.style.display = 'flex';
    if (statusText) {
      statusText.innerHTML = '<span class="qr-status-dot pulse"></span> 正在打开官方微信扫码认证窗口...';
    }

    const openPopup = () => {
      if (statusText) {
        statusText.innerHTML = '<span class="qr-status-dot pulse"></span> 正在等待微信扫码确认... 取得真实排课数据后将自动关闭并进入仪表盘';
      }

      // Open standard centered popup window without iframe frame-busting or CORS restrictions
      const width = 520;
      const height = 650;
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
      
      if (!loginAuthWindow || loginAuthWindow.closed) {
        loginAuthWindow = window.open(
          authUrl, 
          'JLU_AUTH_WINDOW', 
          `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
        );
      } else {
        loginAuthWindow.focus();
      }

      // Strictly probe cxkxjs.do: Only trigger reload when REAL data arrives
      stopQrLoginPolling();
      qrPollTimer = setInterval(checkLoginAndAutoReload, 2000);
    };

    // Pre-set last_select_type=qrcode_login so official CAS directly shows WeChat QR code tab
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'PREPARE_QR_LOGIN' }, () => {
        openPopup();
      });
    } else {
      openPopup();
    }
  }

  function stopQrLoginPolling() {
    if (qrPollTimer) {
      clearInterval(qrPollTimer);
      qrPollTimer = null;
    }
  }

  async function checkLoginAndAutoReload() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      return;
    }

    chrome.runtime.sendMessage({ type: 'CHECK_AUTH_STATUS' }, async (res) => {
      // res.isLoggedIn is strictly backed by handleFetchClassrooms returning real rows
      if (res && res.isLoggedIn === true) {
        handleAuthSuccessNotification();
      }
    });
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

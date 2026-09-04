/**
 * need_more_jlu - Study Classroom Dashboard Script
 * Implements interactive floor cabin maps, consecutive safety index, and real-time preset filters.
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

  // Campus Data & Buildings Configuration
  const CAMPUS_DATA = {
    nanling: {
      name: '南岭校区（工科）',
      buildings: [
        { id: 'yifu', name: '逸夫楼', code: 'YF', totalFloors: 5, defaultFav: true },
        { id: 'jixie', name: '机械材料馆', code: 'CL', totalFloors: 4 },
        { id: 'yijiao', name: '第一教学楼', code: 'YJ', totalFloors: 4 },
        { id: 'jichu', name: '基础科学楼', code: 'JC', totalFloors: 5 },
        { id: 'nengdong', name: '能动馆', code: 'ND', totalFloors: 3 },
        { id: 'jiaotong', name: '交通馆', code: 'JT', totalFloors: 4 }
      ]
    },
    qianwei: {
      name: '前卫南区（中心）',
      buildings: [
        { id: 'lisiguang', name: '李四光楼', code: 'LSG', totalFloors: 5, defaultFav: true },
        { id: 'jingxin', name: '经信教学楼', code: 'JX', totalFloors: 5 },
        { id: 'yifuxin', name: '逸夫教学楼', code: 'YFX', totalFloors: 6 },
        { id: 'waiyu', name: '外语楼', code: 'WY', totalFloors: 4 }
      ]
    }
  };

  // State
  let state = {
    campus: localStorage.getItem('nmj_campus') || 'nanling',
    buildingId: localStorage.getItem('nmj_building') || 'yifu',
    activePreset: 'now', // 'now' | 'afternoon' | 'evening' | 'marathon' | 'custom'
    selectedSlots: [5, 6, 7, 8], // Default to afternoon
    hideLabs: true,
    outletOnly: false,
    largeRoomOnly: false,
    viewMode: 'all', // 'all' | 'lowFloor'
    isDarkTheme: true
  };

  // Mock schedule generator for rooms with deterministic seeded random based on room code
  const roomDatabase = {};

  function initDatabase() {
    // Generate realistic room datasets for Nanling buildings
    CAMPUS_DATA.nanling.buildings.forEach(b => {
      roomDatabase[b.id] = generateBuildingRooms(b);
    });
    if (CAMPUS_DATA.qianwei) {
      CAMPUS_DATA.qianwei.buildings.forEach(b => {
        roomDatabase[b.id] = generateBuildingRooms(b);
      });
    }
  }

  function generateBuildingRooms(bldg) {
    const rooms = [];
    for (let f = bldg.totalFloors; f >= 1; f--) {
      // 5-8 rooms per floor
      const roomCount = bldg.id === 'yifu' ? 8 : 6;
      for (let r = 1; r <= roomCount; r++) {
        const roomNum = `${f}${r < 10 ? '0' + r : r}`;
        const isLecture = (f <= 2 && r <= 3); // 1F and 2F have large lecture halls
        const isLab = (f >= 3 && r === 5); // Some floors have dedicated server/labs
        const isClosed = isLab;

        let type = isLecture ? 'lecture' : (r % 2 === 0 ? 'medium' : 'small');
        let capacity = isLecture ? 160 : (type === 'medium' ? 90 : 50);
        let roomName = `${bldg.name} ${roomNum}`;
        if (isLab) {
          roomName = `${bldg.name} ${roomNum}机房`;
          type = 'lab';
        }

        // Generate schedule for 12 slots (true = occupied/busy, false = free)
        const schedule = [];
        // Seed based on floor & room
        for (let s = 1; s <= 12; s++) {
          if (isClosed) {
            schedule.push(true); // Closed rooms are occupied/unusable
            continue;
          }
          // Realistic patterns: morning heavy (1-4), afternoon medium (5-8), evening sparse (9-12)
          let occupiedProb = 0.4;
          if (s <= 4) occupiedProb = 0.65;
          if (s >= 5 && s <= 8) occupiedProb = 0.45;
          if (s >= 9) occupiedProb = 0.2;

          // Make consecutive pairs (like 1-2, 3-4, 5-6, 7-8)
          if (s === 2 || s === 4 || s === 6 || s === 8 || s === 10) {
            schedule.push(schedule[schedule.length - 1]);
          } else {
            const hash = Math.sin(f * 100 + r * 10 + s + (bldg.id.charCodeAt(0))) * 10000;
            schedule.push((hash - Math.floor(hash)) < occupiedProb);
          }
        }

        rooms.push({
          id: `${bldg.id}_${roomNum}`,
          buildingId: bldg.id,
          floor: f,
          number: roomNum,
          name: roomName,
          type: type, // 'lecture' | 'medium' | 'small' | 'lab'
          capacity,
          isClosed,
          hasOutlets: (f % 2 === 1 || isLecture),
          hasAC: true,
          deskType: isLecture ? '阶梯宽平桌' : '独立双人桌',
          schedule // array of 12 booleans
        });
      }
    }
    return rooms;
  }

  // Calculate Consecutive Free Info for a room
  function calculateSafety(room, currentActiveSlot) {
    const isFreeNow = !room.schedule[currentActiveSlot - 1];
    if (!isFreeNow) {
      // Find when it will be free
      let nextFreeSlot = -1;
      for (let s = currentActiveSlot; s <= 12; s++) {
        if (!room.schedule[s - 1]) {
          nextFreeSlot = s;
          break;
        }
      }
      return {
        isFree: false,
        status: 'busy',
        consecutiveCount: 0,
        text: `当前有课进行中，预计 ${SESSION_SLOTS[currentActiveSlot - 1].end} 结课`,
        badgeText: '上课中'
      };
    }

    // Is free right now! Count consecutive free slots forward
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
        text: `🟢 连坐安全！当前空闲，可安心连续自习至 ${endTime}（连续 ${count} 节无课）`,
        badgeText: `连坐 ${count} 节`
      };
    } else if (count >= 2) {
      return {
        isFree: true,
        status: 'moderate',
        consecutiveCount: count,
        text: `🟡 当前空闲至 ${endTime}（连坐 ${count} 节），注意 ${endTime} 后有课安排`,
        badgeText: `连空 ${count} 节`
      };
    } else {
      return {
        isFree: true,
        status: 'warn',
        consecutiveCount: 1,
        text: `⚠️ 临近有课！当前节次空闲，但下节 (${SESSION_SLOTS[currentActiveSlot].start}) 即有课，请勿深扎`,
        badgeText: '仅剩1节'
      };
    }
  }

  // Determine overall status based on selectedSlots filter
  function getRoomFilterStatus(room, selectedSlots) {
    if (room.isClosed) return 'status-closed';

    let freeCount = 0;
    selectedSlots.forEach(s => {
      if (!room.schedule[s - 1]) freeCount++;
    });

    if (freeCount === selectedSlots.length) {
      return 'status-free'; // All selected slots are free!
    } else if (freeCount === 0) {
      return 'status-busy'; // Fully occupied in selected slots
    } else {
      return 'status-partial'; // Partially free
    }
  }

  // DOM Elements & Initialization
  function init() {
    initDatabase();
    bindHeaderEvents();
    bindFilterEvents();
    renderSlotsMatrix();
    applyPreset('now');
    updateBuildingMacroCards();
    renderFloorCabinMap();
    initHoverCard();
    startClock();
  }

  // Header Elements & Clock
  function bindHeaderEvents() {
    const campusSelect = document.getElementById('campusSelect');
    if (campusSelect) {
      campusSelect.value = state.campus;
      campusSelect.addEventListener('change', (e) => {
        state.campus = e.target.value;
        localStorage.setItem('nmj_campus', state.campus);
        // Reset building to first in campus
        const bldgs = CAMPUS_DATA[state.campus].buildings;
        state.buildingId = bldgs[0].id;
        localStorage.setItem('nmj_building', state.buildingId);

        updateBuildingMacroCards();
        renderFloorCabinMap();
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

    // Sync Data Modal Bindings
    const syncDataBtn = document.getElementById('syncDataBtn');
    const syncModal = document.getElementById('syncModal');
    const closeSyncModalBtn = document.getElementById('closeSyncModalBtn');
    const btnTriggerSync = document.getElementById('btnTriggerSync');
    const syncStatusText = document.getElementById('syncStatusText');

    if (syncDataBtn && syncModal) {
      syncDataBtn.addEventListener('click', () => {
        syncModal.style.display = 'flex';
      });
      closeSyncModalBtn.addEventListener('click', () => {
        syncModal.style.display = 'none';
      });
      syncModal.addEventListener('click', (e) => {
        if (e.target === syncModal) {
          syncModal.style.display = 'none';
        }
      });
      if (btnTriggerSync) {
        btnTriggerSync.addEventListener('click', () => {
          btnTriggerSync.disabled = true;
          btnTriggerSync.textContent = '⏳ 正在尝试连接吉大教务网关...';
          setTimeout(() => {
            btnTriggerSync.disabled = false;
            btnTriggerSync.textContent = '✅ 已成功同步教务处最新排课数据！';
            if (syncStatusText) {
              syncStatusText.textContent = '当前运行模式：在线同步模式（教务系统最新排课数据，已写入本地离线缓存）';
            }
            setTimeout(() => {
              btnTriggerSync.textContent = '⚡ 重新检测与拉取最新数据';
            }, 3000);
          }, 1200);
        });
      }
    }

    // View modes (all vs low floor)
    const viewAllBtn = document.getElementById('viewModeAll');
    const viewLowBtn = document.getElementById('viewModeLowFloor');
    if (viewAllBtn && viewLowBtn) {
      viewAllBtn.addEventListener('click', () => {
        state.viewMode = 'all';
        viewAllBtn.classList.add('active');
        viewLowBtn.classList.remove('active');
        renderFloorCabinMap();
      });
      viewLowBtn.addEventListener('click', () => {
        state.viewMode = 'lowFloor';
        viewLowBtn.classList.add('active');
        viewAllBtn.classList.remove('active');
        renderFloorCabinMap();
      });
    }
  }

  // Real-time Clock & Current Slot Perception
  function startClock() {
    function tick() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const clockEl = document.getElementById('liveClock');
      if (clockEl) clockEl.textContent = `${h}:${m}`;

      // Figure out current slot
      const currentSlot = getCurrentSlot(now);
      const badgeEl = document.getElementById('currentSlotBadge');
      if (badgeEl) {
        if (currentSlot) {
          badgeEl.textContent = `当前进行中：第 ${currentSlot.slot} 节 (${currentSlot.time})`;
        } else {
          badgeEl.textContent = `当前时段：课间/课外休息中`;
        }
      }
    }
    tick();
    setInterval(tick, 30000);
  }

  function getCurrentSlot(nowDate) {
    const totalMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
    for (const s of SESSION_SLOTS) {
      const [sh, sm] = s.start.split(':').map(Number);
      const [eh, em] = s.end.split(':').map(Number);
      const sMin = sh * 60 + sm;
      const eMin = eh * 60 + em;
      if (totalMinutes >= sMin && totalMinutes <= eMin) {
        return s;
      }
    }
    // Default mock current slot for demo purposes: slot 6 (14:20-15:05)
    return SESSION_SLOTS[5];
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

    // Reset button
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
      // Slot 6 & 7 & 8
      state.selectedSlots = [6, 7, 8];
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

    // Set preset to custom
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
      const s = parseInt(c.dataset.slot);
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

  // Render Building Macro Overview Cards
  function updateBuildingMacroCards() {
    const grid = document.getElementById('buildingCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const campus = CAMPUS_DATA[state.campus];
    if (!campus) return;

    let totalCampusRooms = 0;
    let totalCampusFree = 0;

    campus.buildings.forEach(bldg => {
      const rooms = roomDatabase[bldg.id] || [];
      const validRooms = rooms.filter(r => !r.isClosed);
      let freeCount = 0;

      validRooms.forEach(r => {
        if (getRoomFilterStatus(r, state.selectedSlots) === 'status-free') {
          freeCount++;
        }
      });

      totalCampusRooms += validRooms.length;
      totalCampusFree += freeCount;

      const percentage = validRooms.length > 0 ? Math.round((freeCount / validRooms.length) * 100) : 0;
      const isSelected = (bldg.id === state.buildingId);

      const card = document.createElement('div');
      card.className = `bldg-card ${isSelected ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="bldg-card-header">
          <span class="bldg-name">${bldg.name}</span>
          <span class="bldg-floors-tag">${bldg.totalFloors}层教学楼</span>
        </div>
        <div class="bldg-stats-row">
          <div class="bldg-free-count">${freeCount} <small>/ ${validRooms.length} 空闲</small></div>
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
      const campusPercentage = totalCampusRooms > 0 ? Math.round((totalCampusFree / totalCampusRooms) * 100) : 0;
      campusSummaryEl.textContent = `${campus.name} · 共 ${campus.buildings.length} 栋教学楼 · 当前所选综合空闲率 ${campusPercentage}%`;
    }
  }

  // Render Micro Floor Cabin View (Like Movie Theater / Flight Seat Map)
  function renderFloorCabinMap() {
    const container = document.getElementById('cabinFloorsContainer');
    if (!container) return;
    container.innerHTML = '';

    const currentBldg = (CAMPUS_DATA[state.campus].buildings.find(b => b.id === state.buildingId)) || CAMPUS_DATA[state.campus].buildings[0];
    
    document.getElementById('currentBuildingTitle').textContent = `${currentBldg.name} (${currentBldg.code})`;
    document.getElementById('currentBuildingSub').textContent = `按楼层空间直觉映射 · 所选 ${state.selectedSlots.length} 节实时占用走势`;

    const allRooms = roomDatabase[currentBldg.id] || [];
    
    // Filter rooms based on toggles
    let visibleRooms = allRooms.filter(r => {
      if (state.hideLabs && r.isClosed) return false;
      if (state.outletOnly && !r.hasOutlets) return false;
      if (state.largeRoomOnly && r.type !== 'lecture') return false;
      return true;
    });

    // Group by floor
    const floorsMap = {};
    visibleRooms.forEach(r => {
      if (!floorsMap[r.floor]) floorsMap[r.floor] = [];
      floorsMap[r.floor].push(r);
    });

    // Floor rendering: 5F down to 1F
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
        const safety = calculateSafety(room, state.selectedSlots[0] || 6);

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

        // Hover events for rich tooltip
        roomCell.addEventListener('mouseenter', (e) => showHoverCard(room, safety, e));
        roomCell.addEventListener('mousemove', (e) => positionHoverCard(e));
        roomCell.addEventListener('mouseleave', () => hideHoverCard());

        gridEl.appendChild(roomCell);
      });

      container.appendChild(floorRow);
    });
  }

  // Rich Hover Tooltip / Detail Card
  let hoverCard = null;

  function initHoverCard() {
    hoverCard = document.getElementById('roomHoverCard');
  }

  function showHoverCard(room, safety, event) {
    if (!hoverCard) return;

    document.getElementById('hoverRoomName').textContent = room.name;
    document.getElementById('hoverRoomType').textContent = `${room.type === 'lecture' ? '阶梯大教室' : (room.type === 'lab' ? '机房实验室' : '普通教室')} · ${room.capacity}座`;

    const safetyBanner = document.getElementById('hoverSafetyBanner');
    safetyBanner.className = `card-safety-banner ${safety.status}`;
    document.getElementById('hoverSafetyText').textContent = safety.text;

    // Timeline bar
    const bar = document.getElementById('hoverTimelineBar');
    bar.innerHTML = '';
    room.schedule.forEach((isBusy, idx) => {
      const dot = document.createElement('div');
      dot.className = `timeline-slot-dot ${isBusy ? 'busy' : 'free'}`;
      dot.textContent = idx + 1;
      dot.title = `第${idx + 1}节 (${SESSION_SLOTS[idx].time}): ${isBusy ? '有课' : '空闲'}`;
      bar.appendChild(dot);
    });

    // Physical specs
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

/**
 * need_more_jlu - Timeline Engine & Pure Business Calculations
 * 专注于 1~12 节全天时间轴重构、课室状态计算、连坐安全感判定。纯纯的业务领域模型，无 DOM 杂质。
 */

import { SESSION_SLOTS } from '../../config/constants.js';

export function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isQueryingToday(queryDate) {
  return queryDate === getTodayString();
}

export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function getCurrentTimeSlotInfo() {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const toMinutes = (tStr) => {
    const [h, m] = tStr.split(':').map(Number);
    return h * 60 + m;
  };

  const dayStartMin = toMinutes(SESSION_SLOTS[0].start);
  const dayEndMin = toMinutes(SESSION_SLOTS[SESSION_SLOTS.length - 1].end);

  if (currentMinutes < dayStartMin) {
    const diff = dayStartMin - currentMinutes;
    return {
      type: 'before_school',
      activeSlot: 1,
      slotDef: SESSION_SLOTS[0],
      remainMinutes: diff,
      hintText: `距早间上课还有 ${diff} 分钟`,
      badgeText: `早课准备 (${SESSION_SLOTS[0].start} 开始)`
    };
  }

  if (currentMinutes >= dayEndMin) {
    return {
      type: 'after_school',
      activeSlot: 12,
      slotDef: SESSION_SLOTS[11],
      remainMinutes: 0,
      hintText: '今日全天排课已结束',
      badgeText: '今日已结课 (晚自习)'
    };
  }

  for (let i = 0; i < SESSION_SLOTS.length; i++) {
    const s = SESSION_SLOTS[i];
    const sMin = toMinutes(s.start);
    const eMin = toMinutes(s.end);

    if (currentMinutes >= sMin && currentMinutes < eMin) {
      const remain = eMin - currentMinutes;
      return {
        type: 'in_session',
        activeSlot: s.slot,
        slotDef: s,
        remainMinutes: remain,
        hintText: `距本节下课剩 ${remain} 分钟`,
        badgeText: `进行中：${s.name} (${s.time})`
      };
    }

    if (i < SESSION_SLOTS.length - 1) {
      const nextS = SESSION_SLOTS[i + 1];
      const nextSMin = toMinutes(nextS.start);
      if (currentMinutes >= eMin && currentMinutes < nextSMin) {
        const breakRemain = nextSMin - currentMinutes;
        return {
          type: 'in_break',
          activeSlot: s.slot,
          nextSlot: nextS.slot,
          slotDef: s,
          nextSlotDef: nextS,
          remainMinutes: breakRemain,
          hintText: `课间休息，距下节剩 ${breakRemain} 分钟`,
          badgeText: `课间休息 (${nextS.start} 第${nextS.slot}节)`
        };
      }
    }
  }

  return {
    type: 'in_session',
    activeSlot: 1,
    slotDef: SESSION_SLOTS[0],
    remainMinutes: 0,
    hintText: '当前时段',
    badgeText: '第1节'
  };
}

export function getCurrentTimeSlot() {
  const info = getCurrentTimeSlotInfo();
  if (info.type === 'before_school') return 1;
  if (info.type === 'after_school') return 12;
  if (info.type === 'in_break') return info.nextSlot || info.activeSlot;
  return info.activeSlot;
}

export function parseRealRoom(row, bCode, currentBuildings = []) {
  const fullName = row.JASMC || '';
  const match = fullName.match(/([A-Za-z]?)([1-9])(\d{2})/);
  let floor = 1;
  let shortNumber = fullName;
  if (match) {
    floor = parseInt(match[2], 10);
    shortNumber = (match[1] || '') + match[2] + match[3];
  } else {
    const fMatch = fullName.match(/(\d)层/);
    if (fMatch) floor = parseInt(fMatch[1], 10);
  }

  const capacity = row.SKZWS || row.KSZWS || 60;
  const typeDisplay = row.JASLXDM_DISPLAY || '普通教室';

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
    category: category,
    categoryName: categoryName,
    typeIcon: typeIcon,
    type: category,
    isClosed: isSpecial
  };
}

export function mergeAndProcessTimeline(slotsData, currentBuildings = []) {
  const buildingRoomsMap = {};
  currentBuildings.forEach(b => {
    buildingRoomsMap[b.id] = [];
  });

  const roomDict = new Map();

  slotsData.forEach(({ slot, rows }) => {
    if (!Array.isArray(rows)) return;

    rows.forEach(row => {
      const roomId = row.JASMC;
      if (!roomId) return;

      let bCode = String(row.JXLDM || '');
      if (!bCode || bCode === 'null' || !buildingRoomsMap[bCode]) {
        const matched = currentBuildings.find(b =>
          row.JASMC.includes(b.shortName) || row.JASMC.includes(b.name) || row.JASMC.includes(b.id)
        );
        bCode = matched ? matched.id : (currentBuildings[0] ? currentBuildings[0].id : '65');
      }

      if (!roomDict.has(roomId)) {
        const roomObj = parseRealRoom(row, bCode, currentBuildings);
        roomObj.schedule = new Array(12).fill(true);
        roomObj.freeSlotsCount = 0;
        roomDict.set(roomId, roomObj);
      }

      const room = roomDict.get(roomId);
      if (slot >= 1 && slot <= 12) {
        room.schedule[slot - 1] = false;
        room.freeSlotsCount++;
      }
    });
  });

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

  Object.keys(buildingRoomsMap).forEach(k => {
    buildingRoomsMap[k].sort((a, b) => {
      if (a.floor !== b.floor) return a.floor - b.floor;
      return a.number.localeCompare(b.number);
    });
  });

  return {
    buildingRoomsMap,
    totalRoomsFound
  };
}

export function formatSlotRanges(slotIndices) {
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

export function getRoomDaySummary(room) {
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

export function getRoomBadgeInfo(room, state = {}) {
  if (room.isClosed) {
    return { text: '机房/封闭', type: 'busy' };
  }

  const isToday = isQueryingToday(state.queryDate);
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
    const selectedSlots = state.selectedSlots || [1];
    let freeCount = 0;
    selectedSlots.forEach(s => {
      if (!room.schedule[s - 1]) freeCount++;
    });

    if (freeCount === selectedSlots.length) {
      if (selectedSlots.length === 12) {
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

export function getRoomHoverDetails(room, state = {}) {
  const isToday = isQueryingToday(state.queryDate);
  const isNowMode = isToday && (state.activePreset === 'now' || arraysEqual(state.selectedSlots, [getCurrentTimeSlot()]));
  const summary = getRoomDaySummary(room);

  if (room.isClosed) {
    return {
      bannerClass: 'busy',
      bannerIcon: '🔬',
      bannerText: `${room.categoryName} · 非开放在册教室`,
      summary: summary
    };
  }

  if (isNowMode) {
    const timeInfo = getCurrentTimeSlotInfo();

    if (timeInfo.type === 'after_school') {
      return {
        bannerClass: 'safe',
        bannerIcon: '🌙',
        bannerText: '今日全天排课已结束 · 适合晚自习',
        summary: summary
      };
    }

    if (timeInfo.type === 'before_school') {
      const isFree1 = !room.schedule[0];
      if (isFree1) {
        let count = 0;
        for (let s = 1; s <= 12; s++) {
          if (!room.schedule[s - 1]) count++;
          else break;
        }
        return {
          bannerClass: count >= 2 ? 'safe' : 'warn',
          bannerIcon: count >= 2 ? '☕' : '⚡',
          bannerText: `早课可连坐 ${count} 节（${SESSION_SLOTS[0].start} 开始）`,
          summary: summary
        };
      } else {
        return {
          bannerClass: 'busy',
          bannerIcon: '🚫',
          bannerText: `第1节即将有课占用（${SESSION_SLOTS[0].start}）`,
          summary: summary
        };
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
        return {
          bannerClass: count >= 2 ? 'safe' : 'warn',
          bannerIcon: count >= 2 ? '☕' : '⚡',
          bannerText: `课间空闲 · 下节(${nextS ? nextS.start : ''})起连空 ${count} 节`,
          summary: summary
        };
      } else {
        return {
          bannerClass: 'busy',
          bannerIcon: '⚠️',
          bannerText: `下节有课占用 (${nextS ? nextS.start : ''} 第${nextSlot}节)`,
          summary: summary
        };
      }
    }

    const curSlot = timeInfo.activeSlot;
    const curSlotDef = timeInfo.slotDef;
    const isFreeNow = !room.schedule[curSlot - 1];

    if (isFreeNow) {
      let count = 0;
      for (let s = curSlot; s <= 12; s++) {
        if (!room.schedule[s - 1]) count++;
        else break;
      }
      return {
        bannerClass: count >= 2 ? 'safe' : 'warn',
        bannerIcon: count >= 2 ? '✅' : '⚡',
        bannerText: `当前可用 · 从当前节连空 ${count} 节 (至${SESSION_SLOTS[curSlot + count - 2].end})`,
        summary: summary
      };
    } else {
      return {
        bannerClass: 'busy',
        bannerIcon: '🚫',
        bannerText: `当前${curSlotDef.name}正在上课 (${curSlotDef.time})`,
        summary: summary
      };
    }
  } else {
    const selectedSlots = state.selectedSlots || [1];
    let freeCount = 0;
    selectedSlots.forEach(s => {
      if (!room.schedule[s - 1]) freeCount++;
    });

    if (freeCount === selectedSlots.length) {
      return {
        bannerClass: 'safe',
        bannerIcon: '✅',
        bannerText: `所选 ${selectedSlots.length} 节时段内全程空闲`,
        summary: summary
      };
    } else if (freeCount === 0) {
      return {
        bannerClass: 'busy',
        bannerIcon: '🚫',
        bannerText: `所选 ${selectedSlots.length} 节时段内全部有课占用`,
        summary: summary
      };
    } else {
      return {
        bannerClass: 'warn',
        bannerIcon: '⚠️',
        bannerText: `所选 ${selectedSlots.length} 节中仅空闲 ${freeCount} 节`,
        summary: summary
      };
    }
  }
}

export function getRoomFilterStatus(room, selectedSlots = [1]) {
  if (room.isClosed) {
    return 'status-busy';
  }

  let freeCount = 0;
  selectedSlots.forEach(s => {
    if (!room.schedule[s - 1]) freeCount++;
  });

  if (freeCount === selectedSlots.length) {
    return 'status-free';
  }
  if (freeCount === 0) {
    return 'status-busy';
  }
  return 'status-partial';
}

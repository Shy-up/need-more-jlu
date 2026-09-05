/**
 * need_more_jlu - Floor Cabin Map Renderer
 * 负责微观楼层座舱图（物理进出动线降序/升序、阶梯式固定尺寸舱位卡片、三种差异化空状态）。
 */

import { getRoomFilterStatus, getRoomBadgeInfo, formatDate } from './timeline_engine.js';

export function applyRoomTierSizing(roomCell, room) {
  const nameStr = String(room.number || '');
  if (nameStr.length >= 8) {
    const neededWidth = Math.min(240, 80 + nameStr.length * 13);
    roomCell.style.minWidth = `${neededWidth}px`;
  }
}

export function renderFloorCabinMap({
  currentBuildings = [],
  buildingRoomsMap = {},
  state = {},
  onRetry,
  onRelogin,
  onResetRoomTypes,
  onSwitchBuilding,
  onSelectTomorrow,
  onShowHover,
  onPositionHover,
  onHideHover
}) {
  const container = document.getElementById('cabinFloorsContainer');
  if (!container) return;
  container.innerHTML = '';

  const currentBldg = currentBuildings.find(b => b.id === state.buildingId)
    || currentBuildings[0]
    || { id: '65', name: '教学楼', shortName: '教学楼' };

  const titleEl = document.getElementById('currentBuildingTitle');
  if (titleEl) {
    titleEl.textContent = `${currentBldg.shortName} (${currentBldg.name})`;
  }

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
    // 1. Scenario A: 教务系统无法连接 (无登录/会话过期/网络中断/连接超时)
    if (state.fetchStatus === 'UNAUTHENTICATED' || state.fetchStatus === 'NETWORK_ERROR' || state.fetchStatus === 'TIMEOUT' || !state.isDataLoaded) {
      const isAuth = state.fetchStatus === 'UNAUTHENTICATED';
      const isTimeout = state.fetchStatus === 'TIMEOUT';
      container.innerHTML = `
        <div class="cabin-empty-card error-state">
          <div class="empty-state-icon">${isAuth ? '🔒' : (isTimeout ? '⏱️' : '⚠️')}</div>
          <div class="empty-state-title">${isAuth ? '吉大教务未登录认证' : (isTimeout ? '教务系统连接超时 (5s)' : '教务接口通信失败 · 未能获取排课')}</div>
          <div class="empty-state-desc">
            ${isAuth
          ? '校园网已连通，但课表数据库需要统一身份认证授权后方可访问。请完成认证登录后重新拉取。'
          : (isTimeout
            ? '连接吉大教务服务 5 秒超时无响应。在校内系统会自动优先选择校园网直连；校外请连接 WebVPN。'
            : '与吉大教务处排课服务 (cxkxjs.do) 通信失败或校园网络中断，未能拉取排课数据。')}
          </div>
          <div class="empty-state-actions">
            ${isAuth ? `<button class="btn-empty-action primary" id="btnReloginEmpty">📱 微信扫码 / 统一认证一键登录</button>` : ''}
            <button class="btn-empty-action secondary" id="btnRetryEmptyFetch">🔄 重新尝试获取真实排课</button>
          </div>
        </div>
      `;
      const retryBtn = container.querySelector('#btnRetryEmptyFetch');
      if (retryBtn && typeof onRetry === 'function') retryBtn.addEventListener('click', onRetry);
      const reloginBtn = container.querySelector('#btnReloginEmpty');
      if (reloginBtn && typeof onRelogin === 'function') reloginBtn.addEventListener('click', onRelogin);
      return;
    }

    // 2. Scenario B: 筛选条件导致没有
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
      if (resetBtn && typeof onResetRoomTypes === 'function') {
        resetBtn.addEventListener('click', onResetRoomTypes);
      }
      return;
    }

    // 3. Scenario C: 真的完全没空闲
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
        if (typeof onSwitchBuilding === 'function') {
          onSwitchBuilding(btn.dataset.bldgId);
        }
      });
    });

    const btnTomorrow = container.querySelector('#btnSwitchQueryDateTomorrow');
    if (btnTomorrow && typeof onSelectTomorrow === 'function') {
      btnTomorrow.addEventListener('click', onSelectTomorrow);
    }
    return;
  }

  // Group by floor
  const floorsMap = {};
  visibleRooms.forEach(r => {
    if (!floorsMap[r.floor]) floorsMap[r.floor] = [];
    floorsMap[r.floor].push(r);
  });

  // Floor rendering: 1F first, then higher floors downwards
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
      const badgeInfo = getRoomBadgeInfo(room, state);

      const roomCell = document.createElement('div');
      roomCell.className = `room-cabin-cell type-${room.category} ${statusClass}`;
      roomCell.dataset.roomId = room.id;

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

      roomCell.addEventListener('mouseenter', (e) => {
        if (typeof onShowHover === 'function') onShowHover(room, e);
      });
      roomCell.addEventListener('mousemove', (e) => {
        if (typeof onPositionHover === 'function') onPositionHover(e);
      });
      roomCell.addEventListener('mouseleave', () => {
        if (typeof onHideHover === 'function') onHideHover();
      });

      gridEl.appendChild(roomCell);
    });

    container.appendChild(floorRow);
  });
}

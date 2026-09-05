/**
 * need_more_jlu - Macro Building Overview Renderer
 * 负责校区宏观楼栋卡片、推荐标签、空闲率进度条与折叠面板的渲染与状态同步。
 */

import { getRoomFilterStatus } from './timeline_engine.js';
import { getBuildingRecommendation } from './data_service.js';

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function syncBuildingCardSelectedState(selectedBuildingId) {
  document.querySelectorAll('.bldg-card').forEach(c => {
    if (c.dataset.bldgId === selectedBuildingId) {
      c.classList.add('selected');
    } else {
      c.classList.remove('selected');
    }
  });
}

export function createBuildingCardElement({
  bldg,
  rec,
  rooms,
  selectedBuildingId,
  selectedSlots,
  onSelectBuilding
}) {
  const validRooms = (rooms || []).filter(r => !r.isClosed);
  let freeCount = 0;

  validRooms.forEach(r => {
    if (getRoomFilterStatus(r, selectedSlots) === 'status-free') {
      freeCount++;
    }
  });

  const percentage = validRooms.length > 0 ? Math.round((freeCount / validRooms.length) * 100) : 0;
  const isSelected = (bldg.id === selectedBuildingId);

  const card = document.createElement('div');
  card.className = `bldg-card ${isSelected ? 'selected' : ''}`;
  card.dataset.bldgId = bldg.id;
  card.innerHTML = `
    <div class="bldg-card-header">
      <span class="bldg-name">${bldg.shortName}</span>
      ${rec ? `<span class="bldg-rec-tag">推荐</span>` : ''}
    </div>
    ${rec && rec.reason ? `<div class="bldg-rec-reason" title="${escapeHtml(rec.reason)}">💡 ${escapeHtml(rec.reason)}</div>` : ''}
    <div class="bldg-stats-row">
      <div class="bldg-free-count">${freeCount} <small>/ ${validRooms.length} 间可用</small></div>
      <div class="bldg-percentage-ring">${percentage}%</div>
    </div>
    <div class="bldg-progress-bar">
      <div class="bldg-progress-fill" style="width: ${percentage}%;"></div>
    </div>
  `;

  card.addEventListener('click', () => {
    if (typeof onSelectBuilding === 'function') {
      onSelectBuilding(bldg.id);
    }
  });

  return { card, validCount: validRooms.length, freeCount };
}

export function updateBuildingMacroCards({
  currentBuildings = [],
  buildingRoomsMap = {},
  state = {},
  currentCampus = null,
  recommendationsConfig = null,
  onSelectBuilding
}) {
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
    const rec = getBuildingRecommendation(bldg, state.campusCode, recommendationsConfig);
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
      const rooms = buildingRoomsMap[bldg.id] || [];
      const { card, validCount, freeCount } = createBuildingCardElement({
        bldg,
        rec,
        rooms,
        selectedBuildingId: state.buildingId,
        selectedSlots: state.selectedSlots,
        onSelectBuilding
      });
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
      const rooms = buildingRoomsMap[bldg.id] || [];
      const { card, validCount, freeCount } = createBuildingCardElement({
        bldg,
        rec,
        rooms,
        selectedBuildingId: state.buildingId,
        selectedSlots: state.selectedSlots,
        onSelectBuilding
      });
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

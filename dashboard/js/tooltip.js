/**
 * need_more_jlu - Room Hover Card Tooltip Controller
 * 负责悬浮详情卡、12节排课时段条以及智能防溢出定位。
 */

import { SESSION_SLOTS } from '../../config/constants.js';
import { getRoomHoverDetails } from './timeline_engine.js';

let hoverCard = null;

export function initHoverCard() {
  hoverCard = document.getElementById('roomHoverCard');
}

export function showHoverCard(room, event, state = {}) {
  if (!hoverCard) {
    hoverCard = document.getElementById('roomHoverCard');
  }
  if (!hoverCard) return;

  const details = getRoomHoverDetails(room, state);

  const nameEl = document.getElementById('hoverRoomName');
  if (nameEl) nameEl.textContent = room.name;

  const typeEl = document.getElementById('hoverRoomType');
  if (typeEl) typeEl.textContent = `${room.categoryName} · ${room.typeDisplay} · ${room.capacity}座`;

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

export function positionHoverCard(e) {
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

export function hideHoverCard() {
  if (hoverCard) {
    hoverCard.style.display = 'none';
  }
}

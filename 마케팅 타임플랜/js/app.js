/* =============================================
   Marketing Timeplan — app.js
   전체 앱 로직: API 연동, 4개 뷰 렌더링, CRUD
   ============================================= */

'use strict';

// ── API ──────────────────────────────────────
const API = {
  key: 'marketing_tasks',

  async list() {
    const data = localStorage.getItem(this.key);
    return data ? JSON.parse(data) : [];
  },

  async create(data) {
    const tasks = await this.list();
    const newTask = { ...data, id: 'task_' + Date.now() };
    tasks.push(newTask);
    localStorage.setItem(this.key, JSON.stringify(tasks));
    return newTask;
  },

  async update(id, data) {
    const tasks = await this.list();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) tasks[idx] = { ...tasks[idx], ...data };
    localStorage.setItem(this.key, JSON.stringify(tasks));
    return tasks[idx];
  },

  async remove(id) {
    const tasks = await this.list();
    localStorage.setItem(this.key, JSON.stringify(tasks.filter(t => t.id !== id)));
  }
};
// ── State ─────────────────────────────────────
const state = {
  tasks: [],
  filtered: [],
  view: 'gantt',
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
  clMonth: new Date().getMonth(),
  clYear: new Date().getFullYear(),
  filters: { assignee: '', status: '', priority: '' },
  editingId: null,
  ganttStartDate: null,
  ganttDays: 0,
  ganttDayWidth: 30
};

// member colors
const MEMBER_COLORS = {
  '이상희': '#6366f1',
  '정현동': '#8b5cf6',
  '홍준기': '#06b6d4'
};
const MEMBER_ROLES = {
  '이상희': '팀장',
  '정현동': '대표',
  '홍준기': '대표'
};
const STATUS_ICONS = {
  '예정': 'fa-circle-dot',
  '진행중': 'fa-spinner',
  '완료': 'fa-circle-check',
  '보류': 'fa-circle-pause'
};
const STATUS_COLORS = {
  '예정': '#6366f1',
  '진행중': '#f59e0b',
  '완료': '#10b981',
  '보류': '#9ca3af'
};

// ── Helpers ───────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtFull(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function daysDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isWeekend(d) {
  const day = new Date(d).getDay();
  return day === 0 || day === 6;
}
function isToday(dateStr) {
  return dateStr === toDateStr(new Date());
}
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, type = 'default') {
  const el = document.getElementById('toast');
  el.textContent = (type === 'success' ? '✅ ' : type === 'error' ? '❌ ' : 'ℹ️ ') + msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Apply Filters ─────────────────────────────
function applyFilters() {
  const { assignee, status, priority } = state.filters;
  state.filtered = state.tasks.filter(t =>
    (!assignee || t.assignee === assignee) &&
    (!status   || t.status === status) &&
    (!priority || t.priority === priority)
  );
}

// ── Render Current View ───────────────────────
function renderView() {
  applyFilters();
  const vw = state.view;
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === vw));
  document.getElementById(`view-${vw}`).classList.add('active');
  if (vw === 'gantt')     renderGantt();
  if (vw === 'calendar')  renderCalendar();
  if (vw === 'kanban')    renderKanban();
  if (vw === 'timeline')  renderTimeline();
  if (vw === 'checklist') renderChecklist();
}

// ─────────────────────────────────────────────
//  GANTT CHART
// ─────────────────────────────────────────────
function renderGantt() {
  const container = document.getElementById('gantt-container');
  const tasks = state.filtered;

  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bars-progress"></i><p>표시할 작업이 없습니다.</p></div>`;
    return;
  }

  // determine date range: from min start to max end + padding
  const allDates = tasks.flatMap(t => [t.start_date, t.end_date]).filter(Boolean).sort();
  const minDate = new Date(allDates[0]);
  const maxDate = new Date(allDates[allDates.length - 1]);
  // pad 7 days on each side
  const rangeStart = addDays(minDate, -7);
  const rangeEnd   = addDays(maxDate, 7);
  const totalDays  = daysDiff(toDateStr(rangeStart), toDateStr(rangeEnd)) + 1;

  state.ganttStartDate = rangeStart;
  state.ganttDays = totalDays;

  // Group by project
  const groups = {};
  tasks.forEach(t => {
    const g = t.project || '기타';
    if (!groups[g]) groups[g] = [];
    groups[g].push(t);
  });

  // Build month spans
  const monthSpans = [];
  let cur = new Date(rangeStart);
  while (cur <= rangeEnd) {
    const key = `${cur.getFullYear()}-${cur.getMonth()}`;
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.key === key) last.span++;
    else monthSpans.push({ key, label: `${cur.getFullYear()}년 ${cur.getMonth()+1}월`, span: 1 });
    cur = addDays(cur, 1);
  }

  // Header HTML
  let monthRow = '';
  monthSpans.forEach(m => {
    monthRow += `<th colspan="${m.span}">${m.label}</th>`;
  });

  let dayRow = '<th class="gantt-info-head">작업</th>';
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(rangeStart, i);
    const ds = toDateStr(d);
    const dayNum = d.getDate();
    const cls = isToday(ds) ? 'today-col' : isWeekend(ds) ? 'weekend' : '';
    dayRow += `<th class="${cls}" style="min-width:${state.ganttDayWidth}px;max-width:${state.ganttDayWidth}px">${dayNum}</th>`;
  }

  // Rows HTML
  let rowsHtml = '';
  Object.entries(groups).forEach(([proj, grpTasks]) => {
    rowsHtml += `<tr class="gantt-group-row">
      <td colspan="${totalDays + 1}">
        <i class="fa-solid fa-folder" style="margin-right:6px;color:#9ca3af"></i>${escHtml(proj)}
        <span style="margin-left:8px;font-size:.75rem;color:#aaa">(${grpTasks.length}개 작업)</span>
      </td>
    </tr>`;

    grpTasks.forEach(task => {
      const color = task.color || MEMBER_COLORS[task.assignee] || '#6366f1';
      const startOff = task.start_date ? daysDiff(toDateStr(rangeStart), task.start_date) : -1;
      const endOff   = task.end_date   ? daysDiff(toDateStr(rangeStart), task.end_date)   : startOff;
      const barSpan  = Math.max(1, endOff - startOff + 1);
      const barWidth = (barSpan * state.ganttDayWidth) - 4;
      const barLeft  = startOff * state.ganttDayWidth + 2;

      // Build each cell
      let cells = `<td class="gantt-info-col">
        <div class="gantt-task-info" data-id="${escHtml(task.id)}">
          <span class="task-title">${escHtml(task.title)}</span>
          <div class="task-meta">
            <span class="badge-status status-${escHtml(task.status)}">${escHtml(task.status)}</span>
            <span style="color:${color};font-size:.75rem;font-weight:600">${escHtml(task.assignee)}</span>
          </div>
        </div>
      </td>`;

      for (let i = 0; i < totalDays; i++) {
        const d = addDays(rangeStart, i);
        const ds = toDateStr(d);
        const isTd = isToday(ds);
        const tdCls = isTd ? 'today-col' : '';
        
        if (i === startOff) {
          // bar start cell
          const barLabel = barSpan > 2 ? escHtml(task.title) : '';
          const singleCls = barSpan === 1 ? 'single-day' : '';
          cells += `<td class="gantt-bar-cell ${tdCls}" style="position:relative" colspan="1">
            <div class="gantt-bar ${singleCls}" 
                 data-id="${escHtml(task.id)}"
                 style="background:${color};width:${barWidth}px;left:${2}px;top:50%;transform:translateY(-50%)"
                 title="${escHtml(task.title)} (${fmt(task.start_date)} ~ ${fmt(task.end_date)})">
              ${barLabel}
            </div>
          </td>`;
        } else if (i > startOff && i <= endOff) {
          cells += `<td class="${tdCls}"></td>`;
        } else {
          cells += `<td class="${tdCls}"></td>`;
        }
      }

      rowsHtml += `<tr class="gantt-task-row">${cells}</tr>`;
    });
  });

  container.innerHTML = `
    <table class="gantt-table">
      <thead>
        <tr class="gantt-month-row"><th class="gantt-info-head"></th>${monthRow}</tr>
        <tr class="gantt-day-row">${dayRow}</tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  // Scroll to today
  const todayIdx = daysDiff(toDateStr(rangeStart), toDateStr(new Date()));
  if (todayIdx > 0) {
    container.scrollLeft = Math.max(0, (todayIdx - 5) * state.ganttDayWidth);
  }

  // Events
  container.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', e => {
      const id = e.currentTarget.dataset.id;
      if (id) openEditModal(id);
    });
  });
}

// ─────────────────────────────────────────────
//  MONTHLY CALENDAR
// ─────────────────────────────────────────────
function renderCalendar() {
  const { calYear, calMonth } = state;
  const tasks = state.filtered;

  // Update title
  document.getElementById('cal-title').textContent = `${calYear}년 ${calMonth + 1}월`;

  const grid = document.getElementById('calendar-grid');
  const today = toDateStr(new Date());

  // Compute grid start: first cell
  const firstDay = new Date(calYear, calMonth, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const gridStart = addDays(firstDay, -startDow);

  // 6 weeks
  const totalCells = 42;

  let html = '';
  // Day-of-week headers
  const dows = ['일','월','화','수','목','금','토'];
  dows.forEach((d, i) => {
    const cls = i === 0 ? 'sun' : i === 6 ? 'sat' : '';
    html += `<div class="cal-dow ${cls}">${d}</div>`;
  });

  // Task map: dateStr → tasks[]
  const taskMap = {};
  tasks.forEach(task => {
    if (!task.start_date) return;
    const s = new Date(task.start_date + 'T00:00:00');
    const e = task.end_date ? new Date(task.end_date + 'T00:00:00') : s;
    let cur = new Date(s);
    while (cur <= e) {
      const ds = toDateStr(cur);
      if (!taskMap[ds]) taskMap[ds] = [];
      taskMap[ds].push(task);
      cur = addDays(cur, 1);
    }
  });

  for (let i = 0; i < totalCells; i++) {
    const d = addDays(gridStart, i);
    const ds = toDateStr(d);
    const isOther = d.getMonth() !== calMonth;
    const isTodayCell = ds === today;

    let eventsHtml = '';
    const dayTasks = taskMap[ds] || [];
    const maxShow = 3;
    dayTasks.slice(0, maxShow).forEach(t => {
      const c = t.color || MEMBER_COLORS[t.assignee] || '#6366f1';
      eventsHtml += `<div class="cal-event" data-id="${escHtml(t.id)}" style="background:${c}" title="${escHtml(t.title)}">${escHtml(t.title)}</div>`;
    });
    if (dayTasks.length > maxShow) {
      eventsHtml += `<div class="cal-more">+${dayTasks.length - maxShow}개 더</div>`;
    }

    html += `<div class="cal-day ${isOther ? 'other-month' : ''} ${isTodayCell ? 'today' : ''}">
      <div class="day-num">${d.getDate()}</div>
      ${eventsHtml}
    </div>`;
  }

  grid.innerHTML = html;

  // Events
  grid.querySelectorAll('.cal-event[data-id]').forEach(el => {
    el.addEventListener('click', () => openEditModal(el.dataset.id));
  });
}

// ─────────────────────────────────────────────
//  KANBAN BOARD
// ─────────────────────────────────────────────
function renderKanban() {
  const board = document.getElementById('kanban-board');
  const tasks = state.filtered;
  const cols = ['예정', '진행중', '완료', '보류'];
  const colColors = {
    '예정':  '#6366f1',
    '진행중': '#f59e0b',
    '완료':  '#10b981',
    '보류':  '#9ca3af'
  };

  let html = '';
  cols.forEach(col => {
    const colTasks = tasks.filter(t => t.status === col);
    let cardsHtml = colTasks.length ? '' : `<div class="empty-state" style="padding:32px 0"><i class="fa-solid fa-inbox" style="font-size:1.6rem"></i><p>작업 없음</p></div>`;

    colTasks.forEach(t => {
      const color = t.color || MEMBER_COLORS[t.assignee] || '#6366f1';
      const avatarColor = MEMBER_COLORS[t.assignee] || '#9ca3af';
      const tags = t.tags ? t.tags.split(',').map(g => g.trim()).filter(Boolean) : [];
      const priorityBadge = t.priority ? `<span class="badge-priority priority-${escHtml(t.priority)}">${escHtml(t.priority)}</span>` : '';
      const tagChips = tags.slice(0, 2).map(g => `<span class="tag-chip">${escHtml(g)}</span>`).join('');

      cardsHtml += `
        <div class="kanban-card" data-id="${escHtml(t.id)}" style="border-left-color:${color}">
          <div class="kanban-card-title">${escHtml(t.title)}</div>
          <div class="kanban-card-meta">
            <span class="assignee-chip" style="background:${avatarColor}">${escHtml(t.assignee)}</span>
            ${priorityBadge}
            ${tagChips}
          </div>
          <div class="kanban-card-date">
            <i class="fa-regular fa-calendar"></i>
            ${fmtFull(t.start_date)}${t.end_date && t.end_date !== t.start_date ? ' → ' + fmtFull(t.end_date) : ''}
          </div>
          ${t.memo ? `<div style="margin-top:6px;font-size:.75rem;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(t.memo)}</div>` : ''}
        </div>`;
    });

    html += `
      <div class="kanban-column">
        <div class="kanban-col-header">
          <div class="kanban-col-title">
            <i class="fa-solid ${STATUS_ICONS[col] || 'fa-circle'}" style="color:${colColors[col]}"></i>
            ${col}
          </div>
          <span class="kanban-count">${colTasks.length}</span>
        </div>
        <div class="kanban-cards">${cardsHtml}</div>
      </div>`;
  });

  board.innerHTML = html;

  board.querySelectorAll('.kanban-card[data-id]').forEach(el => {
    el.addEventListener('click', () => openEditModal(el.dataset.id));
  });
}

// ─────────────────────────────────────────────
//  QUARTERLY TIMELINE VIEW (분기별 · 월별 업무 흐름)
// ─────────────────────────────────────────────

function getQuarter(dateStr) {
  if (!dateStr) return null;
  return Math.ceil(parseInt(dateStr.slice(5, 7), 10) / 3);
}
function getQuarterYear(dateStr) {
  if (!dateStr) return null;
  return parseInt(dateStr.slice(0, 4), 10);
}
function quarterMonthRange(q) {
  const starts = [1, 4, 7, 10];
  return { start: starts[q - 1], end: starts[q - 1] + 2 };
}

function renderTimeline() {
  const container = document.getElementById('timeline-container');
  const tasks = state.filtered;

  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-timeline"></i><p>표시할 작업이 없습니다.</p></div>`;
    return;
  }

  // ── 전체 연도 범위 파악 ──
  const years = state.tasks
    .flatMap(t => [t.start_date, t.end_date].filter(Boolean).map(d => parseInt(d.slice(0, 4), 10)));
  const minYear = years.length ? Math.min(...years) : new Date().getFullYear();
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

  // ── 월별 작업 맵 { "YYYY-MM": [task, ...] } ──
  const monthMap = {};
  tasks.forEach(t => {
    const sd = t.start_date || '';
    if (!sd) return;
    const key = sd.slice(0, 7); // "YYYY-MM"
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(t);
  });

  const todayStr = toDateStr(new Date());
  const todayYM  = todayStr.slice(0, 7);

  // ── 분기별로 묶어서 렌더링 ──
  let outerHtml = '';

  for (let y = minYear; y <= maxYear; y++) {
    for (let q = 1; q <= 4; q++) {
      const { start: qStartM, end: qEndM } = quarterMonthRange(q);
      const isCurrentQ = (y === parseInt(todayYM.slice(0, 4), 10)) &&
                         (q === Math.ceil(parseInt(todayYM.slice(5, 7), 10) / 3));

      // 이 분기에 해당하는 월들 중 작업 있는 것만
      const monthsInQ = [];
      for (let m = qStartM; m <= qEndM; m++) {
        const mKey = `${y}-${String(m).padStart(2, '0')}`;
        const mTasks = (monthMap[mKey] || []).sort((a, b) =>
          (a.start_date || '').localeCompare(b.start_date || '')
        );
        monthsInQ.push({ m, mKey, mTasks });
      }

      // 이 분기에 작업이 하나도 없으면 스킵
      if (!monthsInQ.some(mo => mo.mTasks.length > 0)) continue;

      // 분기 내 전체 작업 수
      const totalQTasks = monthsInQ.reduce((sum, mo) => sum + mo.mTasks.length, 0);

      // ── 월 컬럼 HTML ──
      let monthColsHtml = '';
      monthsInQ.forEach(({ m, mKey, mTasks }) => {
        const isCurrentM = mKey === todayYM;
        const monthName  = `${m}월`;
        const mLabel     = `${y}년 ${m}월`;

        // ── 작업 카드 목록 ──
        let cardsHtml = '';
        if (mTasks.length === 0) {
          cardsHtml = `<div class="ml-empty"><i class="fa-regular fa-calendar-xmark"></i> 업무 없음</div>`;
        } else {
          mTasks.forEach(t => {
            const color       = t.color || MEMBER_COLORS[t.assignee] || '#6366f1';
            const avatarColor = MEMBER_COLORS[t.assignee] || '#9ca3af';
            const tags        = t.tags ? t.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
            const tagHtml     = tags.slice(0, 2).map(g =>
              `<span class="ml-tag">${escHtml(g)}</span>`).join('');

            cardsHtml += `
              <div class="ml-task-card" data-id="${escHtml(t.id)}" style="border-left-color:${color}">
                <div class="ml-card-top">
                  <span class="ml-card-title">${escHtml(t.title)}</span>
                  <span class="badge-status status-${escHtml(t.status)}">${escHtml(t.status)}</span>
                </div>
                <div class="ml-card-meta">
                  <span class="ml-avatar" style="background:${avatarColor}">${t.assignee.charAt(0)}</span>
                  <span class="ml-assignee">${escHtml(t.assignee)}</span>
                  ${t.priority ? `<span class="badge-priority priority-${escHtml(t.priority)}" style="font-size:.7rem">${escHtml(t.priority)}</span>` : ''}
                  ${tagHtml}
                </div>
                <div class="ml-card-date">
                  <i class="fa-regular fa-clock"></i>
                  ${fmtFull(t.start_date)}${t.end_date && t.end_date !== t.start_date ? ' ~ ' + fmtFull(t.end_date) : ''}
                </div>
                ${t.memo ? `<div class="ml-card-memo">${escHtml(t.memo)}</div>` : ''}
              </div>`;
          });
        }

        monthColsHtml += `
          <div class="ml-month-col ${isCurrentM ? 'current-month' : ''}">
            <div class="ml-month-head">
              ${isCurrentM ? '<span class="ml-now-dot"></span>' : ''}
              <span class="ml-month-name">${monthName}</span>
              ${mTasks.length > 0
                ? `<span class="ml-month-count">${mTasks.length}</span>`
                : ''}
            </div>
            <div class="ml-month-body">
              ${cardsHtml}
            </div>
          </div>`;
      });

      // ── 분기 헤더 배지 ──
      const memberMap = {};
      monthsInQ.forEach(mo => mo.mTasks.forEach(t => {
        memberMap[t.assignee] = (memberMap[t.assignee] || 0) + 1;
      }));
      const memberBadges = Object.entries(memberMap).map(([name, cnt]) =>
        `<span class="qt-member-badge" style="background:${MEMBER_COLORS[name] || '#9ca3af'}">${name} ${cnt}</span>`
      ).join('');

      // ── 흐름 차트 (Flow Chart) ──
      // 분기 전체 날짜 범위
      const qFlowStart = new Date(y, qStartM - 1, 1);
      const qFlowEnd   = new Date(y, qEndM, 0);
      const qTotalMs   = qFlowEnd - qFlowStart;

      // 오늘 마커 위치 (%)
      const todayD     = new Date(todayStr + 'T00:00:00');
      const todayPct   = (todayD >= qFlowStart && todayD <= qFlowEnd)
        ? Math.min(100, Math.max(0, ((todayD - qFlowStart) / qTotalMs) * 100))
        : null;

      // 월 눈금선 위치 (%)  — 트랙 영역 기준
      const flowMonthTicks = [];
      for (let m = qStartM; m <= qEndM; m++) {
        const d   = new Date(y, m - 1, 1);
        const pct = ((d - qFlowStart) / qTotalMs) * 100;
        flowMonthTicks.push({ m, pct });
      }

      // 업무 목록 — 담당자 구분 없이 전체 작업을 하나의 트랙으로
      const allQTasks = monthsInQ.flatMap(mo => mo.mTasks)
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

      // 트랙 내 눈금선 + 오늘선
      const trackTicksHtml = flowMonthTicks.map(({ m, pct }) =>
        `<div class="flow-tick" style="left:${pct.toFixed(2)}%"></div>`
      ).join('');
      const trackTodayHtml = todayPct !== null
        ? `<div class="flow-today-inner" style="left:${todayPct.toFixed(2)}%"></div>`
        : '';

      // 업무 막대 — 겹침 방지를 위해 행(row) 자동 배치
      const rowSlots = []; // 각 행의 마지막 end 위치(%) 저장
      let barsHtml = '';
      allQTasks.forEach(t => {
        const color = t.color || MEMBER_COLORS[t.assignee] || '#6366f1';
        const sd    = new Date((t.start_date || toDateStr(qFlowStart)) + 'T00:00:00');
        const ed    = new Date((t.end_date   || t.start_date || toDateStr(qFlowStart)) + 'T00:00:00');
        const cSD   = sd < qFlowStart ? qFlowStart : sd;
        const cED   = ed > qFlowEnd   ? qFlowEnd   : ed;
        const left  = Math.max(0, ((cSD - qFlowStart) / qTotalMs) * 100);
        const right = Math.min(100, ((cED - qFlowStart) / qTotalMs) * 100);
        const width = Math.max(0.8, right - left);

        // 겹치지 않는 행 찾기
        let row = rowSlots.findIndex(endPct => endPct + 1 <= left);
        if (row === -1) { row = rowSlots.length; }
        rowSlots[row] = right;

        const topPx = 5 + row * 34;
        barsHtml += `
          <div class="flow-bar" data-id="${escHtml(t.id)}"
            style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;top:${topPx}px;background:${color}"
            title="${escHtml(t.title)} | ${fmtFull(t.start_date)}${t.end_date && t.end_date !== t.start_date ? ' ~ ' + fmtFull(t.end_date) : ''} | ${escHtml(t.status)}">
            <span class="flow-bar-label">${escHtml(t.title)}</span>
          </div>`;
      });

      const trackHeight = 5 + (rowSlots.length || 1) * 34 + 5;

      const flowRowsHtml = `
        <div class="flow-single-track" style="height:${trackHeight}px">
          ${trackTicksHtml}
          ${trackTodayHtml}
          ${barsHtml}
        </div>`;

      // 축 헤더 (월 레이블 행)
      const axisHeaderHtml = flowMonthTicks.map(({ m, pct }) =>
        `<div class="flow-axis-tick" style="left:${pct.toFixed(2)}%">${m}월</div>`
      ).join('');
      const axisTodayHtml = todayPct !== null
        ? `<div class="flow-axis-today" style="left:${todayPct.toFixed(2)}%">오늘</div>`
        : '';

      const flowChartHtml = `
        <div class="flow-chart">
          <div class="flow-axis-row">
            <div class="flow-axis-labels" style="margin-left:0">
              ${axisHeaderHtml}
              ${axisTodayHtml}
            </div>
          </div>
          <div class="flow-rows">
            ${flowRowsHtml}
          </div>
        </div>`;

      outerHtml += `
        <div class="qt-quarter ${isCurrentQ ? 'current-quarter' : ''}">
          <div class="qt-quarter-header">
            <div class="qt-quarter-title">
              ${isCurrentQ ? '<span class="qt-now-badge">NOW</span>' : ''}
              <i class="fa-solid fa-layer-group"></i>
              ${y}년 Q${q}
              <span class="qt-quarter-sub">${['1 · 2 · 3월','4 · 5 · 6월','7 · 8 · 9월','10 · 11 · 12월'][q-1]}</span>
            </div>
            <div class="qt-header-right">
              ${memberBadges}
              <span class="qt-task-count">${totalQTasks}개 작업</span>
            </div>
          </div>
          ${flowChartHtml}
          <div class="ml-month-grid">
            ${monthColsHtml}
          </div>
        </div>`;
    }
  }

  container.innerHTML = outerHtml ||
    `<div class="empty-state"><i class="fa-solid fa-timeline"></i><p>표시할 작업이 없습니다.</p></div>`;

  // 현재 분기/월로 부드럽게 스크롤
  const currentEl = container.querySelector('.current-quarter');
  if (currentEl) currentEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // 클릭 이벤트
  container.querySelectorAll('.ml-task-card[data-id], .flow-bar[data-id]').forEach(el => {
    el.addEventListener('click', () => openEditModal(el.dataset.id));
  });
}

// ─────────────────────────────────────────────
//  CHECKLIST VIEW — 월간 계획표
// ─────────────────────────────────────────────

// 체크 상태 로컬 저장 (새로고침 유지)
function getCheckKey(taskId, month) {
  return `check_${taskId}_${month}`;
}
function isChecked(taskId, month) {
  return localStorage.getItem(getCheckKey(taskId, month)) === '1';
}
function setChecked(taskId, month, val) {
  if (val) localStorage.setItem(getCheckKey(taskId, month), '1');
  else     localStorage.removeItem(getCheckKey(taskId, month));
}

function renderChecklist() {
  const year     = state.clYear;
  const month    = state.clMonth; // 0-based
  const tasks    = state.filtered;
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const defaultDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  // ── 헤더 타이틀 ──
  document.getElementById('cl-title').textContent = `${year}년 ${month + 1}월 계획표`;

  // ── 이 달에 해당하는 업무 ──
  const monthTasks = tasks
    .filter(t => {
      const sd = (t.start_date || '').slice(0, 7);
      const ed = (t.end_date   || t.start_date || '').slice(0, 7);
      return sd <= monthKey && ed >= monthKey;
    })
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

  // ── 진행률 ──
  const checkedCount = monthTasks.filter(t => isChecked(t.id, monthKey)).length;
  const total        = monthTasks.length;
  const pct          = total > 0 ? Math.round((checkedCount / total) * 100) : 0;

  document.getElementById('cl-progress-summary').textContent =
    total > 0 ? `${checkedCount} / ${total} 완료 · ${pct}%` : '등록된 업무 없음';
  const bar = document.getElementById('cl-progress-bar');
  bar.style.width      = pct + '%';
  bar.style.background = pct === 100 ? '#10b981' : pct >= 50 ? '#6366f1' : '#f59e0b';

  // ── 테이블 rows ──
  let rowsHtml = '';
  monthTasks.forEach((t, idx) => {
    const checked     = isChecked(t.id, monthKey);
    const color       = t.color || MEMBER_COLORS[t.assignee] || '#6366f1';
    const avatarColor = MEMBER_COLORS[t.assignee] || '#9ca3af';
    const tags        = t.tags ? t.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
    const tagHtml     = tags.slice(0, 3).map(g => `<span class="cl-tag">${escHtml(g)}</span>`).join('');

    rowsHtml += `
      <tr class="cl-row ${checked ? 'cl-row-done' : ''}">
        <td class="cl-td-check">
          <label class="cl-checkbox">
            <input type="checkbox" data-id="${escHtml(t.id)}" data-month="${monthKey}" ${checked ? 'checked' : ''}>
          </label>
        </td>
        <td class="cl-td-num">${idx + 1}</td>
        <td class="cl-td-title">
          <div class="cl-title-wrap">
            <span class="cl-color-dot" style="background:${color}"></span>
            <span class="cl-task-title">${escHtml(t.title)}</span>
          </div>
          ${t.memo ? `<div class="cl-memo">${escHtml(t.memo)}</div>` : ''}
        </td>
        <td class="cl-td-assignee">
          <span class="cl-avatar" style="background:${avatarColor}">${t.assignee.charAt(0)}</span>
          <span class="cl-assignee-name">${escHtml(t.assignee)}</span>
        </td>
        <td class="cl-td-date">
          ${fmtFull(t.start_date)}${t.end_date && t.end_date !== t.start_date ? `<br><span style="color:#9ca3af">~ ${fmtFull(t.end_date)}</span>` : ''}
        </td>
        <td class="cl-td-priority">
          ${t.priority ? `<span class="badge-priority priority-${escHtml(t.priority)}">${escHtml(t.priority)}</span>` : '-'}
        </td>
        <td class="cl-td-tags">${tagHtml || '-'}</td>
        <td class="cl-td-status">
          <span class="badge-status status-${escHtml(t.status)}">${escHtml(t.status)}</span>
        </td>
        <td class="cl-td-edit">
          <button class="cl-edit-btn" data-id="${escHtml(t.id)}" title="편집">
            <i class="fa-solid fa-pen"></i>
          </button>
        </td>
      </tr>`;
  });

  // ── 인라인 추가 폼 ──
  const addFormHtml = `
    <div class="cl-add-row-wrap" id="cl-add-wrap">
      <button class="cl-add-row-btn" id="cl-add-btn">
        <i class="fa-solid fa-plus"></i> ${year}년 ${month + 1}월 업무 추가
      </button>
      <form class="cl-inline-form" id="cl-inline-form" style="display:none">
        <div class="cl-inline-fields">
          <input class="cl-if-title"    type="text" placeholder="업무명을 입력하세요 *" required />
          <select class="cl-if-assignee">
            <option value="이상희">이상희</option>
            <option value="정현동">정현동</option>
            <option value="홍준기">홍준기</option>
          </select>
          <input class="cl-if-date"     type="date" value="${defaultDate}" />
          <select class="cl-if-priority">
            <option value="보통">보통</option>
            <option value="높음">높음</option>
            <option value="낮음">낮음</option>
          </select>
          <input class="cl-if-memo"     type="text" placeholder="메모 (선택)" />
        </div>
        <div class="cl-inline-actions">
          <button type="submit"  class="cl-if-save"><i class="fa-solid fa-check"></i> 저장</button>
          <button type="button"  class="cl-if-cancel"><i class="fa-solid fa-xmark"></i> 취소</button>
        </div>
      </form>
    </div>`;

  // ── 빈 달 ──
  const emptyRow = monthTasks.length === 0 ? `
    <tr>
      <td colspan="9" style="text-align:center;padding:36px 0;color:var(--text-muted);font-size:.85rem">
        <i class="fa-regular fa-calendar-xmark" style="font-size:1.6rem;display:block;margin-bottom:8px"></i>
        이 달에 등록된 업무가 없습니다.
      </td>
    </tr>` : '';

  // ── 최종 HTML 조립 ──
  const body = document.getElementById('checklist-body');
  body.innerHTML = `
    <div class="cl-month-block">
      <div class="cl-table-wrap">
        <table class="cl-table">
          <thead>
            <tr>
              <th class="cl-th-check">완료</th>
              <th class="cl-th-num">#</th>
              <th class="cl-th-title">업무 내용</th>
              <th class="cl-th-assignee">담당자</th>
              <th class="cl-th-date">일정</th>
              <th class="cl-th-priority">우선순위</th>
              <th class="cl-th-tags">태그</th>
              <th class="cl-th-status">상태</th>
              <th class="cl-th-edit"></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}${emptyRow}</tbody>
        </table>
      </div>
      ${addFormHtml}
    </div>`;

  // ── 이벤트 바인딩 ──
  // 체크박스
  body.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', e => {
      const id  = e.target.dataset.id;
      const mk  = e.target.dataset.month;
      setChecked(id, mk, e.target.checked);
      const task = state.tasks.find(t => t.id === id);
      if (!task) return;
      API.update(id, { ...task, status: e.target.checked ? '완료' : '진행중' })
        .then(() => loadAndRender()).catch(() => {});
      toast(e.target.checked ? '✅ 완료 처리되었습니다!' : '↩️ 완료가 취소되었습니다.', 'default');
    });
  });

  // 편집 버튼
  body.querySelectorAll('.cl-edit-btn[data-id]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });

  // 추가 버튼 → 폼 열기
  body.querySelector('#cl-add-btn').addEventListener('click', () => {
    body.querySelector('#cl-add-btn').style.display = 'none';
    const form = body.querySelector('#cl-inline-form');
    form.style.display = 'flex';
    form.querySelector('.cl-if-title').focus();
  });

  // 취소
  body.querySelector('.cl-if-cancel').addEventListener('click', () => {
    body.querySelector('#cl-inline-form').style.display = 'none';
    body.querySelector('#cl-add-btn').style.display = 'flex';
    body.querySelector('#cl-inline-form').reset();
    body.querySelector('.cl-if-date').value = defaultDate;
  });

  // 저장
  body.querySelector('#cl-inline-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form     = body.querySelector('#cl-inline-form');
    const title    = form.querySelector('.cl-if-title').value.trim();
    if (!title) { toast('업무명을 입력해주세요.', 'error'); return; }
    const assignee = form.querySelector('.cl-if-assignee').value;
    const date     = form.querySelector('.cl-if-date').value;
    const priority = form.querySelector('.cl-if-priority').value;
    const memo     = form.querySelector('.cl-if-memo').value.trim();
    const color    = MEMBER_COLORS[assignee] || '#6366f1';

    const saveBtn = form.querySelector('.cl-if-save');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
      await API.create({
        title, assignee,
        start_date: date,
        end_date:   date,
        priority, memo,
        status:  '예정',
        project: '마케팅 업무 일정',
        color, tags: '', link: ''
      });
      toast('✅ 업무가 추가되었습니다!', 'success');
      await loadAndRender();
    } catch (err) {
      toast(err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> 저장';
    }
  });
}

// ─────────────────────────────────────────────
//  MODAL — Open / Close / Fill / Save
// ─────────────────────────────────────────────
function openAddModal() {
  state.editingId = null;
  document.getElementById('modal-title').textContent = '새 작업 추가';
  document.getElementById('task-form').reset();
  document.getElementById('task-id').value = '';
  document.getElementById('f-project').value = '마케팅 업무 일정';
  document.getElementById('f-color').value = '#6366f1';
  document.getElementById('btn-delete-task').style.display = 'none';
  document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('active'));
  document.querySelector('.color-preset[data-color="#6366f1"]')?.classList.add('active');
  document.getElementById('task-modal').hidden = false;
  document.getElementById('f-title').focus();
}

function openEditModal(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  state.editingId = id;

  document.getElementById('modal-title').textContent = '작업 수정';
  document.getElementById('task-id').value = task.id;
  document.getElementById('f-title').value = task.title || '';
  document.getElementById('f-project').value = task.project || '마케팅 업무 일정';
  document.getElementById('f-assignee').value = task.assignee || '이상희';
  document.getElementById('f-status').value = task.status || '예정';
  document.getElementById('f-start').value = task.start_date || '';
  document.getElementById('f-end').value = task.end_date || '';
  document.getElementById('f-priority').value = task.priority || '보통';
  document.getElementById('f-color').value = task.color || '#6366f1';
  document.getElementById('f-tags').value = task.tags || '';
  document.getElementById('f-memo').value = task.memo || '';
  document.getElementById('f-link').value = task.link || '';
  document.getElementById('btn-delete-task').style.display = 'flex';

  document.querySelectorAll('.color-preset').forEach(p => {
    p.classList.toggle('active', p.dataset.color === (task.color || '#6366f1'));
  });

  document.getElementById('task-modal').hidden = false;
  document.getElementById('f-title').focus();
}

function closeModal() {
  document.getElementById('task-modal').hidden = true;
  state.editingId = null;
}

async function saveTask(e) {
  e.preventDefault();
  const title = document.getElementById('f-title').value.trim();
  if (!title) { toast('작업명을 입력해주세요.', 'error'); return; }

  const data = {
    title,
    project:    document.getElementById('f-project').value.trim(),
    assignee:   document.getElementById('f-assignee').value,
    status:     document.getElementById('f-status').value,
    start_date: document.getElementById('f-start').value,
    end_date:   document.getElementById('f-end').value,
    priority:   document.getElementById('f-priority').value,
    color:      document.getElementById('f-color').value,
    tags:       document.getElementById('f-tags').value.trim(),
    memo:       document.getElementById('f-memo').value.trim(),
    link:       document.getElementById('f-link').value.trim()
  };

  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  btn.textContent = '저장 중…';

  try {
    if (state.editingId) {
      await API.update(state.editingId, data);
      toast('작업이 수정되었습니다.', 'success');
    } else {
      await API.create(data);
      toast('새 작업이 추가되었습니다.', 'success');
    }
    closeModal();
    await loadAndRender();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> 저장';
  }
}

async function deleteTask() {
  if (!state.editingId) return;
  const task = state.tasks.find(t => t.id === state.editingId);
  if (!confirm(`"${task?.title || '작업'}"을(를) 삭제하시겠습니까?`)) return;

  try {
    await API.remove(state.editingId);
    toast('작업이 삭제되었습니다.', 'success');
    closeModal();
    await loadAndRender();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─────────────────────────────────────────────
//  LOAD & RENDER
// ─────────────────────────────────────────────
async function loadAndRender() {
  try {
    state.tasks = await API.list();
  } catch (err) {
    toast(err.message, 'error');
    state.tasks = [];
  }
  renderView();
}

// ─────────────────────────────────────────────
//  INIT — Event Listeners
// ─────────────────────────────────────────────
function init() {
  // View tab switch
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      renderView();
    });
  });

  // Filters
  ['filter-assignee', 'filter-status', 'filter-priority'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      const key = id.replace('filter-', '');
      state.filters[key] = e.target.value;
      renderView();
    });
  });

  // Add task button
  document.getElementById('btn-open-modal').addEventListener('click', openAddModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('btn-delete-task').addEventListener('click', deleteTask);
  document.getElementById('task-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Form submit
  document.getElementById('task-form').addEventListener('submit', saveTask);

  // Calendar navigation
  document.getElementById('cal-prev').addEventListener('click', () => {
    state.calMonth--;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    state.calMonth++;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderCalendar();
  });

  // Checklist navigation
  document.getElementById('cl-prev').addEventListener('click', () => {
    state.clMonth--;
    if (state.clMonth < 0) { state.clMonth = 11; state.clYear--; }
    renderChecklist();
  });
  document.getElementById('cl-next').addEventListener('click', () => {
    state.clMonth++;
    if (state.clMonth > 11) { state.clMonth = 0; state.clYear++; }
    renderChecklist();
  });

  // Color presets
  document.querySelectorAll('.color-preset').forEach(p => {
    p.addEventListener('click', () => {
      document.getElementById('f-color').value = p.dataset.color;
      document.querySelectorAll('.color-preset').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
    });
  });
  document.getElementById('f-color').addEventListener('input', e => {
    document.querySelectorAll('.color-preset').forEach(p => {
      p.classList.toggle('active', p.dataset.color === e.target.value);
    });
  });

  // Keyboard: ESC closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // Start
  loadAndRender();
}

document.addEventListener('DOMContentLoaded', init);

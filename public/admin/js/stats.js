// לשונית "שיחות לפי אולם": סיכום, תובנות, טבלה לפי אולם (חיפוש, סינון, קיבוץ, מיון) וטבלה לפי יום.
import { api } from './api.js';
import { $, escapeHtml, formatNumber, icon, percent, matches, pref, savePref, downloadCsv, fillSelect, uniqueSorted } from './dom.js';
import { initSearch, initChips, initSort, sortBy } from './controls.js';
import { reasonsLegend, redSegments, reasonsTitle, buildRows, HALL_GETTERS, HALL_SORTS, byName, searchText, location } from './data.js';
import { daysBetween, formatDay, hebrewDay, isWeekend, MAX_DAYS } from './dates.js';

const DAY_SORTS = [
  { key: 'day', label: 'תאריך', first: 'desc' },
  { key: 'total', label: 'סה"כ שיחות' },
  { key: 'answered', label: 'שיחות שנענו' },
  { key: 'unanswered', label: 'שיחות שלא נענו' },
];

const VIEWS = {
  all: () => true,
  calls: (r) => r.total > 0,
  missed: (r) => r.unanswered > 0,
  idle: (r) => r.total === 0,
};

let rows = [];
let lastRange = null, lastDays = [], lastHallDays = null;
let selectedHall = null;
const filters = { term: '', city: '', hood: '', group: '', ...pref('statsFilters', {}) };
let view, hallSort, daySort, hideEmptyDays = false;

export async function loadStats(range, halls, isCurrent = () => true) {
  const [byHall, allDays, hallDays] = await Promise.all([
    api.statsByHall(range),
    api.statsByDay(range),
    selectedHall ? api.statsByDay(range, selectedHall.id) : null,
  ]);
  if (!isCurrent()) return;
  rows = buildRows(halls, byHall);
  lastRange = range; lastDays = allDays; lastHallDays = hallDays;
  // האולם הנבחר מתעדכן לגרסה העדכנית (שם או עיר שהשתנו), ואם נמחק - הבחירה מתבטלת
  if (selectedHall) selectedHall = rows.find((r) => r.id === selectedHall.id)?.hall ?? null;

  fillSelect($('#statsCity'), uniqueSorted(rows.map((r) => r.city)), 'כל הערים');
  filters.city = $('#statsCity').value;
  fillHoods();
  renderTotals(allDays);
  renderInsights();
  renderHallTable();
  renderDays();
}

function fillHoods() {
  const pool = filters.city ? rows.filter((r) => r.city === filters.city) : rows;
  fillSelect($('#statsHood'), uniqueSorted(pool.flatMap((r) => r.hoods)), 'כל השכונות');
  filters.hood = $('#statsHood').value;
}

function renderTotals(byDay) {
  const sum = (key) => byDay.reduce((acc, d) => acc + Number(d[key]), 0);
  const calls = sum('calls'), reached = sum('reached'), answered = sum('answered'), unanswered = sum('unanswered');
  $('#totals').innerHTML = `
    <div><dt>שיחות למערכת</dt><dd>${formatNumber(calls)}</dd></div>
    <div><dt>הועברו לאולם</dt><dd>${formatNumber(reached)}</dd></div>
    <div class="yes"><dt>נענו ${percent(answered, reached)}</dt><dd>${formatNumber(answered)}</dd></div>
    <div class="no"><dt>לא נענו</dt><dd>${formatNumber(unanswered)}</dd>${reasonsLegend({ unanswered, cancelled: sum('cancelled'), busy: sum('busy'), failed: sum('failed') })}</div>`;
}

// כמה נקודות עיקריות בלי לחפש בטבלה; לחיצה על תובנה פותחת את האולם או מסננת
function renderInsights() {
  const cards = [];
  const withCalls = rows.filter((r) => r.total > 0);
  if (withCalls.length) {
    const top = sortBy(withCalls, { key: 'total', dir: 'desc' }, HALL_GETTERS, byName)[0];
    cards.push(insight('האולם הכי פעיל', top.name, `${formatNumber(top.total)} שיחות`, { hall: top.id }));

    const missed = sortBy(withCalls.filter((r) => r.unanswered > 0), { key: 'unanswered', dir: 'desc' }, HALL_GETTERS, byName)[0];
    if (missed) cards.push(insight('הכי הרבה שיחות שלא נענו', missed.name, `${formatNumber(missed.unanswered)} שיחות`, { hall: missed.id }, 'no'));

    const worst = sortBy(withCalls.filter((r) => r.total >= 3), { key: 'rate', dir: 'asc' }, HALL_GETTERS, byName)[0];
    if (worst && worst.rate < 1) cards.push(insight('אחוז המענה הנמוך ביותר', worst.name, `${Math.round(worst.rate * 100)}% מתוך ${formatNumber(worst.total)}`, { hall: worst.id }, 'no'));

    const cities = new Map();
    for (const r of withCalls) cities.set(r.city, (cities.get(r.city) || 0) + r.total);
    const [city, count] = [...cities].sort((a, b) => b[1] - a[1])[0];
    cards.push(insight('העיר הפעילה ביותר', city || 'ללא עיר', `${formatNumber(count)} שיחות`, { city }));
  }
  const idle = rows.filter((r) => r.total === 0 && r.active).length;
  if (idle) cards.push(insight('אולמות פעילים בלי שיחות', formatNumber(idle), 'בתקופה שנבחרה', { view: 'idle' }));
  $('#insights').innerHTML = cards.join('');
}

function insight(label, value, sub, target, tone = '') {
  const attrs = Object.entries(target).map(([k, v]) => `data-${k}="${escapeHtml(v)}"`).join(' ');
  return `<button class="insight ${tone}" ${attrs}><span class="label">${label}</span><strong>${escapeHtml(value)}</strong><span class="sub">${sub}</span></button>`;
}

function visibleRows() {
  const kind = VIEWS[view.get()];
  return rows.filter((r) => kind(r)
    && (!filters.city || r.city === filters.city)
    && (!filters.hood || r.hoods.includes(filters.hood))
    && matches(searchText(r), filters.term));
}

const sum = (list, key) => list.reduce((acc, r) => acc + r[key], 0);
const rateOf = (list) => { const t = sum(list, 'total'); return t ? sum(list, 'answered') / t : null; };

function statCells(total, answered, unanswered, rate, reasons = null) {
  return `<td class="num total" data-label="סה&quot;כ">${formatNumber(total)}</td>
      <td class="num yes" data-label="נענו">${formatNumber(answered)}</td>
      <td class="num no" data-label="לא נענו"${reasons ? ` title="${reasonsTitle(reasons)}"` : ''}>${formatNumber(unanswered)}</td>
      <td class="num" data-label="אחוז מענה">${rate == null ? '<span class="dash">-</span>' : `<span class="pct">${Math.round(rate * 100)}%</span><span class="meter" aria-hidden="true"><i style="width:${rate * 100}%"></i></span>`}</td>`;
}

function hallRow(r) {
  return `<tr class="clickable${r.total ? '' : ' idle'}${selectedHall?.id === r.id ? ' selected' : ''}${r.active ? '' : ' off'}" data-id="${r.id}" tabindex="0">
      <td class="span-all name">${escapeHtml(r.name)}${r.active ? '' : ' <span class="tag">מושבת</span>'}<span class="loc">${location(r)}</span></td>
      <td class="hide-sm">${escapeHtml(r.city)}</td>
      <td class="hide-sm">${escapeHtml(r.hood)}</td>
      ${statCells(r.total, r.answered, r.unanswered, r.rate, r)}
      <td class="more"><button class="icon-btn details-btn" data-id="${r.id}" aria-label="פרטי ${escapeHtml(r.name)}" title="פרטי האולם">${icon('more')}</button></td>
    </tr>`;
}

function groupRow(label, list) {
  return `<tr class="group-row"><td colspan="8"><strong>${escapeHtml(label)}</strong>
    <span>${list.length} אולמות · ${formatNumber(sum(list, 'total'))} שיחות · ${formatNumber(sum(list, 'answered'))} נענו · ${formatNumber(sum(list, 'unanswered'))} לא נענו</span></td></tr>`;
}

function renderHallTable() {
  const visible = visibleRows();
  const sorted = sortBy(visible, hallSort.state, HALL_GETTERS, byName);

  let html = '';
  if (filters.group) {
    const groupKey = filters.group;
    const groups = new Map();
    for (const r of sorted) {
      const label = r[groupKey] || (groupKey === 'city' ? 'ללא עיר' : 'ללא שכונה');
      (groups.get(label) ?? groups.set(label, []).get(label)).push(r);
    }
    // סדר הקבוצות: לפי הערך המצטבר כשממיינים לפי מספרים, אחרת לפי שם
    const numeric = ['total', 'answered', 'unanswered', 'rate'].includes(hallSort.state.key);
    const list = [...groups].map(([label, items]) => ({ label, items }));
    const getters = {
      label: (g) => g.label, total: (g) => sum(g.items, 'total'), answered: (g) => sum(g.items, 'answered'),
      unanswered: (g) => sum(g.items, 'unanswered'), rate: (g) => rateOf(g.items),
    };
    const order = numeric ? hallSort.state : { key: 'label', dir: hallSort.state.key === groupKey ? hallSort.state.dir : 'asc' };
    html = sortBy(list, order, getters, (a, b) => a.label.localeCompare(b.label, 'he'))
      .map((g) => groupRow(g.label, g.items) + g.items.map(hallRow).join('')).join('');
  } else {
    html = sorted.map(hallRow).join('');
  }

  if (visible.length > 1) {
    html += `<tr class="sum-row"><td class="span-all name">סה"כ במה שמוצג</td><td class="hide-sm"></td><td class="hide-sm"></td>
      ${statCells(sum(visible, 'total'), sum(visible, 'answered'), sum(visible, 'unanswered'), rateOf(visible))}<td class="more"></td></tr>`;
  }

  $('#hallStats').innerHTML = visible.length ? html
    : `<tr><td colspan="8" class="empty">${rows.length ? 'אין אולמות שמתאימים לחיפוש או לסינון.' : 'עוד אין אולמות.'}</td></tr>`;
  $('#statsCount').textContent = rows.length ? `${formatNumber(visible.length)} מתוך ${formatNumber(rows.length)} אולמות` : '';

  const counts = {};
  const scoped = rows.filter((r) => (!filters.city || r.city === filters.city) && (!filters.hood || r.hoods.includes(filters.hood)) && matches(searchText(r), filters.term));
  for (const name of Object.keys(VIEWS)) counts[name] = scoped.filter(VIEWS[name]).length;
  view.counts(counts);
}

function renderDays() {
  if (!lastRange) return; // עוד לא נטען
  const byDay = lastHallDays ?? lastDays;
  $('#daysTitle').textContent = selectedHall ? `לפי יום: ${selectedHall.name}` : 'לפי יום, כל האולמות';
  $('#clearHall').hidden = !selectedHall;
  $('#openCalls').hidden = !selectedHall;

  const data = new Map(byDay.map((d) => [d.day, d]));
  const max = Math.max(1, ...byDay.map((d) => Number(selectedHall ? d.reached : d.calls)));
  const allDays = daysBetween(lastRange.from, lastRange.to);
  $('#daysNote').hidden = allDays[0] <= lastRange.from;
  $('#daysNote').textContent = `הטווח ארוך: מוצגים ${MAX_DAYS} הימים האחרונים בו. הסיכומים למעלה כוללים את כל הטווח.`;
  let list = allDays.map((day) => {
    const d = data.get(day) || { calls: 0, reached: 0, answered: 0, unanswered: 0 };
    const total = Number(selectedHall ? d.reached : d.calls);
    return { day, total, answered: Number(d.answered), unanswered: Number(d.unanswered), cancelled: Number(d.cancelled || 0), busy: Number(d.busy || 0), failed: Number(d.failed || 0) };
  });
  if (hideEmptyDays) list = list.filter((d) => d.total > 0);
  list = sortBy(list, daySort.state, { day: (d) => d.day, total: (d) => d.total, answered: (d) => d.answered, unanswered: (d) => d.unanswered },
    (a, b) => b.day.localeCompare(a.day));

  $('#dayStats').innerHTML = list.length ? list.map((d) => {
    const other = Math.max(0, d.total - d.answered - d.unanswered); // לא הגיעו לאולם / בתהליך
    const w = (n) => `${(n / max) * 100}%`;
    return `<tr class="${isWeekend(d.day) ? 'weekend' : ''}">
      <td class="span-all name">${formatDay(d.day)} <span class="heb">${hebrewDay(d.day)}</span></td>
      <td class="num total" data-label="סה&quot;כ">${formatNumber(d.total)}</td>
      <td class="num yes" data-label="נענו">${formatNumber(d.answered)}</td>
      <td class="num no" data-label="לא נענו" title="${reasonsTitle(d)}">${formatNumber(d.unanswered)}</td>
      <td class="span-all"><span class="bar" aria-hidden="true"><i class="y" style="width:${w(d.answered)}"></i>${redSegments(d, w)}<i class="o" style="width:${w(other)}"></i></span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">אין שיחות בתקופה הזו.</td></tr>';
}

function selectHall(id) {
  const row = rows.find((r) => String(r.id) === String(id));
  if (!row) return;
  selectedHall = selectedHall?.id === row.id ? null : row.hall;
  document.dispatchEvent(new CustomEvent('stats-select'));
  $('#daysHead').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportCsv() {
  if (!lastRange) return; // עוד לא נטען
  const list = sortBy(visibleRows(), hallSort.state, HALL_GETTERS, byName);
  downloadCsv(`שיחות-לפי-אולם-${lastRange.from}-${lastRange.to}.csv`,
    ['אולם', 'עיר', 'שכונה', 'סה"כ שיחות', 'נענו', 'לא נענו', 'אחוז מענה'],
    list.map((r) => [r.name, r.city, r.hood, r.total, r.answered, r.unanswered, r.rate == null ? '' : `${Math.round(r.rate * 100)}%`]));
}

export const getSelectedHall = () => selectedHall;
// משחזר בחירת אולם (בחזרה אחורה) בלי לטעון; הטעינה נעשית אחר כך ב-refresh
export function setSelectedHall(hall) { selectedHall = hall; }

export function initStats(reload) {
  const remember = () => savePref('statsFilters', { city: '', hood: '', group: filters.group });
  initSearch($('#statsSearch'), (value) => { filters.term = value; renderHallTable(); });

  $('#statsCity').addEventListener('change', (e) => { filters.city = e.target.value; fillHoods(); renderHallTable(); });
  $('#statsHood').addEventListener('change', (e) => { filters.hood = e.target.value; renderHallTable(); });
  $('#statsGroup').value = filters.group;
  $('#statsGroup').addEventListener('change', (e) => { filters.group = e.target.value; remember(); renderHallTable(); });

  view = initChips($('#statsView'), pref('statsView', { value: 'all' }).value, (value) => { savePref('statsView', { value }); renderHallTable(); });
  hallSort = initSort({
    box: $('#statsSort'), table: $('.stats-table'), options: HALL_SORTS,
    initial: pref('statsSort', { key: 'total', dir: 'desc' }),
    onChange: (state) => { savePref('statsSort', state); renderHallTable(); },
  });
  daySort = initSort({
    box: $('#daysSort'), table: $('.days-table'), options: DAY_SORTS,
    initial: pref('daysSort', { key: 'day', dir: 'desc' }),
    onChange: (state) => { savePref('daysSort', state); renderDays(); },
  });
  $('#hideEmptyDays').addEventListener('change', (e) => { hideEmptyDays = e.target.checked; renderDays(); });
  $('#statsExport').addEventListener('click', exportCsv);

  const onRow = (e) => {
    const more = e.target.closest('.details-btn');
    if (more) { // שלוש הנקודות: חלון פרטי האולם, בלי לבחור את האולם
      if (e.type === 'click') document.dispatchEvent(new CustomEvent('open-details', { detail: { id: more.dataset.id } }));
      return;
    }
    const tr = e.target.closest('tr[data-id]');
    const row = tr && rows.find((r) => String(r.id) === tr.dataset.id);
    if (row) document.dispatchEvent(new CustomEvent('open-calls', { detail: { hall: row.hall } })); // לחיצה על אולם: יומן השיחות שלו
  };
  $('#hallStats').addEventListener('click', onRow);
  $('#hallStats').addEventListener('keydown', (e) => { if (e.key === 'Enter') onRow(e); });
  document.addEventListener('stats-select', reload);

  $('#insights').addEventListener('click', (e) => {
    const card = e.target.closest('.insight');
    if (!card) return;
    if (card.dataset.hall) selectHall(card.dataset.hall);
    else if (card.dataset.view) view.set(card.dataset.view);
    else if (card.dataset.city != null) {
      $('#statsCity').value = card.dataset.city;
      filters.city = $('#statsCity').value;
      fillHoods();
      renderHallTable();
      $('#statsSearch').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  $('#clearHall').addEventListener('click', () => { selectedHall = null; document.dispatchEvent(new CustomEvent('stats-select')); });
  $('#openCalls').addEventListener('click', () => {
    if (selectedHall) document.dispatchEvent(new CustomEvent('open-calls', { detail: { hall: selectedHall } }));
  });
}

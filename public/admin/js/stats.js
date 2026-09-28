// לשונית "שיחות לפי אולם": סיכום, טבלה לפי אולם וטבלה לפי יום.
import { api } from './api.js';
import { $, $$, escapeHtml, formatNumber, percent } from './dom.js';
import { daysBetween, formatDay, hebrewDay, isWeekend } from './dates.js';

let rows = [];                                  // שורה לכל אולם: פרטים + מספרים
let sort = { key: 'total', dir: 'descending' };
let selectedHall = null;

export async function loadStats(range, halls, isCurrent = () => true) {
  const [byHall, allDays, hallDays] = await Promise.all([
    api.statsByHall(range),
    api.statsByDay(range),
    selectedHall ? api.statsByDay(range, selectedHall.id) : null,
  ]);
  if (!isCurrent()) return;
  const stats = new Map(byHall.map((r) => [r.hall_id, r]));
  rows = halls.map((h) => {
    const s = stats.get(h.id) || { total: 0, answered: 0, unanswered: 0 };
    return {
      hall: h, name: h.name, city: h.city_name,
      total: Number(s.total), answered: Number(s.answered), unanswered: Number(s.unanswered),
      rate: s.total ? s.answered / s.total : -1,
    };
  });
  renderTotals(allDays);
  renderHallTable();
  renderDays(range, hallDays ?? allDays);
}

function renderTotals(byDay) {
  const sum = (key) => byDay.reduce((acc, d) => acc + Number(d[key]), 0);
  const calls = sum('calls'), reached = sum('reached'), answered = sum('answered'), unanswered = sum('unanswered');
  $('#totals').innerHTML = `
    <div><dt>שיחות למערכת</dt><dd>${formatNumber(calls)}</dd></div>
    <div><dt>הועברו לאולם</dt><dd>${formatNumber(reached)}</dd></div>
    <div class="yes"><dt>נענו ${percent(answered, reached)}</dt><dd>${formatNumber(answered)}</dd></div>
    <div class="no"><dt>לא נענו</dt><dd>${formatNumber(unanswered)}</dd></div>`;
}

function renderHallTable() {
  const term = $('#statsSearch').value.trim();
  const showIdle = $('#showIdle').checked;
  const visible = rows
    .filter((r) => (showIdle || r.total > 0) && (!term || r.name.includes(term) || r.city.includes(term)))
    .sort(compare);

  $$('.stats-table th[data-sort]').forEach((th) =>
    th.setAttribute('aria-sort', th.dataset.sort === sort.key ? sort.dir : 'none'));

  $('#hallStats').innerHTML = visible.length ? visible.map((r) => `
    <tr class="clickable${r.total ? '' : ' idle'}${selectedHall?.id === r.hall.id ? ' selected' : ''}" data-id="${r.hall.id}">
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.city)}</td>
      <td class="num total">${formatNumber(r.total)}</td>
      <td class="num yes">${formatNumber(r.answered)}</td>
      <td class="num no">${formatNumber(r.unanswered)}</td>
      <td class="num">${percent(r.answered, r.total)}</td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="empty">${rows.some((r) => r.total)
      ? 'אין אולמות שמתאימים לחיפוש.' : 'אין שיחות לאולמות בתקופה הזו.'}</td></tr>`;
}

function compare(a, b) {
  const dir = sort.dir === 'ascending' ? 1 : -1;
  const va = a[sort.key], vb = b[sort.key];
  const diff = typeof va === 'string' ? va.localeCompare(vb, 'he') : va - vb;
  return diff * dir || a.name.localeCompare(b.name, 'he');
}

function renderDays(range, byDay) {
  $('#daysTitle').textContent = selectedHall ? `לפי יום: ${selectedHall.name}` : 'לפי יום, כל האולמות';
  $('#clearHall').hidden = !selectedHall;

  const data = new Map(byDay.map((d) => [d.day, d]));
  const days = daysBetween(range.from, range.to).reverse(); // החדש למעלה
  const max = Math.max(1, ...byDay.map((d) => Number(selectedHall ? d.reached : d.calls)));

  $('#dayStats').innerHTML = days.map((day) => {
    const d = data.get(day) || { calls: 0, reached: 0, answered: 0, unanswered: 0 };
    const total = Number(selectedHall ? d.reached : d.calls);
    const answered = Number(d.answered), unanswered = Number(d.unanswered);
    const other = Math.max(0, total - answered - unanswered); // לא הגיעו לאולם / בתהליך
    const w = (n) => `${(n / max) * 100}%`;
    return `<tr class="${isWeekend(day) ? 'weekend' : ''}">
      <td>${formatDay(day)} <span class="heb">${hebrewDay(day)}</span></td>
      <td class="num total">${formatNumber(total)}</td>
      <td class="num yes">${formatNumber(answered)}</td>
      <td class="num no">${formatNumber(unanswered)}</td>
      <td><span class="bar" aria-hidden="true"><i class="y" style="width:${w(answered)}"></i><i class="n" style="width:${w(unanswered)}"></i><i class="o" style="width:${w(other)}"></i></span></td>
    </tr>`;
  }).join('');
}

export function initStats(reload) {
  $('#statsSearch').addEventListener('input', renderHallTable);
  $('#showIdle').addEventListener('change', renderHallTable);

  $$('.stats-table th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    const key = th.dataset.sort;
    const textual = key === 'name' || key === 'city';
    sort = sort.key === key
      ? { key, dir: sort.dir === 'ascending' ? 'descending' : 'ascending' }
      : { key, dir: textual ? 'ascending' : 'descending' };
    renderHallTable();
  }));

  $('#hallStats').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const hall = rows.find((r) => String(r.hall.id) === tr.dataset.id).hall;
    selectedHall = selectedHall?.id === hall.id ? null : hall;
    reload();
    $('#daysTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#clearHall').addEventListener('click', () => { selectedHall = null; reload(); });
}

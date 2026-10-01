// לשונית "ניהול אולמות": כרטיסים עם חיפוש, סינון, מיון, הוספה ועריכה.
import { api } from './api.js';
import { $, toast, showError, escapeHtml, formatNumber, icon, matches, pref, savePref, downloadCsv, fillSelect, uniqueSorted } from './dom.js';
import { initSearch, initChips, initSort, sortBy } from './controls.js';
import { splitHoods } from './hoods.js';
import { buildRows, HALL_GETTERS, HALL_SORTS, byName, searchText, location, suggestExtension } from './data.js';

const SORTS = [...HALL_SORTS,
  { key: 'guests', label: 'מקסימום אורחים' },
  { key: 'ext', label: 'מספר שלוחה', text: true, first: 'asc' }];

const VIEWS = {
  all: () => true,
  active: (r) => r.active,
  off: (r) => !r.active,
  idle: (r) => r.total === 0,
};

let halls = [];
let rows = [];
let editing = null;
let autoExt = '';   // ההצעה האחרונה שמולאה אוטומטית (מחליפים אותה רק אם לא נערכה ידנית)
let onSaved = () => {};
const filters = { term: '', city: '', hood: '' };
let view, sort;

let statsOk = true; // אם חישוב הסטטיסטיקה נכשל, האולמות עדיין מוצגים (ואפשר לערוך אותם), בלי מספרי שיחות

export async function loadHalls(range, list, isCurrent = () => true) {
  let byHall = [];
  statsOk = true;
  try {
    byHall = await api.statsByHall(range);
  } catch (err) {
    statsOk = false;
    if (isCurrent()) showError(`מספרי השיחות לא נטענו, האולמות מוצגים בלעדיהם. ${err.message}`);
  }
  if (!isCurrent()) return;
  halls = list;
  rows = buildRows(halls, byHall);
  fillSuggestions();
  fillSelect($('#hallsCity'), uniqueSorted(rows.map((r) => r.city)), 'כל הערים');
  filters.city = $('#hallsCity').value;
  fillHoods();
  renderHalls();
}

function fillHoods() {
  const pool = filters.city ? rows.filter((r) => r.city === filters.city) : rows;
  fillSelect($('#hallsHood'), uniqueSorted(pool.flatMap((r) => r.hoods)), 'כל השכונות');
  filters.hood = $('#hallsHood').value;
}

function visibleRows() {
  return rows.filter((r) => VIEWS[view.get()](r)
    && (!filters.city || r.city === filters.city)
    && (!filters.hood || r.hoods.includes(filters.hood))
    && matches(searchText(r), filters.term));
}

function card(r) {
  const h = r.hall;
  return `<article class="hall-card${r.active ? '' : ' off'}" data-id="${r.id}">
    <header>
      <h3>${escapeHtml(r.name)}</h3>${r.active ? '' : '<span class="tag">מושבת</span>'}
      <button class="icon-btn edit" data-id="${r.id}" aria-label="עריכת ${escapeHtml(r.name)}" title="עריכה">${icon('edit')}</button>
    </header>
    <p class="loc">${icon('pin')}${location(r) || '<span class="muted">בלי עיר</span>'}${h.address ? `<span class="addr"> · ${escapeHtml(h.address)}</span>` : ''}</p>
    <ul class="facts">
      <li>${icon('users')}עד ${h.max_guests ?? '?'} אורחים</li>
      <li>${icon('list')}שלוחה ${escapeHtml(h.extension)}</li>
      <li>${icon('phone')}<a href="tel:${escapeHtml(h.gabbai_phone)}">${escapeHtml(h.gabbai_phone)}</a></li>
    </ul>
    ${statsOk ? `<dl class="mini">
      <div><dt>שיחות</dt><dd>${formatNumber(r.total)}</dd></div>
      <div class="yes"><dt>נענו</dt><dd>${formatNumber(r.answered)}</dd></div>
      <div class="no"><dt>לא נענו</dt><dd>${formatNumber(r.unanswered)}</dd></div>
      <div><dt>מענה</dt><dd>${r.rate == null ? '-' : `${Math.round(r.rate * 100)}%`}</dd></div>
    </dl>
    ${r.total ? `<span class="bar" aria-hidden="true"><i class="y" style="width:${(r.answered / r.total) * 100}%"></i><i class="n" style="width:${(r.unanswered / r.total) * 100}%"></i></span>` : ''}` : ''}
    <button class="link calls-link" data-id="${r.id}">יומן השיחות של האולם</button>
  </article>`;
}

export function renderHalls() {
  const visible = visibleRows();
  const sorted = sortBy(visible, sort.state, { ...HALL_GETTERS }, byName);
  $('#hallsList').innerHTML = sorted.length ? sorted.map(card).join('')
    : `<div class="empty">${rows.length ? 'לא נמצאו אולמות שמתאימים לחיפוש או לסינון.' : 'עוד אין אולמות. לחץ על "הוסף אולם" כדי להתחיל.'}</div>`;
  $('#hallsCount').textContent = rows.length ? `${formatNumber(visible.length)} מתוך ${formatNumber(rows.length)}` : '';

  const scoped = rows.filter((r) => (!filters.city || r.city === filters.city) && (!filters.hood || r.hoods.includes(filters.hood)) && matches(searchText(r), filters.term));
  view.counts(Object.fromEntries(Object.entries(VIEWS).map(([name, test]) => [name, scoped.filter(test).length])));
}

function fillSuggestions() {
  const options = (values) => values.map((v) => `<option value="${escapeHtml(v)}">`).join('');
  $('#cityOptions').innerHTML = options(uniqueSorted(halls.map((h) => h.city_name)));
  $('#hoodOptions').innerHTML = options(uniqueSorted(halls.flatMap((h) => splitHoods(h.neighborhood_name))));
}

// אולם חדש: ממלא בשדה השלוחה את המספר הבא במאה של העיר
function suggestForCity() {
  const ext = $('#hallForm [name=extension]');
  const hint = $('#extHint');
  if (editing) { hint.hidden = true; return; }
  const suggestion = suggestExtension(halls, $('#hallForm [name=city_name]').value);
  if (ext.value === '' || ext.value === autoExt) {
    autoExt = suggestion ? String(suggestion.ext) : '';
    ext.value = autoExt;
  }
  hint.hidden = !suggestion || ext.value !== autoExt;
  if (suggestion) {
    hint.textContent = suggestion.existing
      ? `שלוחה מוצעת לפי העיר: המשך של מאה ${suggestion.hundred}`
      : `עיר חדשה: מוצעת מאה ${suggestion.hundred} פנויה. אפשר לשנות`;
  }
}

function openForm(hall) {
  editing = hall || null;
  autoExt = '';
  $('#extHint').hidden = true;
  const form = $('#hallForm');
  form.reset();
  $('#hallFormError').innerHTML = '';
  $('#hallFormTitle').textContent = hall ? 'עריכת אולם' : 'אולם חדש';
  if (hall) {
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = Boolean(hall[el.name]);
      else el.value = hall[el.name] ?? '';
    }
  }
  $('#hallDialog').showModal();
  suggestForCity();
}

async function save(e) {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  const form = e.target;
  const data = {};
  for (const el of form.elements) if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value;

  const button = e.submitter;
  const label = button.textContent;
  const wasEditing = Boolean(editing);
  button.disabled = true;
  button.textContent = 'שומר…';
  let saved;
  try {
    saved = editing ? await api.updateHall(editing.id, data) : await api.createHall(data);
  } catch (err) {
    $('#hallFormError').innerHTML = `<div class="error-box">${escapeHtml(err.message)}</div>`;
    return;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }

  $('#hallDialog').close();
  toast(wasEditing ? 'השינויים באולם נשמרו בהצלחה' : 'האולם נוסף בהצלחה');
  // השמירה הצליחה; אם רענון הרשימה נכשל אומרים את זה במפורש (אחרת נראה שהאולם לא נשמר ואפשר לשמור כפול)
  try { await onSaved(saved); } catch (err) {
    toast('האולם נשמר, אבל רענון הרשימה נכשל. לחץ על כפתור הרענון', 'error');
  }
}

function exportCsv() {
  const list = sortBy(visibleRows(), sort.state, HALL_GETTERS, byName);
  downloadCsv('אולמות.csv', ['אולם', 'עיר', 'שכונה', 'כתובת', 'מקסימום אורחים', 'שלוחה', 'טלפון להעברה', 'פעיל', 'שיחות', 'נענו', 'לא נענו'],
    list.map((r) => [r.name, r.city, r.hood, r.hall.address, r.guests, r.ext, r.hall.gabbai_phone, r.active ? 'כן' : 'לא', r.total, r.answered, r.unanswered]));
}

export function initHalls(savedCallback) {
  onSaved = savedCallback;
  initSearch($('#hallsSearch'), (value) => { filters.term = value; renderHalls(); });
  $('#hallsCity').addEventListener('change', (e) => { filters.city = e.target.value; fillHoods(); renderHalls(); });
  $('#hallsHood').addEventListener('change', (e) => { filters.hood = e.target.value; renderHalls(); });
  view = initChips($('#hallsView'), pref('hallsView', { value: 'all' }).value, (value) => { savePref('hallsView', { value }); renderHalls(); });
  sort = initSort({
    box: $('#hallsSort'), options: SORTS,
    initial: pref('hallsSort', { key: 'name', dir: 'asc' }),
    onChange: (state) => { savePref('hallsSort', state); renderHalls(); },
  });
  $('#hallsExport').addEventListener('click', exportCsv);

  $('#addHall').addEventListener('click', () => openForm());
  $('#hallsList').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;                  // חיוג לא פותח עריכה
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    const hall = halls.find((h) => String(h.id) === id);
    if (e.target.closest('.calls-link')) document.dispatchEvent(new CustomEvent('open-calls', { detail: { hall } }));
    else openForm(hall);
  });
  $('#hallForm').addEventListener('submit', save);
  $('#hallForm [name=city_name]').addEventListener('input', suggestForCity);
  $('#hallForm [name=extension]').addEventListener('input', () => { $('#extHint').hidden = true; });
}

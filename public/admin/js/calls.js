// לשונית "יומן שיחות": חיפוש חופשי, סינון לפי אולם ומצב, ומיון.
import { api } from './api.js';
import { $, escapeHtml, formatNumber, matches, pref, savePref, downloadCsv } from './dom.js';
import { initSearch, initChips, initSort, sortBy } from './controls.js';
import { hallLabel } from './data.js';
import { formatDateTime, hebrewOf } from './dates.js';

const LIMIT = 500;

// פירוט "לא נענה" לפי מה שימות דיווחה
const NOT_ANSWERED = { CANCEL: 'המתקשר ניתק לפני מענה', BUSY: 'תפוס', CONGESTION: 'תקלה בחיוג' };

const SORTS = [
  { key: 'when', label: 'זמן השיחה', first: 'desc' },
  { key: 'hall', label: 'שם אולם', text: true },
  { key: 'city', label: 'עיר', text: true },
  { key: 'phone', label: 'מספר מתקשר', text: true },
  { key: 'status', label: 'מצב שיחה', text: true },
  { key: 'duration', label: 'משך שיחה' },
];

const STATUS_ORDER = { yes: 0, no: 1, progress: 2, none: 3 };

let calls = [];        // שיחות מהשרת, עם שדות מחושבים
let halls = [];
let hallIds = new Map();  // תווית אולם ← מזהה, לסינון בשרת כשהוקלד אולם מדויק
let term = '';
let view, sort;
let fetchedHall = '';
let hallSearch;

const statusOf = (c) => (!c.hall_id ? 'none' : c.answered === false ? 'no' : c.answered ? 'yes' : 'progress');
const STATUS_LABEL = (c) => ({
  none: 'לא הגיע לאולם', yes: 'נענה', progress: 'בתהליך', no: NOT_ANSWERED[c.dial_status] || 'לא נענה',
})[c.status];

const GETTERS = {
  when: (c) => Date.parse(c.created_at),
  hall: (c) => c.hallName,
  city: (c) => c.city,
  phone: (c) => c.caller_phone || '',
  status: (c) => STATUS_ORDER[c.status],
  duration: (c) => c.duration_sec,
};

// האולם שהוקלד בשדה הסינון, אם הוא זהה בדיוק לאחת האפשרויות
const exactHall = () => hallIds.get($('#callsHall').value.trim()) ?? '';

export async function loadCalls(range, hallList, isCurrent = () => true) {
  halls = hallList;
  const byId = new Map(halls.map((h) => [h.id, h]));
  fillHallOptions();
  fetchedHall = exactHall();
  const list = await api.listCalls(range, fetchedHall);
  if (!isCurrent()) return;
  calls = list.map((c) => {
    const hall = byId.get(c.hall_id);
    return { ...c, hallName: hall?.name || '', city: hall?.city_name || '', status: statusOf(c) };
  });
  renderCalls();
}

function fillHallOptions() {
  hallIds = new Map(halls.map((h) => [hallLabel(h), String(h.id)]));
  $('#callsHallOptions').innerHTML = [...halls]
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    .map((h) => `<option value="${escapeHtml(hallLabel(h))}">`).join('');
}

const searchable = (c) => [c.caller_phone, c.hallName, c.city].join(' ');
const hallMatch = (c, text) => matches(`${c.hallName} ${c.city}`, text);

function visibleCalls() {
  const hallText = $('#callsHall').value.trim();
  return calls.filter((c) => matches(searchable(c), term) && (fetchedHall || !hallText || hallMatch(c, hallText)));
}

const duration = (s) => (s != null ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

function renderCalls() {
  const scoped = visibleCalls();
  const counts = { all: scoped.length };
  for (const key of ['yes', 'no', 'none']) counts[key] = scoped.filter((c) => c.status === key).length;
  view.counts(counts);

  const chosen = view.get();
  const visible = sortBy(scoped.filter((c) => chosen === 'all' || c.status === chosen), sort.state, GETTERS,
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  $('#callsList').innerHTML = visible.length ? visible.map((c) => {
    const phone = c.caller_phone ? `<a href="tel:${escapeHtml(c.caller_phone)}">${escapeHtml(c.caller_phone)}</a>` : '<span class="muted">חסוי</span>';
    return `<tr>
      <td class="span-all when digits">${formatDateTime(c.created_at)} <span class="heb">${hebrewOf(c.created_at)}</span></td>
      <td class="phone digits">${phone}</td>
      <td class="hall">${escapeHtml(c.hallName)}</td>
      <td class="city hide-sm">${escapeHtml(c.city)}</td>
      <td class="status"><span class="badge ${c.status}">${STATUS_LABEL(c)}</span></td>
      <td class="num dur" data-label="משך">${duration(c.duration_sec)}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" class="empty">${calls.length ? 'אין שיחות שמתאימות לחיפוש או לסינון.' : 'אין שיחות בתקופה הזו.'}</td></tr>`;

  $('#callsCount').textContent = calls.length ? `${formatNumber(visible.length)} מתוך ${formatNumber(calls.length)} שיחות` : '';
  $('#callsNote').textContent = calls.length >= LIMIT
    ? `מוצגות ${LIMIT} השיחות האחרונות בטווח. כדי לראות שיחות ישנות יותר, צמצם את התאריכים או בחר אולם.` : '';
}

function exportCsv() {
  const list = sortBy(visibleCalls().filter((c) => view.get() === 'all' || c.status === view.get()), sort.state, GETTERS);
  downloadCsv('יומן-שיחות.csv', ['תאריך ושעה', 'מתקשר', 'אולם', 'עיר', 'מצב', 'משך'],
    list.map((c) => [formatDateTime(c.created_at), c.caller_phone || 'חסוי', c.hallName, c.city, STATUS_LABEL(c), duration(c.duration_sec)]));
}

// מעבר מלשוניות אחרות: פותח את היומן כשהוא מסונן לאולם מסוים
export function setHallFilter(hall) {
  const input = $('#callsHall');
  input.value = hall ? hallLabel(hall) : '';
  input.dispatchEvent(new Event('input'));
}

export const getHallFilter = () => $('#callsHall').value;
export function restoreHallFilter(text) { hallSearch.set(text); }

export function initCalls(reload) {
  initSearch($('#callsSearch'), (value) => { term = value; renderCalls(); });

  // אולם מדויק (בחירה מהרשימה) נשלח לשרת, כדי שמגבלת 500 השיחות תחול רק עליו. הקלדה חלקית מסננת בדף.
  hallSearch = initSearch($('#callsHall'), () => {
    if (exactHall() !== fetchedHall) reload();
    else renderCalls();
  });

  view = initChips($('#callsView'), pref('callsView', { value: 'all' }).value, (value) => { savePref('callsView', { value }); renderCalls(); });
  sort = initSort({
    box: $('#callsSort'), table: $('.calls-table'), options: SORTS,
    initial: pref('callsSort', { key: 'when', dir: 'desc' }),
    onChange: (state) => { savePref('callsSort', state); renderCalls(); },
  });
  $('#callsExport').addEventListener('click', exportCsv);
}

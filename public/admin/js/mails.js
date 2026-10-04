// לשונית "מיילים": יומן המיילים שנשלחו לאולמות (500 האחרונים). חיפוש, מיון וסינון לפי מצב שליחה.
import { api } from './api.js';
import { $, escapeHtml, formatNumber, pref, savePref, matches } from './dom.js';
import { initSearch, initChips, initSort, sortBy } from './controls.js';
import { formatDateTime, hebrewOf } from './dates.js';

const SORTS = [
  { key: 'when', label: 'זמן השליחה', first: 'desc' },
  { key: 'hall', label: 'שם אולם', text: true },
  { key: 'to', label: 'כתובת מייל', text: true },
  { key: 'phone', label: 'מספר מתקשר', text: true },
  { key: 'status', label: 'מצב' },
];
const STATUS = { sent: 'נשלח', failed: 'השליחה נכשלה', no_email: 'אין כתובת מייל לאולם' };
const GETTERS = {
  when: (m) => Date.parse(m.created_at),
  hall: (m) => m.hall_name || '',
  to: (m) => m.to_email || '',
  phone: (m) => m.caller_phone || '',
  status: (m) => (m.status === 'sent' ? 1 : 0), // בעיות קודם
};

let list = [];
let term = '';
let view, sort;

export const isBad = (m) => m.status !== 'sent';

let halls = [];

export async function loadMails(allHalls, isCurrent = () => true) {
  halls = allHalls;
  const rows = await api.listMails();
  if (!isCurrent()) return;
  list = rows;
  renderMails();
}

function renderMails() {
  const scoped = list.filter((m) => matches(`${m.hall_name} ${m.to_email} ${m.caller_phone}`, term));
  const bad = scoped.filter(isBad).length;
  view.counts({ all: scoped.length, sent: scoped.length - bad, bad });
  const chosen = view.get();
  const visible = sortBy(scoped.filter((m) => chosen === 'all' || (chosen === 'bad') === isBad(m)), sort.state, GETTERS,
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  $('#mailList').innerHTML = visible.length ? visible.map((m) => `<tr>
      <td class="span-all when digits">${formatDateTime(m.created_at)} <span class="heb">${hebrewOf(m.created_at)}</span></td>
      <td class="hall span-all">${halls.some((h) => String(h.id) === String(m.hall_id)) ? `<button class="link hall-link" data-hall="${m.hall_id}">${escapeHtml(m.hall_name)}</button>` : escapeHtml(m.hall_name)}</td>
      <td class="to span-all digits" dir="ltr">${escapeHtml(m.to_email) || '<span class="muted">-</span>'}</td>
      <td class="phone digits" data-label="מתקשר">${escapeHtml(m.caller_phone) || '<span class="muted">חסוי</span>'}</td>
      <td class="status ${isBad(m) ? 'bad' : ''}" data-label="מצב">${STATUS[m.status] || escapeHtml(m.status)}${m.answered ? '' : ' <span class="muted">(שיחה שלא נענתה)</span>'}${m.error ? `<span class="err" dir="ltr">${escapeHtml(m.error)}</span>` : ''}</td>
    </tr>`).join('')
    : `<tr><td colspan="5" class="empty">${list.length ? 'אין מיילים שמתאימים לחיפוש או לסינון.' : 'עוד לא נשלחו מיילים. הם יופיעו כאן אחרי שיחה שתועבר לאולם.'}</td></tr>`;

  $('#mailCount').textContent = list.length ? `${formatNumber(visible.length)} מתוך ${formatNumber(list.length)} מיילים` : '';
}

export function initMails() {
  $('#mailList').addEventListener('click', (e) => {
    const id = e.target.closest('.hall-link')?.dataset.hall;
    if (id) document.dispatchEvent(new CustomEvent('open-details', { detail: { id, toCalls: true } }));
  });
  initSearch($('#mailSearch'), (value) => { term = value; renderMails(); });
  view = initChips($('#mailView'), pref('mailView', { value: 'all' }).value, (value) => { savePref('mailView', { value }); renderMails(); });
  sort = initSort({
    box: $('#mailSort'), table: $('.mail-table'), options: SORTS,
    initial: pref('mailSort', { key: 'when', dir: 'desc' }),
    onChange: (state) => { savePref('mailSort', state); renderMails(); },
  });
}

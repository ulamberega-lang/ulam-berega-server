// לשונית "לאישור" (נפתחת מכפתור בראש "ניהול אולמות"): אולמות שהעובד הגיש מאתר ההוספה (/staff).
// "אישור" פותח את טופס האולם עם מה שהעובד מילא ועם שלוחה מוצעת; שמירה בטופס יוצרת את האולם ומסמנת את ההגשה כמאושרת.
// לכל הגשה מוצג גם אם היא דומה לאולם שכבר במערכת (אותה השוואה כמו בייבוא מאקסל).
import { api } from './api.js';
import { $, escapeHtml, formatNumber, matches, pref, savePref, toast } from './dom.js';
import { initSearch, initSort, sortBy } from './controls.js';
import { matchItem, phonesOf } from './import-match.js';

let subs = [], halls = [], term = '', sort;

const asItem = (d) => ({ name: d.name ?? '', synagogue: d.synagogue_name ?? '', city: d.city_name ?? '', hood: d.neighborhood_name ?? '', address: d.address ?? '',
  phones: phonesOf(d.gabbai_phone), phoneRaw: d.gabbai_phone ?? '', guests: d.max_guests ?? null, notes: '', origin: '', group: '' });
const dateOf = (iso) => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

// מספר ההגשות שממתינות (על הכפתור בראש "ניהול אולמות")
export async function loadPendingCount() {
  try { setBadge((await api.listSubmissions()).length); } catch { setBadge(0); } // בלי הטבלה: בלי תג
}
function setBadge(n) {
  $('#pendingBadge').hidden = !n;
  $('#pendingBadge').textContent = n;
}

export async function loadPending(allHalls, isCurrent = () => true) {
  const list = await api.listSubmissions();
  if (!isCurrent()) return;
  subs = list.map((s) => ({ ...s, match: matchItem(asItem(s.data), allHalls) }));
  halls = allHalls;
  setBadge(subs.length);
  render();
}

function render() {
  const scoped = subs.filter((s) => matches(`${s.data.name} ${s.data.synagogue_name ?? ''} ${s.data.city_name} ${s.data.neighborhood_name ?? ''} ${s.data.address ?? ''} ${s.data.gabbai_phone} ${s.note}`, term));
  const shown = sortBy(scoped, sort.state, { date: (s) => s.created_at, name: (s) => s.data.name, city: (s) => s.data.city_name, guests: (s) => s.data.max_guests }, (a, b) => a.id - b.id);
  $('#pendingCount').textContent = subs.length ? `${formatNumber(shown.length)} מתוך ${formatNumber(subs.length)}` : '';
  $('#pendingList').innerHTML = shown.length ? shown.map((s) => {
    const d = s.data, m = s.match;
    const like = m.status === 'new' ? '' : `<div class="why">${m.status === 'in' ? 'כנראה כבר במערכת' : 'דומה לאולם קיים'} (${escapeHtml(m.reasons.join(', '))}): ${escapeHtml(m.hall.name)}${m.hall.city_name ? ` (${escapeHtml(m.hall.city_name)})` : ''}</div>`;
    return `<tr data-id="${s.id}">
      <td class="span-all"><b>${escapeHtml(d.name)}</b>${d.synagogue_name ? `<small class="syn"> · בבית הכנסת ${escapeHtml(d.synagogue_name)}</small>` : ''}${like}${s.note ? `<div class="why">הערת העובד: ${escapeHtml(s.note)}</div>` : ''}</td>
      <td data-label="עיר">${escapeHtml(d.city_name)}${d.neighborhood_name ? `<small class="muted"> · ${escapeHtml(d.neighborhood_name)}</small>` : ''}</td>
      <td data-label="כתובת">${escapeHtml(d.address) || '<span class="muted">-</span>'}</td>
      <td class="digits" data-label="טלפון" dir="ltr">${escapeHtml(d.gabbai_phone)}</td>
      <td class="digits" data-label="אורחים">${d.max_guests ?? '-'}</td>
      <td class="digits" data-label="נשלח">${dateOf(s.created_at)}</td>
      <td class="span-all"><div class="acts">
        <button class="btn small approve" type="button">אישור</button>
        ${m.hall ? `<button class="btn small ghost goto" type="button" data-hall="${escapeHtml(m.hall.id)}">לאולם הדומה</button>` : ''}
        <button class="btn small ghost reject" type="button">דחייה</button>
      </div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" class="empty">${subs.length ? 'אין הגשות שמתאימות לחיפוש.' : 'אין אולמות שממתינים לאישור.'}</td></tr>`;
}

async function reject(s, reload) {
  const reason = prompt(`לדחות את "${s.data.name}"?\nאפשר לכתוב סיבה (העובד יראה אותה). ביטול = לא לדחות.`, '');
  if (reason == null) return;
  try {
    await api.rejectSubmission(s.id, reason);
    toast('ההגשה נדחתה');
    reload();
  } catch (err) { toast(err.message, 'error'); }
}

export function initPending(reload) {
  initSearch($('#pendingSearch'), (v) => { term = v; render(); });
  sort = initSort({ box: $('#pendingSort'), table: $('.pending-table'), options: [
    { key: 'date', label: 'תאריך שליחה', first: 'asc' }, { key: 'name', label: 'שם', text: true }, { key: 'city', label: 'עיר', text: true }, { key: 'guests', label: 'אורחים' }],
  initial: pref('pendingSort', { key: 'date', dir: 'asc' }), onChange: (st) => { savePref('pendingSort', st); render(); } });
  $('#pendingList').addEventListener('click', (e) => {
    const s = subs.find((x) => String(x.id) === e.target.closest('tr[data-id]')?.dataset.id);
    if (!s) return;
    if (e.target.closest('.approve')) document.dispatchEvent(new CustomEvent('add-hall-draft', { detail: { draft: s.data, submission: s } }));
    else if (e.target.closest('.reject')) reject(s, reload);
    else if (e.target.closest('.goto')) document.dispatchEvent(new CustomEvent('open-details', { detail: { id: e.target.closest('.goto').dataset.hall } }));
  });
}

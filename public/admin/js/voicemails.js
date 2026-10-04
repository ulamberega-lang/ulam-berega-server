// לשונית "הודעות": הודעות קוליות שהושארו בקו (אפשרות 5). נגן, סימון "טופל", חיוג למתקשר ומחיקה.
import { api } from './api.js';
import { $, escapeHtml, formatNumber, toast, pref, savePref, matches, icon, showError } from './dom.js';
import { initSearch, initChips, initSort, sortBy } from './controls.js';
import { formatDateTime, hebrewOf } from './dates.js';

const SORTS = [
  { key: 'when', label: 'זמן ההודעה', first: 'desc' },
  { key: 'phone', label: 'מספר מתקשר', text: true },
  { key: 'status', label: 'מצב טיפול' },
];
const GETTERS = {
  when: (v) => Date.parse(v.created_at),
  phone: (v) => v.caller_phone || '',
  status: (v) => (v.handled ? 1 : 0), // לא טופלו קודם
};

let list = [];
let term = '';
let view, sort;

export const unhandledCount = (rows) => rows.filter((v) => !v.handled).length;

// הכתובת (ולכן הספירה במונה) מתעדכנת מכאן ומהטעינה הראשונית של הדף
const announce = () => document.dispatchEvent(new CustomEvent('voicemails-changed', { detail: { open: unhandledCount(list) } }));

export async function loadVoicemails(range, halls, isCurrent = () => true) {
  const rows = await api.listVoicemails();
  if (!isCurrent()) return;
  list = rows;
  renderVoicemails();
  announce();
}

function renderVoicemails() {
  const scoped = list.filter((v) => matches(v.caller_phone || 'חסוי', term));
  view.counts({ all: scoped.length, open: unhandledCount(scoped), done: scoped.length - unhandledCount(scoped) });
  const chosen = view.get();
  const visible = sortBy(scoped.filter((v) => chosen === 'all' || (chosen === 'open') === !v.handled), sort.state, GETTERS,
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  $('#voicemailList').innerHTML = visible.length ? visible.map((v) => {
    const phone = v.caller_phone ? `<a href="tel:${escapeHtml(v.caller_phone)}">${escapeHtml(v.caller_phone)}</a>` : '<span class="muted">חסוי</span>';
    return `<tr class="${v.handled ? 'done' : ''}" data-id="${v.id}">
      <td class="span-all when digits">${formatDateTime(v.created_at)} <span class="heb">${hebrewOf(v.created_at)}</span></td>
      <td class="phone digits">${phone}</td>
      <td class="player span-all"><audio controls preload="none" src="/admin/api/voicemails/${v.id}/audio"></audio></td>
      <td class="handled"><label class="check"><input type="checkbox" class="vm-done" ${v.handled ? 'checked' : ''}> טופל</label></td>
      <td class="more"><button class="icon-btn vm-delete" aria-label="מחיקת ההודעה" title="מחיקה">${icon('x')}</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" class="empty">${list.length ? 'אין הודעות שמתאימות לחיפוש או לסינון.' : 'עוד אין הודעות. מתקשר שיקיש 5 ויקליט הודעה, יופיע כאן.'}</td></tr>`;

  $('#voicemailCount').textContent = list.length ? `${formatNumber(visible.length)} מתוך ${formatNumber(list.length)} הודעות` : '';
}

async function setHandled(id, handled) {
  const row = list.find((v) => String(v.id) === String(id));
  if (!row) return;
  row.handled = handled;
  renderVoicemails();
  announce();
  try { await api.setVoicemailHandled(id, handled); } catch (err) {
    row.handled = !handled;
    renderVoicemails();
    announce();
    toast(`העדכון נכשל. ${err.message}`, 'error');
  }
}

async function remove(id) {
  if (!confirm('למחוק את ההודעה? גם ההקלטה תימחק מימות, ואי אפשר לשחזר.')) return;
  try { await api.deleteVoicemail(id); } catch (err) { toast(`המחיקה נכשלה. ${err.message}`, 'error'); return; }
  list = list.filter((v) => String(v.id) !== String(id));
  renderVoicemails();
  announce();
  toast('ההודעה נמחקה');
}

// מונה הלשונית: נטען בפתיחת הדף, כדי שיופיע בלי לפתוח את הלשונית. שגיאה (למשל הטבלה עוד לא קיימת) לא מציגה כלום.
export async function loadVoicemailCount() {
  try {
    list = await api.listVoicemails();
    announce();
  } catch { /* בלי מונה */ }
}

export function initVoicemails() {
  initSearch($('#voicemailSearch'), (value) => { term = value; renderVoicemails(); });
  view = initChips($('#voicemailView'), pref('voicemailView', { value: 'all' }).value, (value) => { savePref('voicemailView', { value }); renderVoicemails(); });
  sort = initSort({
    box: $('#voicemailSort'), table: $('.voicemail-table'), options: SORTS,
    initial: pref('voicemailSort', { key: 'when', dir: 'desc' }),
    onChange: (state) => { savePref('voicemailSort', state); renderVoicemails(); },
  });
  $('#voicemailList').addEventListener('change', (e) => {
    if (!e.target.classList.contains('vm-done')) return;
    setHandled(e.target.closest('tr').dataset.id, e.target.checked);
  });
  $('#voicemailList').addEventListener('click', (e) => {
    if (e.target.closest('.vm-delete')) remove(e.target.closest('tr').dataset.id);
  });
}

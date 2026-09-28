// לשונית "יומן שיחות".
import { api } from './api.js';
import { $, escapeHtml } from './dom.js';
import { formatDateTime, hebrewOf } from './dates.js';

export async function loadCalls(range, halls) {
  const byId = new Map(halls.map((h) => [h.id, h]));
  const calls = await api.listCalls(range, $('#callsHall').value);

  $('#callsList').innerHTML = calls.length ? calls.map((c) => {
    const hall = byId.get(c.hall_id);
    const status = !c.hall_id ? '<span class="status-none">לא הגיע לאולם</span>'
      : c.answered === false ? '<span class="status-no">לא נענה</span>'
      : c.answered ? '<span class="status-yes">נענה</span>'
      : '<span class="status-none">בתהליך</span>';
    const duration = c.duration_sec != null
      ? `${Math.floor(c.duration_sec / 60)}:${String(c.duration_sec % 60).padStart(2, '0')}` : '';
    const phone = c.caller_phone ? `<a href="tel:${escapeHtml(c.caller_phone)}">${escapeHtml(c.caller_phone)}</a>` : 'חסוי';
    return `<tr>
      <td class="digits">${formatDateTime(c.created_at)} <span class="heb">${hebrewOf(c.created_at)}</span></td>
      <td class="digits">${phone}</td>
      <td>${hall ? escapeHtml(hall.name) : ''}</td>
      <td>${status}</td>
      <td class="num">${duration}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">אין שיחות בתקופה הזו.</td></tr>';
}

export function fillHallFilter(halls) {
  const select = $('#callsHall');
  const current = select.value;
  select.innerHTML = '<option value="">כל האולמות</option>' + [...halls]
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    .map((h) => `<option value="${h.id}">${escapeHtml(h.name)}, ${escapeHtml(h.city_name)}</option>`).join('');
  select.value = current;
}

export function initCalls(reload) {
  $('#callsHall').addEventListener('change', reload);
}

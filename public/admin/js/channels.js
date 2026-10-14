// לשונית "וואטסאפ, צ'אט ואתר" (נפתחת מכפתור בלשונית "שיחות לפי אולם"): כמה פנו לבוט בוואטסאפ ובצ'אט באתר,
// כמה קיבלו פרטי אולם, וכמה נכנסו לאתר (לפי יום, ולפי דף ומקור). הנתונים מ-sql/channel_events.sql.
import { api } from './api.js';
import { $, escapeHtml, formatNumber, matches, pref, savePref } from './dom.js';
import { initSearch, initChips, initSort, sortBy } from './controls.js';
import { daysBetween, formatDay, hebrewDay, isWeekend, MAX_DAYS } from './dates.js';

const DAY_SORTS = [
  { key: 'day', label: 'תאריך', first: 'desc' },
  { key: 'whatsapp', label: 'וואטסאפ' },
  { key: 'web', label: "צ'אט באתר" },
  { key: 'site', label: 'מבקרים באתר' },
];
const VISIT_SORTS = [
  { key: 'visits', label: 'כניסות' },
  { key: 'users', label: 'מבקרים' },
  { key: 'value', label: 'שם', text: true },
];
const SOURCE_LABEL = { '': 'כניסה ישירה (קישור, סימנייה או הקלדה)', internal: 'מעבר מדף אחר באתר' };

let data = null, range = null;
let term = '', hideEmpty = false;
let daySort, visitSort, visitView;

export async function loadChannels(r, halls, isCurrent = () => true) {
  const result = await api.channels(r);
  if (!isCurrent()) return;
  data = result; range = r;
  renderTotals();
  renderDays();
  renderVisits();
}

const n = (v) => Number(v || 0);

function renderTotals() {
  const by = Object.fromEntries(data.totals.map((t) => [t.channel, t]));
  const bot = (key, label) => {
    const t = by[key] ?? {};
    return `<div><dt>${label}</dt><dd>${formatNumber(t.users)}</dd>
      <small>${formatNumber(t.messages)} הודעות · ${formatNumber(t.found_users)} קיבלו פרטי אולם</small></div>`;
  };
  const site = by.site ?? {};
  $('#channelTotals').innerHTML = bot('whatsapp', 'פנו לבוט בוואטסאפ') + bot('web', "השתמשו בצ'אט באתר")
    + `<div><dt>מבקרים באתר</dt><dd>${formatNumber(site.users)}</dd><small>${formatNumber(site.visits)} כניסות לדפים</small></div>`;
}

function renderDays() {
  const byDay = new Map();
  for (const r of data.days) {
    const d = byDay.get(r.day) ?? { whatsapp: 0, web: 0, site: 0, visits: 0 };
    d[r.channel] = n(r.users);
    if (r.channel === 'site') d.visits = n(r.visits);
    byDay.set(r.day, d);
  }
  // הספירה התחילה רק עכשיו: מתחילים מהיום הראשון שיש בו פעילות (אחרת "תמיד" מציג מאות ימים ריקים)
  const first = [...byDay.keys()].sort()[0];
  const all = first ? daysBetween(first > range.from ? first : range.from, range.to) : [];
  $('#channelDaysNote').hidden = !all.length || all[0] <= (first > range.from ? first : range.from);
  $('#channelDaysNote').textContent = `הטווח ארוך: מוצגים ${MAX_DAYS} הימים האחרונים בו. הסיכום למעלה כולל את כל הטווח.`;
  let list = all.map((day) => ({ day, ...(byDay.get(day) ?? { whatsapp: 0, web: 0, site: 0, visits: 0 }) }));
  if (hideEmpty) list = list.filter((d) => d.whatsapp || d.web || d.site);
  list = sortBy(list, daySort.state, { day: (d) => d.day, whatsapp: (d) => d.whatsapp, web: (d) => d.web, site: (d) => d.site },
    (a, b) => b.day.localeCompare(a.day));
  $('#channelDays').innerHTML = list.length ? list.map((d) => `<tr class="${isWeekend(d.day) ? 'weekend' : ''}">
      <td class="span-all name">${formatDay(d.day)} <span class="heb">${hebrewDay(d.day)}</span></td>
      <td class="num" data-label="וואטסאפ">${formatNumber(d.whatsapp)}</td>
      <td class="num" data-label="צ'אט באתר">${formatNumber(d.web)}</td>
      <td class="num" data-label="מבקרים באתר" title="${formatNumber(d.visits)} כניסות לדפים">${formatNumber(d.site)}</td>
    </tr>`).join('') : '<tr><td colspan="4" class="empty">אין פעילות בתקופה הזו.</td></tr>';
}

// הדף בשם קריא: "/" = דף הבית, דפי עיר ושכונה ("/אולם-קטן-ב/ירושלים/גאולה") לפי השם
const PAGE_NAMES = { '/': 'דף הבית', '/chat': "צ'אט באתר", '/privacy': 'מדיניות פרטיות', '/accessibility': 'הצהרת נגישות' };
const words = (slug) => slug.replace(/-/g, ' ');
export function pageLabel(p) {
  if (PAGE_NAMES[p]) return PAGE_NAMES[p];
  const [, city, hood] = /^\/אולם-קטן-ב\/([^/]+)(?:\/([^/]+))?\/?$/.exec(p) ?? [];
  if (hood) return `דף שכונה: ${words(hood)}, ${words(city)}`;
  if (city) return `דף עיר: ${words(city)}`;
  return p;
}
const labelOf = (r) => (r.dim === 'page' ? pageLabel(r.value) : SOURCE_LABEL[r.value] ?? r.value);

function renderVisits() {
  const dim = visitView.get();
  const all = data.breakdown.filter((r) => r.dim === dim).map((r) => ({ ...r, label: labelOf(r), visits: n(r.visits), users: n(r.users) }));
  const shown = sortBy(all.filter((r) => matches(`${r.label} ${r.value}`, term)), visitSort.state,
    { visits: (r) => r.visits, users: (r) => r.users, value: (r) => r.label }, (a, b) => b.visits - a.visits);
  $('#channelVisitHead').textContent = dim === 'page' ? 'דף' : 'הגיעו מ';
  $('#channelVisits').innerHTML = shown.length ? shown.map((r) => `<tr>
      <td class="span-all name">${escapeHtml(r.label)}</td>
      <td class="num total" data-label="כניסות">${formatNumber(r.visits)}</td>
      <td class="num" data-label="מבקרים">${formatNumber(r.users)}</td>
    </tr>`).join('') : `<tr><td colspan="3" class="empty">${all.length ? 'אין תוצאות שמתאימות לחיפוש.' : 'אין כניסות לאתר בתקופה הזו.'}</td></tr>`;
  $('#channelVisitCount').textContent = all.length ? `${formatNumber(shown.length)} מתוך ${formatNumber(all.length)}` : '';
}

export function initChannels() {
  daySort = initSort({
    box: $('#channelDaysSort'), table: $('.channel-days'), options: DAY_SORTS,
    initial: pref('channelDaysSort', { key: 'day', dir: 'desc' }),
    onChange: (state) => { savePref('channelDaysSort', state); if (data) renderDays(); },
  });
  $('#channelHideEmpty').addEventListener('change', (e) => { hideEmpty = e.target.checked; if (data) renderDays(); });
  initSearch($('#channelVisitSearch'), (value) => { term = value; if (data) renderVisits(); });
  visitView = initChips($('#channelVisitView'), pref('channelVisitView', { value: 'page' }).value, (value) => { savePref('channelVisitView', { value }); if (data) renderVisits(); });
  visitSort = initSort({
    box: $('#channelVisitSort'), table: $('.channel-visits'), options: VISIT_SORTS,
    initial: pref('channelVisitSort', { key: 'visits', dir: 'desc' }),
    onChange: (state) => { savePref('channelVisitSort', state); if (data) renderVisits(); },
  });
}

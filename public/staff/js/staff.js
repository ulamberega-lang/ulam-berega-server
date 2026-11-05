// אתר ההוספה של העובד (/staff): ייבוא מאקסל (אותו קוד כמו בלשונית הייבוא בניהול), טופס אולם חדש שנשלח לאישור,
// "מה ששלחתי" (ממתין / אושר / נדחה) ו"אולמות במערכת" לקריאה בלבד. המודולים המשותפים מגיעים מ-/staff/lib (קבצי אתר הניהול).
import { $, $$, escapeHtml, formatNumber, matches, pref, savePref, toast, showError, fillSelect, uniqueSorted } from '../lib/dom.js';
import { initSearch, initChips, initSort, sortBy } from '../lib/controls.js';
import { initImport, loadImport } from '../lib/import.js';
import { splitHoods } from '../lib/hoods.js';

async function request(path, options = {}) {
  const res = await fetch(`/staff/api/${path}`, { headers: { 'content-type': 'application/json' }, ...options });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) { location.href = '/staff/login'; throw new Error('צריך להיכנס מחדש'); }
  if (!res.ok) throw new Error(body.error || 'השרת לא הגיב. נסה לרענן את הדף.');
  return body;
}

const TABS = ['import', 'mine', 'halls'];
const STATUS = { pending: ['ממתין לאישור', 'maybe'], approved: ['אושר', 'yes'], rejected: ['נדחה', 'no'] };
let halls = [], subs = [];
const mine = { term: '' }, list = { term: '', city: '' };
let mineView, mineSort, hallsSort;

const dateOf = (iso) => (iso ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit', timeZone: 'Asia/Jerusalem' }) : '');
const place = (h) => [h.city_name, h.neighborhood_name].filter(Boolean).map(escapeHtml).join(' · ');
const searchText = (h) => `${h.name} ${h.synagogue_name ?? ''} ${h.city_name} ${h.neighborhood_name ?? ''} ${h.address ?? ''} ${h.gabbai_phone ?? ''}`;

// להשוואת הייבוא: האולמות שבמערכת וגם מה שכבר נשלח ועוד ממתין (כדי לא לשלוח פעמיים)
const compareList = () => [...halls, ...subs.filter((s) => s.status === 'pending').map((s) => ({ ...s.data, id: `s${s.id}`, pending: true }))];

async function load() {
  try {
    [halls, subs] = await Promise.all([request('halls'), request('submissions')]);
    showError('');
  } catch (err) { showError(err.message); }
  fillLists();
  renderMine();
  renderHalls();
  loadImport(compareList());
}

function fillLists() {
  const options = (values) => values.map((v) => `<option value="${escapeHtml(v)}">`).join('');
  $('#cityOptions').innerHTML = options(uniqueSorted(halls.map((h) => h.city_name)));
  $('#hoodOptions').innerHTML = options(uniqueSorted(halls.flatMap((h) => splitHoods(h.neighborhood_name))));
  fillSelect($('#hallsCity'), uniqueSorted(halls.map((h) => h.city_name)), 'כל הערים');
  list.city = $('#hallsCity').value;
  const open = subs.filter((s) => s.status === 'pending').length;
  $('#pendingBadge').hidden = !open;
  $('#pendingBadge').textContent = open;
}

// ---------- מה ששלחתי ----------
function renderMine() {
  const scoped = subs.filter((s) => matches(searchText(s.data), mine.term));
  mineView.counts({ ...Object.fromEntries(Object.keys(STATUS).map((k) => [k, scoped.filter((s) => s.status === k).length])), all: scoped.length });
  const view = mineView.get();
  const shown = sortBy(scoped.filter((s) => view === 'all' || s.status === view), mineSort.state, {
    date: (s) => s.created_at, name: (s) => s.data.name, city: (s) => s.data.city_name, guests: (s) => s.data.max_guests, status: (s) => s.status,
  }, (a, b) => b.id - a.id);
  $('#mineCount').textContent = subs.length ? `${formatNumber(shown.length)} מתוך ${formatNumber(subs.length)}` : '';
  $('#mineList').innerHTML = shown.length ? shown.map((s) => {
    const d = s.data, [label, cls] = STATUS[s.status];
    const why = s.status === 'rejected' && s.reason ? `<div class="why">${escapeHtml(s.reason)}</div>` : s.note ? `<div class="why">הערה: ${escapeHtml(s.note)}</div>` : '';
    return `<tr data-id="${s.id}">
      <td class="span-all"><span class="badge ${cls}">${label}</span>${why}</td>
      <td class="span-all"><b>${escapeHtml(d.name)}</b>${d.synagogue_name ? `<small class="syn"> · בבית הכנסת ${escapeHtml(d.synagogue_name)}</small>` : ''}</td>
      <td data-label="עיר">${place(d)}</td>
      <td data-label="כתובת">${escapeHtml(d.address) || '<span class="muted">-</span>'}</td>
      <td class="digits" data-label="טלפון" dir="ltr">${escapeHtml(d.gabbai_phone)}</td>
      <td class="digits" data-label="אורחים">${d.max_guests ?? '-'}</td>
      <td class="digits" data-label="נשלח">${dateOf(s.created_at)}</td>
      <td class="span-all"><div class="acts">${s.status === 'pending' ? '<button class="btn small ghost cancel" type="button">ביטול השליחה</button>' : ''}</div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" class="empty">${subs.length ? 'אין אולמות שמתאימים לחיפוש או לסינון.' : 'עוד לא שלחת אולמות. לחץ "אולם חדש", או הוסף מקובץ אקסל.'}</td></tr>`;
}

async function cancel(id) {
  const s = subs.find((x) => String(x.id) === String(id));
  if (!s || !confirm(`לבטל את שליחת "${s.data.name}"? האולם לא יגיע לאישור.`)) return;
  try {
    await request(`submissions/${id}`, { method: 'DELETE', body: '{}' });
    toast('השליחה בוטלה');
    await load();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- אולמות במערכת (קריאה בלבד) ----------
function renderHalls() {
  const shown = sortBy(halls.filter((h) => (!list.city || h.city_name === list.city) && matches(searchText(h), list.term)), hallsSort.state,
    { name: (h) => h.name, city: (h) => h.city_name, guests: (h) => h.max_guests }, (a, b) => String(a.name).localeCompare(b.name, 'he'));
  $('#hallsCount').textContent = halls.length ? `${formatNumber(shown.length)} מתוך ${formatNumber(halls.length)}` : '';
  $('#hallsList').innerHTML = shown.length ? shown.map((h) => `<tr data-id="${h.id}">
      <td class="span-all"><b>${escapeHtml(h.name)}</b>${h.synagogue_name ? `<small class="syn"> · בבית הכנסת ${escapeHtml(h.synagogue_name)}</small>` : ''}${h.is_active ? '' : ' <span class="tag">מושבת</span>'}</td>
      <td data-label="עיר">${place(h)}</td>
      <td data-label="כתובת">${escapeHtml(h.address) || '<span class="muted">-</span>'}</td>
      <td class="digits" data-label="טלפון" dir="ltr">${escapeHtml(h.gabbai_phone)}</td>
      <td class="digits" data-label="אורחים">${h.max_guests ?? '-'}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="empty">לא נמצאו אולמות.</td></tr>';
}

// חלון פרטים (מכפתור "מעבר לאולם" בייבוא): אולם במערכת או אולם שנשלח ועוד ממתין
function showInfo(id) {
  const h = compareList().find((x) => String(x.id) === String(id));
  if (!h) return;
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>` : '');
  $('#infoBody').innerHTML = `<header><h2 id="infoTitle">${escapeHtml(h.name)}</h2>${h.pending ? '<span class="badge maybe">נשלח לאישור</span>' : ''}
      <button class="icon-btn" id="infoClose" aria-label="סגירה"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button></header>
    <dl class="info-grid">${row('בית כנסת', h.synagogue_name)}${row('עיר', h.city_name)}${row('שכונה', h.neighborhood_name)}${row('כתובת', h.address)}${row('טלפון', h.gabbai_phone)}${row('מקסימום אורחים', h.max_guests && String(h.max_guests))}</dl>`;
  $('#infoClose').addEventListener('click', () => $('#infoDialog').close());
  $('#infoDialog').showModal();
}

// ---------- טופס אולם חדש ----------
function openForm(draft = null) {
  const form = $('#hallForm');
  form.reset();
  $('#hallFormError').innerHTML = '';
  if (draft) for (const [name, value] of Object.entries(draft)) if (form.elements[name] && value !== '' && value != null) form.elements[name].value = value;
  $('#hallDialog').showModal();
}

async function submit(e) {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  const data = {};
  for (const el of e.target.elements) if (el.name) data[el.name] = el.value;
  const button = e.submitter;
  button.disabled = true;
  button.textContent = 'שולח…';
  try {
    await request('submissions', { method: 'POST', body: JSON.stringify(data) });
  } catch (err) {
    $('#hallFormError').innerHTML = `<div class="error-box">${escapeHtml(err.message)}</div>`;
    return;
  } finally {
    button.disabled = false;
    button.textContent = 'שלח לאישור';
  }
  $('#hallDialog').close();
  toast(`"${data.name}" נשלח לאישור`);
  await load();
}

function setTab(tab) {
  if (!TABS.includes(tab)) tab = 'import';
  $$('.topbar nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  for (const name of TABS) $(`#tab-${name}`).hidden = name !== tab;
  if (location.hash.slice(1) !== tab) history.replaceState(null, '', `#${tab}`);
}

function init() {
  $$('.topbar nav button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));
  $('#logout').addEventListener('click', async () => {
    await fetch('/staff/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
    location.href = '/staff/login';
  });
  initImport();
  document.addEventListener('add-hall-draft', (e) => openForm(e.detail.draft)); // "הוסף למערכת" בשורה מהקובץ
  document.addEventListener('open-details', (e) => showInfo(e.detail.id));     // "מעבר לאולם"
  $('#addHall').addEventListener('click', () => openForm());
  $('#hallForm').addEventListener('submit', submit);

  initSearch($('#mineSearch'), (v) => { mine.term = v; renderMine(); });
  mineView = initChips($('#mineView'), pref('staffMineView', { value: 'pending' }).value, (value) => { savePref('staffMineView', { value }); renderMine(); });
  mineSort = initSort({ box: $('#mineSort'), table: $('#mineTable'), options: [
    { key: 'date', label: 'תאריך שליחה' }, { key: 'name', label: 'שם', text: true }, { key: 'city', label: 'עיר', text: true },
    { key: 'guests', label: 'אורחים' }, { key: 'status', label: 'מצב', text: true }],
  initial: pref('staffMineSort', { key: 'date', dir: 'desc' }), onChange: (st) => { savePref('staffMineSort', st); renderMine(); } });
  $('#mineList').addEventListener('click', (e) => { if (e.target.closest('.cancel')) cancel(e.target.closest('tr').dataset.id); });

  initSearch($('#hallsSearch'), (v) => { list.term = v; renderHalls(); });
  $('#hallsCity').addEventListener('change', (e) => { list.city = e.target.value; renderHalls(); });
  hallsSort = initSort({ box: $('#hallsSort'), table: $('#hallsTable'), options: [
    { key: 'name', label: 'שם', text: true }, { key: 'city', label: 'עיר', text: true }, { key: 'guests', label: 'אורחים' }],
  initial: pref('staffHallsSort', { key: 'name', dir: 'asc' }), onChange: (st) => { savePref('staffHallsSort', st); renderHalls(); } });

  setTab(location.hash.slice(1));
  load();
}

init();

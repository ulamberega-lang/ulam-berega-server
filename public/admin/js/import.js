// לשונית "ייבוא אולמות": גוררים קובץ אקסל, ורואים לכל שורה אם האולם כבר במערכת, דומה למשהו שכבר יש (לבדוק), או חדש.
// הקובץ נקרא בדפדפן ולא נשלח לשרת. ההשוואה מול רשימת האולמות הנוכחית, ולכן אחרי הוספת אולם הסטטוס מתעדכן.
import { $, escapeHtml, formatNumber, pref, savePref, matches, toast } from './dom.js';
import { initSearch, initChips } from './controls.js';
import { readXlsx } from './xlsx.js';
import { parseRows, matchAll, hallDraft, itemKey } from './import-match.js';

const STATUS = { in: ['כבר במערכת', 'yes'], maybe: ['לבדיקה', 'maybe'], new: ['חדש', 'new'] };
const MAX_ROWS = 400; // תצוגה: עד כמה שורות בבת אחת (1,250 שורות בטבלה כבדות בטלפון); חיפוש וסינון מצמצמים

let items = [];     // השורות שנקראו מהקובץ
let rows = [];      // אחרי השוואה לאולמות
let halls = [];
let fileName = '';
let term = '';
let view;
let showAll = false;
let done = new Set(Object.keys(pref('importDone', {}))); // שורות שסומנו "טופל" (נשמר בדפדפן)
let split = new Set(Object.keys(pref('importSplit', {}))); // שורות שהופרדו מהקבוצה שלהן ("לא כפול")

const statusOf = (r) => (r.groupStatus === 'in' && r.item.group ? 'in' : r.status); // בקבוצה: אם חבר אחד כבר במערכת, כולם
const isDone = (r) => done.has(itemKey(r.item));
const noteShort = (s) => (s.length > 160 ? `${s.slice(0, 160)}…` : s);

// שורה שהופרדה מקבוצה נבדקת לבד מול המערכת (בלי מספר קבוצה); המספר המקורי נשמר להצגה
const compare = () => matchAll(items.map((it) => (split.has(itemKey(it)) && it.group ? { ...it, group: '', wasGroup: it.group } : it)), halls);

export function loadImport(allHalls) {
  halls = allHalls;
  if (items.length) rows = compare();
  render();
}

function groupClass(r, index) {
  if (!r.item.group) return '';
  const g = Number(r.item.group);
  return Number.isFinite(g) ? (g % 2 ? ' ga' : ' gb') : '';
}

function render() {
  const has = rows.length > 0;
  $('#importResults').hidden = !has;
  $('#importEmpty').hidden = has;
  if (!has) { $('#importCount').textContent = ''; return; }
  const scoped = rows.filter((r) => matches(`${r.item.name} ${r.item.synagogue} ${r.item.city} ${r.item.hood} ${r.item.address} ${r.item.phoneRaw} ${r.item.notes}`, term));
  const pending = (r) => !isDone(r);
  const groupSize = new Map();
  for (const r of rows) if (r.item.group) groupSize.set(r.item.group, (groupSize.get(r.item.group) ?? 0) + 1);
  const count = (s) => scoped.filter((r) => statusOf(r) === s && pending(r)).length;
  view.counts({ todo: scoped.filter((r) => statusOf(r) !== 'in' && pending(r)).length, new: count('new'), maybe: count('maybe'), in: scoped.filter((r) => statusOf(r) === 'in').length, done: scoped.filter(isDone).length, all: scoped.length });
  const chosen = view.get();
  const visible = scoped.filter((r) => ({
    all: true, todo: statusOf(r) !== 'in' && pending(r), new: statusOf(r) === 'new' && pending(r), maybe: statusOf(r) === 'maybe' && pending(r),
    in: statusOf(r) === 'in', done: isDone(r),
  })[chosen]);
  const shown = showAll ? visible : visible.slice(0, MAX_ROWS);

  $('#importList').innerHTML = shown.length ? shown.map((r, i) => {
    const [label, cls] = STATUS[statusOf(r)];
    const it = r.item;
    const why = r.status === 'new' ? '' : `${r.reasons.join(', ')}: ${escapeHtml(r.hall.name)}${r.hall.city_name ? ` (${escapeHtml(r.hall.city_name)})` : ''}`;
    const groupNote = it.group ? `<span class="muted">קבוצה ${escapeHtml(it.group)}${r.groupStatus !== r.status && r.groupStatus === 'in' ? ' · חבר אחר בקבוצה כבר במערכת' : ''}</span>`
      : it.wasGroup ? `<span class="muted">הופרד מקבוצה ${escapeHtml(it.wasGroup)}</span>` : '';
    const splitBtn = it.group && groupSize.get(it.group) > 1 ? '<button class="btn small ghost split" type="button" title="האולם הזה לא כפול של האחרים בקבוצה: ייבדק לבד מול המערכת">לא כפול</button>'
      : it.wasGroup ? '<button class="btn small ghost unsplit" type="button">החזר לקבוצה</button>' : '';
    return `<tr class="imp${groupClass(r, i)}${isDone(r) ? ' off' : ''}" data-i="${rows.indexOf(r)}">
      <td class="span-all"><span class="badge ${cls}">${label}</span>${isDone(r) ? ' <span class="badge">טופל</span>' : ''}<div class="why">${why}${why && groupNote ? '<br>' : ''}${groupNote}</div></td>
      <td class="span-all"><b>${escapeHtml(it.name) || '<span class="muted">(ללא שם)</span>'}</b>${it.synagogue ? `<small class="syn"> · בבית הכנסת ${escapeHtml(it.synagogue)}</small>` : ''}</td>
      <td data-label="עיר">${escapeHtml(it.city)}${it.hood ? `<small class="muted"> · ${escapeHtml(it.hood)}</small>` : ''}</td>
      <td data-label="כתובת">${escapeHtml(it.address) || '<span class="muted">-</span>'}</td>
      <td class="digits" data-label="טלפון" dir="ltr">${it.phoneRaw ? escapeHtml(it.phoneRaw) : '<span class="muted">חסר</span>'}</td>
      <td class="digits" data-label="אורחים">${it.guests ?? '<span class="muted">-</span>'}</td>
      <td class="span-all notes" title="${escapeHtml(it.notes)}">${escapeHtml(noteShort(it.notes))}${it.source ? `<small class="muted"> · ${escapeHtml(it.source.replace(/source_|\.xlsx/g, ''))}</small>` : ''}</td>
      <td class="span-all"><div class="acts">${statusOf(r) === 'in' ? '' : '<button class="btn small add" type="button">הוסף למערכת</button>'}${splitBtn}<button class="btn small ghost mark" type="button">${isDone(r) ? 'החזר לרשימה' : 'סמן כטופל'}</button></div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" class="empty">אין שורות שמתאימות לחיפוש או לסינון.</td></tr>`;

  $('#importMore').hidden = visible.length <= shown.length;
  $('#importMore').textContent = `מוצגות ${formatNumber(shown.length)} מתוך ${formatNumber(visible.length)}. להצגת הכל`;
  $('#importCount').textContent = `\u2066${fileName}\u2069 · ${formatNumber(rows.length)} שורות`; // שם הקובץ בכיוון משלו, כדי שלא יתערבב עם המספר
}

async function loadFile(file) {
  if (!file) return;
  try {
    if (!/\.xlsx$/i.test(file.name)) throw new Error('צריך קובץ אקסל בסיומת xlsx');
    items = parseRows(await readXlsx(await file.arrayBuffer()));
    if (!items.length) throw new Error('לא נמצאו אולמות בקובץ. העמודה הראשונה צריכה להיות "שם אולם"');
    fileName = file.name.replace(/^[0-9a-f]{8}-/, '');
    showAll = false;
    rows = compare();
    view.set('todo');
    toast(`נקראו ${formatNumber(items.length)} שורות`);
  } catch (err) {
    toast(err.message || 'לא הצלחתי לקרוא את הקובץ', 'error');
  }
}

export function initImport() {
  const zone = $('#importDrop'), input = $('#importFile');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { loadFile(input.files[0]); input.value = ''; });
  for (const ev of ['dragenter', 'dragover']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); });
  zone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
  // גרירה לכל מקום בדף לא תפתח את הקובץ בדפדפן
  for (const ev of ['dragover', 'drop']) window.addEventListener(ev, (e) => { if (e.target.closest?.('#importDrop')) return; if ([...(e.dataTransfer?.types ?? [])].includes('Files')) e.preventDefault(); });

  initSearch($('#importSearch'), (value) => { term = value; showAll = false; render(); });
  view = initChips($('#importView'), pref('importView', { value: 'todo' }).value, (value) => { savePref('importView', { value }); showAll = false; render(); });
  $('#importMore').addEventListener('click', () => { showAll = true; render(); });
  $('#importList').addEventListener('click', (e) => {
    const r = rows[Number(e.target.closest('tr[data-i]')?.dataset.i)];
    if (!r) return;
    if (e.target.closest('.add')) { document.dispatchEvent(new CustomEvent('add-hall-draft', { detail: { draft: hallDraft(r.item) } })); return; }
    if (e.target.closest('.split, .unsplit')) {
      const key = itemKey(r.item);
      if (split.has(key)) split.delete(key); else split.add(key);
      savePref('importSplit', Object.fromEntries([...split].map((k) => [k, 1])));
      rows = compare();
      render();
      return;
    }
    if (e.target.closest('.mark')) {
      const key = itemKey(r.item);
      if (done.has(key)) done.delete(key); else done.add(key);
      savePref('importDone', Object.fromEntries([...done].map((k) => [k, 1])));
      render();
    }
  });
}

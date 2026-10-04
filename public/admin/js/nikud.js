// לשונית "ניקוד הקראה": טבלת pronunciations (איך המערכת הטלפונית מקריאה שמות). אפשר להוסיף, לשנות ולמחוק,
// ולמעלה מוצעים כל השמות (ערים, שכונות, אולמות ובתי כנסת, כל שם כביטוי שלם) שעוד אין להם ניקוד.
import { api } from './api.js';
import { $, escapeHtml, formatNumber, toast, pref, savePref, matches } from './dom.js';
import { initSearch, initSort, sortBy } from './controls.js';
import { missingPronunciations } from './data.js';

const SORTS = [{ key: 'word', label: 'שם', text: true }, { key: 'nikud', label: 'ניקוד', text: true }];
const GETTERS = { word: (e) => e.word, nikud: (e) => e.nikud };
const KIND = { city: 'עיר', hood: 'שכונה', hall: 'אולם', synagogue: 'בית כנסת' };

let entries = [];
let halls = [];
let term = '';
let sort;

// הצעות מ-OpenAI: מוצגות בשדה כטיוטה ולא נשמרות עד לחיצה על "שמור"
const drafts = new Map();      // שם → מה שמוצג בשדה (הצעה או מה שהוקלד) ועוד לא נשמר
const suggested = new Set();   // שמות שהוצעה להם הצעה (כדי שהצעה לא תימחק אחרי שהמנהל עורך)
const options = new Map();     // שם → { list: [אפשרויות ניקוד מהסבירה לפחות], index }: "רענון" עובר לאפשרות הבאה בלי קריאה נוספת
const failed = new Set();      // שמות שההצעה שלהם נכשלה (לא מנסים שוב בלי בקשה מפורשת)
const pending = new Set();     // שמות שמחכים עכשיו להצעה (השדה מציג "מציע ניקוד…")
const kindOf = new Map();      // שם → סוג (city / hood / hall / synagogue)
const CHUNK = 25;
let suggesting = false;

export async function loadNikud(hallList, isCurrent = () => true) {
  const rows = await api.listPronunciations();
  if (!isCurrent()) return;
  entries = rows;
  halls = hallList;
  renderNikud();
  suggestMissing(isCurrent);
}

const inputRow = (word, nikud, kind) => `<tr data-word="${escapeHtml(word)}"${pending.has(word) ? ' class="pending"' : ''}>
  <td class="span-all word">${escapeHtml(word)}${kind ? ` <span class="tag">${KIND[kind]}</span>` : ''}</td>
  <td class="span-all nk"><input class="nk-input${suggested.has(word) && drafts.get(word) === nikud ? ' suggested' : ''}" dir="rtl" value="${escapeHtml(nikud)}" placeholder="${pending.has(word) ? 'מציע ניקוד…' : 'הקלד את השם עם ניקוד'}" aria-label="ניקוד של ${escapeHtml(word)}" autocomplete="off" autocapitalize="off" spellcheck="false"></td>
  <td class="nk-actions"><button class="btn nk-save">שמור</button><button class="btn ghost nk-refresh" title="הצע ניקוד אחר">רענון</button></td>
</tr>`;

const draftOf = (word, saved = '') => drafts.get(word) ?? saved;

export function renderNikud() {
  const missing = missingPronunciations(halls, entries.map((e) => e.word)).filter((m) => matches(m.text, term));
  for (const m of missing) kindOf.set(m.text, m.kind);
  $('#nikudMissing').innerHTML = missing.length
    ? missing.map((m) => inputRow(m.text, draftOf(m.text), m.kind)).join('')
    : `<tr><td colspan="3" class="empty">${term ? 'אין הצעות שמתאימות לחיפוש.' : 'כל השמות כבר מנוקדים. כל הכבוד!'}</td></tr>`;
  $('#nikudMissingCount').textContent = missing.length ? `${formatNumber(missing.length)} שמות בלי ניקוד` : '';

  const shown = sortBy(entries.filter((e) => matches(`${e.word} ${e.nikud}`, term)), sort.state, GETTERS, (a, b) => a.word.localeCompare(b.word, 'he'));
  $('#nikudList').innerHTML = shown.length ? shown.map((e) => inputRow(e.word, draftOf(e.word, e.nikud), null)).join('')
    : `<tr><td colspan="3" class="empty">${entries.length ? 'אין ניקודים שמתאימים לחיפוש.' : 'עוד אין ניקודים בטבלה.'}</td></tr>`;
  $('#nikudCount').textContent = entries.length ? `${formatNumber(shown.length)} מתוך ${formatNumber(entries.length)} ניקודים` : '';
}

// ---------- הצעות מ-OpenAI ----------

// מבקש הצעות לשמות שאין להם ניקוד, בקבוצות, ומציב אותן בשדות הריקים (בלי לדרוס מה שהמנהל כבר הקליד).
// בזמן ההמתנה מוצג פס עם התקדמות, והשדות מציגים "מציע ניקוד…"
function banner(text) {
  $('#nikudBanner').hidden = !text;
  $('#nikudBannerText').textContent = text;
}

async function suggestMissing(isCurrent) {
  if (suggesting) return;
  suggesting = true;
  const todo = missingPronunciations(halls, entries.map((e) => e.word)).filter((m) => !drafts.has(m.text) && !failed.has(m.text));
  try {
    if (!todo.length) return;
    for (const m of todo) pending.add(m.text);
    renderNikud();
    for (let i = 0; i < todo.length && isCurrent(); i += CHUNK) {
      banner(`מציע ניקוד… ${Math.min(i, todo.length)} מתוך ${todo.length} שמות`);
      const chunk = todo.slice(i, i + CHUNK);
      try {
        const { suggestions } = await api.suggestPronunciations(chunk.map((m) => ({ text: m.text, kind: m.kind })), {});
        for (const m of chunk) {
          const list = suggestions[m.text];
          if (list?.length && !drafts.has(m.text)) { drafts.set(m.text, list[0]); suggested.add(m.text); options.set(m.text, { list, index: 0 }); }
          else failed.add(m.text);
        }
      } catch (err) {
        for (const m of chunk) failed.add(m.text);
        toast(`הצעת הניקוד נכשלה: ${err.message}`, 'error');
        break;
      } finally {
        for (const m of chunk) pending.delete(m.text);
        renderNikud();
      }
    }
  } finally {
    for (const m of todo) pending.delete(m.text); // יצאנו באמצע (שגיאה או מעבר לשונית)
    suggesting = false;
    banner('');
    renderNikud();
  }
}

// כפתור "רענון": האפשרות הבאה מהרשימה שהמודל כבר החזיר (מיידי, בלי עלות). כשנגמרו - מבקש אפשרויות חדשות.
// עובד גם לשם שכבר נשמר (אז ההצעה הראשונה היא אלטרנטיבה לניקוד השמור)
async function refresh(row) {
  const word = row.dataset.word;
  const button = row.querySelector('.nk-refresh');
  const input = row.querySelector('.nk-input');
  const show = (value) => { drafts.set(word, value); suggested.add(word); input.value = value; input.classList.add('suggested'); };

  const known = options.get(word);
  if (known && known.index + 1 < known.list.length) { known.index++; show(known.list[known.index]); return; }

  button.disabled = true;
  button.textContent = 'מציע…';
  try {
    const seen = [...(known?.list ?? []), input.value.trim()].filter(Boolean);
    const { suggestions } = await api.suggestPronunciations([{ text: word, kind: kindOf.get(word) ?? '' }], { [word]: seen });
    const more = suggestions[word];
    if (!more?.length) throw new Error('אין עוד הצעות. אפשר להקליד ידנית');
    const list = [...(known?.list ?? []), ...more];
    options.set(word, { list, index: list.length - more.length });
    show(more[0]);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'רענון';
  }
}

// ---------- שמירה ----------

// שדה ריק בשם שכבר נשמר = מחיקת הניקוד (השם יוקרא בלי ניקוד)
async function save(row) {
  const word = row.dataset.word;
  const nikud = row.querySelector('.nk-input').value.trim();
  const isSaved = entries.some((e) => e.word === word);
  if (!nikud && !isSaved) { toast('חסר ניקוד. אפשר ללחוץ "רענון" להצעה', 'error'); return; }
  if (!nikud && !confirm(`למחוק את הניקוד של "${word}"? אחרי המחיקה השם יוקרא בלי ניקוד.`)) return;
  const button = row.querySelector('.nk-save');
  button.disabled = true;
  try {
    const saved = await api.savePronunciation(word, nikud);
    entries = entries.filter((e) => e.word !== saved.word);
    if (saved.nikud) entries.push(saved);
    drafts.delete(word);
    suggested.delete(word);
    if (!saved.nikud) failed.add(word); // נמחק: לא מציעים שוב אוטומטית
    renderNikud();
    toast(saved.nikud ? `הניקוד של "${word}" נשמר` : 'הניקוד נמחק');
  } catch (err) {
    toast(err.message, 'error');
    button.disabled = false;
  }
}

export function initNikud() {
  initSearch($('#nikudSearch'), (value) => { term = value; renderNikud(); });
  sort = initSort({
    box: $('#nikudSort'), table: $('.nikud-table'), options: SORTS,
    initial: pref('nikudSort', { key: 'word', dir: 'asc' }),
    onChange: (state) => { savePref('nikudSort', state); renderNikud(); },
  });
  for (const body of [$('#nikudMissing'), $('#nikudList')]) {
    body.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-word]');
      if (!row) return;
      if (e.target.closest('.nk-save')) save(row);
      else if (e.target.closest('.nk-refresh')) refresh(row);
    });
    body.addEventListener('input', (e) => {
      if (!e.target.classList.contains('nk-input')) return;
      const word = e.target.closest('tr[data-word]').dataset.word;
      drafts.set(word, e.target.value); // טיוטה: לא הולכת לאיבוד בחיפוש או בסינון
      e.target.classList.remove('suggested');
    });
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('nk-input')) { e.preventDefault(); save(e.target.closest('tr[data-word]')); }
    });
  }
}

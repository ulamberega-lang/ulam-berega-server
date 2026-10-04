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
const previous = new Map();    // שם → הצעות קודמות (הרענון מבקש הצעה אחרת)
const failed = new Set();      // שמות שההצעה שלהם נכשלה (לא מנסים שוב בלי בקשה מפורשת)
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

const inputRow = (word, nikud, kind) => `<tr data-word="${escapeHtml(word)}">
  <td class="span-all word">${escapeHtml(word)}${kind ? ` <span class="tag">${KIND[kind]}</span>` : ''}</td>
  <td class="span-all nk"><input class="nk-input${suggested.has(word) && drafts.get(word) === nikud ? ' suggested' : ''}" dir="rtl" value="${escapeHtml(nikud)}" placeholder="הקלד את השם עם ניקוד" aria-label="ניקוד של ${escapeHtml(word)}" autocomplete="off" autocapitalize="off" spellcheck="false"></td>
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

// מבקש הצעות לשמות שאין להם ניקוד, בקבוצות, ומציב אותן בשדות הריקים (בלי לדרוס מה שהמנהל כבר הקליד)
async function suggestMissing(isCurrent) {
  if (suggesting) return;
  suggesting = true;
  try {
    const todo = missingPronunciations(halls, entries.map((e) => e.word)).filter((m) => !drafts.has(m.text) && !failed.has(m.text));
    $('#nikudStatus').textContent = todo.length ? 'מציע ניקוד…' : '';
    for (let i = 0; i < todo.length && isCurrent(); i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK);
      try {
        const { suggestions } = await api.suggestPronunciations(chunk.map((m) => ({ text: m.text, kind: m.kind })), {});
        for (const m of chunk) {
          if (suggestions[m.text] && !drafts.has(m.text)) { drafts.set(m.text, suggestions[m.text]); suggested.add(m.text); previous.set(m.text, [suggestions[m.text]]); }
          else failed.add(m.text);
        }
        renderNikud();
      } catch (err) {
        for (const m of chunk) failed.add(m.text);
        toast(`הצעת הניקוד נכשלה: ${err.message}`, 'error');
        break;
      }
    }
  } finally {
    suggesting = false;
    $('#nikudStatus').textContent = '';
  }
}

// כפתור "רענון": הצעה אחרת לשם אחד (גם לשם שכבר נשמר)
async function refresh(row) {
  const word = row.dataset.word;
  const button = row.querySelector('.nk-refresh');
  const input = row.querySelector('.nk-input');
  button.disabled = true;
  button.textContent = 'מציע…';
  try {
    const { suggestions } = await api.suggestPronunciations([{ text: word, kind: kindOf.get(word) ?? '' }], { [word]: [...(previous.get(word) ?? []), input.value.trim()].filter(Boolean) });
    const next = suggestions[word];
    if (!next) throw new Error('לא התקבלה הצעה. נסה שוב');
    previous.set(word, [...(previous.get(word) ?? []), next]);
    suggested.add(word);
    drafts.set(word, next);
    input.value = next;
    input.classList.add('suggested');
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

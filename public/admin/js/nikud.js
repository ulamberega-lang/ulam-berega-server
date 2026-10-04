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

export async function loadNikud(hallList, isCurrent = () => true) {
  const rows = await api.listPronunciations();
  if (!isCurrent()) return;
  entries = rows;
  halls = hallList;
  renderNikud();
}

const inputRow = (word, nikud, kind, deletable) => `<tr data-word="${escapeHtml(word)}">
  <td class="span-all word">${escapeHtml(word)}${kind ? ` <span class="tag">${KIND[kind]}</span>` : ''}</td>
  <td class="span-all nk"><input class="nk-input" dir="rtl" value="${escapeHtml(nikud)}" placeholder="הקלד את השם עם ניקוד" aria-label="ניקוד של ${escapeHtml(word)}" autocomplete="off" autocapitalize="off" spellcheck="false"></td>
  <td class="nk-actions"><button class="btn nk-save">שמור</button>${deletable ? '<button class="icon-btn nk-delete" aria-label="מחיקה" title="מחיקה">✕</button>' : ''}</td>
</tr>`;

export function renderNikud() {
  const missing = missingPronunciations(halls, entries.map((e) => e.word)).filter((m) => matches(m.text, term));
  $('#nikudMissing').innerHTML = missing.length
    ? missing.map((m) => inputRow(m.text, '', m.kind, false)).join('')
    : `<tr><td colspan="3" class="empty">${term ? 'אין הצעות שמתאימות לחיפוש.' : 'כל השמות כבר מנוקדים. כל הכבוד!'}</td></tr>`;
  $('#nikudMissingCount').textContent = missing.length ? `${formatNumber(missing.length)} שמות בלי ניקוד` : '';

  const shown = sortBy(entries.filter((e) => matches(`${e.word} ${e.nikud}`, term)), sort.state, GETTERS, (a, b) => a.word.localeCompare(b.word, 'he'));
  $('#nikudList').innerHTML = shown.length ? shown.map((e) => inputRow(e.word, e.nikud, null, true)).join('')
    : `<tr><td colspan="3" class="empty">${entries.length ? 'אין ניקודים שמתאימים לחיפוש.' : 'עוד אין ניקודים בטבלה.'}</td></tr>`;
  $('#nikudCount').textContent = entries.length ? `${formatNumber(shown.length)} מתוך ${formatNumber(entries.length)} ניקודים` : '';
}

async function save(row) {
  const word = row.dataset.word;
  const nikud = row.querySelector('.nk-input').value.trim();
  const button = row.querySelector('.nk-save');
  button.disabled = true;
  try {
    const saved = await api.savePronunciation(word, nikud);
    entries = [...entries.filter((e) => e.word !== saved.word), saved];
    renderNikud();
    toast(`הניקוד של "${word}" נשמר`);
  } catch (err) {
    toast(err.message, 'error');
    button.disabled = false;
  }
}

async function remove(row) {
  const word = row.dataset.word;
  if (!confirm(`למחוק את הניקוד של "${word}"? אחרי המחיקה השם יוקרא בלי ניקוד.`)) return;
  try { await api.deletePronunciation(word); } catch (err) { toast(err.message, 'error'); return; }
  entries = entries.filter((e) => e.word !== word);
  renderNikud();
  toast('הניקוד נמחק');
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
      else if (e.target.closest('.nk-delete')) remove(row);
    });
    body.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('nk-input')) { e.preventDefault(); save(e.target.closest('tr[data-word]')); }
    });
  }
}

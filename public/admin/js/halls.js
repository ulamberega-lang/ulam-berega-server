// לשונית "ניהול אולמות": רשימה, הוספה ועריכה.
import { api } from './api.js';
import { $, escapeHtml } from './dom.js';

let halls = [];
let editing = null;
let onSaved = () => {};

export function renderHalls(list) {
  halls = list;
  fillSuggestions();
  const term = $('#hallsSearch').value.trim();
  const visible = halls
    .filter((h) => !term || [h.name, h.city_name, h.neighborhood_name, h.extension].some((v) => String(v ?? '').includes(term)))
    .sort((a, b) => a.city_name.localeCompare(b.city_name, 'he') || a.name.localeCompare(b.name, 'he'));

  $('#hallsList').innerHTML = visible.length ? visible.map((h) => `
    <button class="hall-row${h.is_active ? '' : ' off'}" data-id="${h.id}">
      <span class="name">${escapeHtml(h.name)}</span>${h.is_active ? '' : '<span class="tag">מושבת</span>'}
      <div class="meta">${escapeHtml(h.city_name)}${h.neighborhood_name ? `, ${escapeHtml(h.neighborhood_name)}` : ''},
        עד ${h.max_guests ?? '?'} אורחים, שלוחה ${escapeHtml(h.extension)}, טלפון ${escapeHtml(h.gabbai_phone)}</div>
    </button>`).join('')
    : `<div class="empty">${halls.length ? 'לא נמצאו אולמות שמתאימים לחיפוש.' : 'עוד אין אולמות. לחץ על "הוסף אולם" כדי להתחיל.'}</div>`;
}

function fillSuggestions() {
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));
  const options = (values) => values.map((v) => `<option value="${escapeHtml(v)}">`).join('');
  $('#cityOptions').innerHTML = options(unique(halls.map((h) => h.city_name)));
  $('#hoodOptions').innerHTML = options(unique(halls.map((h) => h.neighborhood_name)));
}

function openForm(hall) {
  editing = hall || null;
  const form = $('#hallForm');
  form.reset();
  $('#hallFormError').innerHTML = '';
  $('#hallFormTitle').textContent = hall ? 'עריכת אולם' : 'אולם חדש';
  if (hall) {
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = Boolean(hall[el.name]);
      else el.value = hall[el.name] ?? '';
    }
  }
  $('#hallDialog').showModal();
}

async function save(e) {
  if (e.submitter?.value !== 'save') return;
  e.preventDefault();
  const form = e.target;
  const data = {};
  for (const el of form.elements) if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value;

  const button = e.submitter;
  button.disabled = true;
  try {
    const saved = editing ? await api.updateHall(editing.id, data) : await api.createHall(data);
    $('#hallDialog').close();
    onSaved(saved);
  } catch (err) {
    $('#hallFormError').innerHTML = `<div class="error-box">${escapeHtml(err.message)}</div>`;
  } finally {
    button.disabled = false;
  }
}

export function initHalls(savedCallback) {
  onSaved = savedCallback;
  $('#hallsSearch').addEventListener('input', () => renderHalls(halls));
  $('#addHall').addEventListener('click', () => openForm());
  $('#hallsList').addEventListener('click', (e) => {
    const row = e.target.closest('.hall-row');
    if (row) openForm(halls.find((h) => String(h.id) === row.dataset.id));
  });
  $('#hallForm').addEventListener('submit', save);
}

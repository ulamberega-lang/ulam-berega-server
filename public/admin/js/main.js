// הרכבת הדף: לשוניות, טווח תאריכים וטעינת הנתונים.
import { api } from './api.js';
import { $, $$, showError } from './dom.js';
import { preset, hebrewRange } from './dates.js';
import { initStats, loadStats } from './stats.js';
import { initCalls, loadCalls, fillHallFilter } from './calls.js';
import { initHalls, renderHalls } from './halls.js';

const state = { tab: 'stats', range: preset('month'), halls: [] };

let requestId = 0;

async function refresh() {
  showError('');
  const current = ++requestId;
  const isCurrent = () => current === requestId; // תשובה ישנה (לחיצות מהירות) לא דורסת חדשה
  try {
    if (state.tab === 'stats') await loadStats(state.range, state.halls, isCurrent);
    if (state.tab === 'calls') await loadCalls(state.range, state.halls, isCurrent);
    if (state.tab === 'halls') renderHalls(state.halls);
  } catch (err) {
    if (isCurrent()) showError(err.message);
  }
}

function setRange(range, presetName = null) {
  state.range = range;
  $('#from').value = range.from;
  $('#to').value = range.to;
  $('#hebrewRange').textContent = hebrewRange(range);
  $$('.presets button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.preset === presetName));
  refresh();
}

function setTab(tab) {
  state.tab = tab;
  $$('.topbar nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  for (const name of ['stats', 'calls', 'halls']) $(`#tab-${name}`).hidden = name !== tab;
  $('#range').hidden = tab === 'halls';
  refresh();
}

async function loadHalls() {
  state.halls = await api.listHalls();
  fillHallFilter(state.halls);
}

function init() {
  $$('.topbar nav button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $$('.presets button').forEach((b) => b.addEventListener('click', () => setRange(preset(b.dataset.preset), b.dataset.preset)));
  for (const id of ['#from', '#to']) {
    $(id).addEventListener('change', () => {
      const from = $('#from').value, to = $('#to').value;
      if (from && to && from <= to) setRange({ from, to });
    });
  }

  initStats(refresh);
  initCalls(refresh);
  initHalls(async () => { await loadHalls(); refresh(); });

  $('#from').value = state.range.from;
  $('#to').value = state.range.to;
  $('#hebrewRange').textContent = hebrewRange(state.range);
  loadHalls().then(refresh).catch((err) => showError(err.message));
}

init();

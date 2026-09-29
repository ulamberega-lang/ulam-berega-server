// הרכבת הדף: לשוניות, טווח תאריכים וטעינת הנתונים.
import { api } from './api.js';
import { $, $$, showError } from './dom.js';
import { preset, hebrewRange } from './dates.js';
import { initStats, loadStats } from './stats.js';
import { initCalls, loadCalls, setHallFilter } from './calls.js';
import { initHalls, loadHalls } from './halls.js';

const TABS = ['stats', 'calls', 'halls'];
const fromHash = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'stats');
const state = { tab: fromHash(), range: preset('month'), halls: [] };

let requestId = 0;

async function refresh() {
  showError('');
  const current = ++requestId;
  const isCurrent = () => current === requestId; // תשובה ישנה (לחיצות מהירות) לא דורסת חדשה
  setBusy(true);
  try {
    if (state.tab === 'stats') await loadStats(state.range, state.halls, isCurrent);
    if (state.tab === 'calls') await loadCalls(state.range, state.halls, isCurrent);
    if (state.tab === 'halls') await loadHalls(state.range, state.halls, isCurrent);
    if (isCurrent()) $('#updated').textContent = `עודכן ב-${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (err) {
    if (isCurrent()) showError(err.message);
  } finally {
    if (isCurrent()) setBusy(false);
  }
}

function setBusy(busy) {
  $('#progress').hidden = !busy;
  document.body.classList.toggle('busy', busy);
  $('#refresh').disabled = busy;
}

function setRange(range, presetName = null) {
  state.range = range;
  $('#from').value = range.from;
  $('#to').value = range.to;
  $('#hebrewRange').textContent = hebrewRange(range);
  $$('.presets button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.preset === presetName));
  refresh();
}

function setTab(tab, { push = true, load = true } = {}) {
  state.tab = tab;
  $$('.topbar nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  for (const name of TABS) $(`#tab-${name}`).hidden = name !== tab;
  if (push && location.hash.slice(1) !== tab) history.replaceState(null, '', `#${tab}`);
  window.scrollTo({ top: 0 });
  if (load) refresh();
}

async function loadHallList() {
  state.halls = await api.listHalls();
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
  $('#refresh').addEventListener('click', async () => {
    try { await loadHallList(); } catch (err) { showError(err.message); return; }
    refresh();
  });
  window.addEventListener('hashchange', () => { if (fromHash() !== state.tab) setTab(fromHash(), { push: false }); });

  initStats(refresh);
  initCalls(refresh);
  initHalls(async () => { await loadHallList(); refresh(); });

  // קישורים בין לשוניות: "יומן השיחות של האולם"
  document.addEventListener('open-calls', (e) => {
    setHallFilter(e.detail.hall);
    setTab('calls');
  });

  $('#from').value = state.range.from;
  $('#to').value = state.range.to;
  $('#hebrewRange').textContent = hebrewRange(state.range);
  setTab(state.tab, { push: false, load: false });
  setBusy(true);
  loadHallList().then(refresh).catch((err) => { setBusy(false); showError(err.message); });
}

init();

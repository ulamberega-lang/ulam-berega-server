// הרכבת הדף: לשוניות, טווח תאריכים וטעינת הנתונים.
import { api } from './api.js';
import { $, $$, showError } from './dom.js';
import { preset, hebrewRange } from './dates.js';
import { initStats, loadStats, getSelectedHall, setSelectedHall } from './stats.js';
import { initCalls, loadCalls, setHallFilter, getHallFilter, restoreHallFilter } from './calls.js';
import { initHalls, loadHalls } from './halls.js';

const TABS = ['stats', 'calls', 'halls'];
const fromHash = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'stats');
const state = { tab: fromHash(), range: preset('all'), halls: [] };

let requestId = 0;

async function refresh() {
  showError('');
  const current = ++requestId;
  const isCurrent = () => current === requestId; // תשובה ישנה (לחיצות מהירות) לא דורסת חדשה
  setBusy(true);
  const tab = state.tab; // נקבע פעם אחת: מעבר לשונית באמצע לא ימשיך לטעינה של הלשונית החדשה
  try {
    if (tab === 'stats') await loadStats(state.range, state.halls, isCurrent);
    else if (tab === 'calls') await loadCalls(state.range, state.halls, isCurrent);
    else await loadHalls(state.range, state.halls, isCurrent);
    if (isCurrent()) $('#updated').textContent = `עודכן ב-${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (err) {
    if (isCurrent()) showError(err.message);
  } finally {
    if (isCurrent()) setBusy(false);
  }
}

function setBusy(busy) {
  $('#progress').hidden = !busy;
  $('#loadingChip').hidden = !busy;
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

// היסטוריית ניווט: כל מעבר בין לשוניות או בחירת אולם הוא "מקום", וכפתור חזרה מחזיר למקום הקודם
// (כולל האולם שנבחר והגלילה). אותו מנגנון משמש גם את כפתור החזרה של הדפדפן והאייפון.
const snapshot = (n) => ({ n, tab: state.tab, hall: getSelectedHall()?.id ?? null, callsHall: getHallFilter() });

function updateBack() {
  $('#back').hidden = !(history.state?.n > 0);
}

// לפני שעוזבים מקום: שומרים בו את מה שהשתנה בלי מעבר (מיקום גלילה, וסינון האולם אם זה מקום ביומן השיחות)
function saveCurrent() {
  const here = history.state ?? {};
  history.replaceState({ ...here, ...(here.tab === 'calls' && { callsHall: getHallFilter() }), y: window.scrollY }, '');
}

// מקום חדש בהיסטוריה (אחרי saveCurrent)
function pushPlace() {
  history.pushState(snapshot((history.state?.n ?? 0) + 1), '', `#${state.tab}`);
  updateBack();
}

async function restorePlace(place) {
  setSelectedHall(place.hall == null ? null : state.halls.find((h) => h.id === place.hall) ?? null);
  restoreHallFilter(place.callsHall || '');
  setTab(place.tab, { record: false, load: false });
  updateBack();
  await refresh();
  if (place.y) window.scrollTo({ top: place.y });
}

function setTab(tab, { record = true, load = true } = {}) {
  const changed = tab !== state.tab;
  if (record && changed) saveCurrent();
  state.tab = tab;
  $$('.topbar nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  for (const name of TABS) $(`#tab-${name}`).hidden = name !== tab;
  if (record && changed) pushPlace();
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
  $('#back').addEventListener('click', () => history.back());
  window.addEventListener('popstate', (e) => { if (e.state) restorePlace(e.state); });
  window.addEventListener('hashchange', () => { if (fromHash() !== state.tab) setTab(fromHash(), { record: false }); });

  initStats(refresh);
  initCalls(refresh);
  initHalls(async () => { await loadHallList(); refresh(); });
  document.addEventListener('stats-select', () => { saveCurrent(); pushPlace(); }); // בחירת אולם / ניקוי הבחירה

  // קישורים בין לשוניות: "יומן השיחות של האולם"
  document.addEventListener('open-calls', (e) => {
    setHallFilter(e.detail.hall);
    setTab('calls');
  });

  $('#from').value = state.range.from;
  $('#to').value = state.range.to;
  $('#hebrewRange').textContent = hebrewRange(state.range);
  history.scrollRestoration = 'manual';
  if (!history.state) history.replaceState(snapshot(0), '', `#${state.tab}`);
  setTab(state.tab, { record: false, load: false });
  updateBack();
  setBusy(true);
  loadHallList().then(refresh).catch((err) => { setBusy(false); showError(err.message); });
}

init();

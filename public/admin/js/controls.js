// רכיבים משותפים לכל הלשוניות: שדה חיפוש, כפתורי סינון ומיון.

// שדה חיפוש עם כפתור ניקוי; Enter סוגר את המקלדת באייפון
export function initSearch(input, onChange) {
  const clear = input.closest('.search').querySelector('.clear');
  const sync = () => { clear.hidden = !input.value; };
  input.addEventListener('input', () => { sync(); onChange(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  clear.addEventListener('click', () => { input.value = ''; sync(); onChange(''); input.focus(); });
  return { set(value) { input.value = value; sync(); } };
}

// שורת כפתורי סינון (בחירה אחת). אפשר להוסיף לכל כפתור מונה.
export function initChips(root, initial, onChange) {
  let value = initial;
  const buttons = [...root.querySelectorAll('button[data-value]')];
  const render = () => buttons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === value));
  buttons.forEach((b) => b.addEventListener('click', () => { value = b.dataset.value; render(); onChange(value); }));
  render();
  return {
    get: () => value,
    set(next) { value = next; render(); onChange(value); },
    counts(map) {
      buttons.forEach((b) => {
        const n = map[b.dataset.value];
        b.querySelector('.n').textContent = n == null ? '' : n.toLocaleString('he-IL');
      });
    },
  };
}

// מיון: רשימה נפתחת + כפתור הפיכת כיוון, וגם לחיצה על כותרות טבלה.
// options: [{ key, label, text?, first? }]; first = הכיוון הראשון בבחירת עמודה
export function initSort({ box, table, options, initial, onChange }) {
  const state = { ...initial };
  const first = new Map(options.map((o) => [o.key, o.first || (o.text ? 'asc' : 'desc')]));
  const select = box?.querySelector('select');
  const dirButton = box?.querySelector('.dir');
  if (select) select.innerHTML = options.map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
  if (!first.has(state.key)) state.key = options[0].key;

  const render = () => {
    if (select) select.value = state.key;
    if (dirButton) {
      dirButton.dataset.dir = state.dir;
      dirButton.title = dirButton.ariaLabel = state.dir === 'asc' ? 'סדר עולה. לחיצה הופכת את הסדר' : 'סדר יורד. לחיצה הופכת את הסדר';
    }
    table?.querySelectorAll('th[data-sort]').forEach((th) => th.setAttribute('aria-sort',
      th.dataset.sort === state.key ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'));
  };
  const changed = () => { render(); onChange(state); };
  const toggle = (key) => {
    if (state.key === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.key = key; state.dir = first.get(key) ?? 'desc'; }
    changed();
  };

  select?.addEventListener('change', () => { state.key = select.value; state.dir = first.get(state.key); changed(); });
  dirButton?.addEventListener('click', () => { state.dir = state.dir === 'asc' ? 'desc' : 'asc'; changed(); });
  table?.querySelectorAll('th[data-sort]').forEach((th) => {
    th.tabIndex = 0;
    th.addEventListener('click', () => toggle(th.dataset.sort));
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(th.dataset.sort); } });
  });
  render();
  return { state };
}

// ממיין עותק של הרשימה. ערכים ריקים תמיד בסוף; בשוויון - לפי tiebreak.
export function sortBy(list, { key, dir }, getters, tiebreak = () => 0) {
  const get = getters[key];
  const sign = dir === 'asc' ? 1 : -1;
  const empty = (v) => v == null || v === '' || Number.isNaN(v);
  return [...list].sort((a, b) => {
    const va = get(a), vb = get(b);
    if (empty(va) || empty(vb)) return (empty(va) - empty(vb)) || tiebreak(a, b);
    const diff = typeof va === 'string' ? va.localeCompare(vb, 'he', { numeric: true }) : va - vb;
    return diff * sign || tiebreak(a, b);
  });
}

// חלון "פרטי אולם": כל מה שרשום על האולם ומספרי השיחות שלו. נפתח מלשונית "שיחות לפי אולם" ומהיומן.
// החלון נכנס להיסטוריית הדפדפן, כך שכפתור חזרה (גם באייפון) סוגר אותו ולא עוזב את המסך.
import { api } from './api.js';
import { $, escapeHtml, formatNumber, icon } from './dom.js';
import { ALL_FROM } from './dates.js';
import { splitHoods } from './hoods.js';

let ctx = { getHalls: () => [], getRange: () => ({}), afterPush: () => {} };
let openSeq = 0;

const dialog = () => $('#detailsDialog');

export function isDetailsOpen() { return dialog().open; }

// מנגנון הניווט קורא לזה בחזרה אחורה: אם החלון פתוח - סוגרים אותו ולא משחזרים מקום
export function closeDetailsIfOpen() {
  if (!dialog().open) return false;
  dialog().close();
  return true;
}

const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('he-IL', { timeZone: 'UTC' });

function statsBlock(title, s) {
  const total = Number(s?.total || 0), yes = Number(s?.answered || 0), no = Number(s?.unanswered || 0);
  return `<section class="d-stats"><h3>${title}</h3>
    <dl class="mini">
      <div><dt>שיחות</dt><dd>${formatNumber(total)}</dd></div>
      <div class="yes"><dt>נענו</dt><dd>${formatNumber(yes)}</dd></div>
      <div class="no"><dt>לא נענו</dt><dd>${formatNumber(no)}</dd></div>
      <div><dt>מענה</dt><dd>${total ? `${Math.round((yes / total) * 100)}%` : '-'}</dd></div>
    </dl>
    ${total ? `<span class="bar" aria-hidden="true"><i class="y" style="width:${(yes / total) * 100}%"></i><i class="n" style="width:${(no / total) * 100}%"></i></span>` : ''}
  </section>`;
}

const field = (label, value) => (value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : '');

function render(hall, range, stats) {
  const e = escapeHtml;
  const phone = hall.gabbai_phone ? `<a href="tel:${e(hall.gabbai_phone)}">${e(hall.gabbai_phone)}</a>` : '';
  const mail = hall.gabbai_email ? `<a href="mailto:${e(hall.gabbai_email)}">${e(hall.gabbai_email)}</a>` : '';
  const all = range.from === ALL_FROM;
  const counts = !stats ? '<p class="muted d-loading">טוען מספרי שיחות…</p>'
    : all ? statsBlock('שיחות בכל הזמנים', stats.period)
      : statsBlock(`שיחות בתקופה שנבחרה: ${day(range.from)} עד ${day(range.to)}`, stats.period) + statsBlock('שיחות בכל הזמנים', stats.all);

  $('#detailsBody').dataset.id = hall.id;
  $('#detailsBody').innerHTML = `
    <header>
      <h2 id="detailsTitle">${e(hall.name)}${hall.is_active ? '' : '<span class="tag">מושבת</span>'}</h2>
      <button class="icon-btn" data-act="close" aria-label="סגירה" title="סגירה">${icon('x')}</button>
    </header>
    ${hall.synagogue_name ? `<p class="d-sub">בבית הכנסת ${e(hall.synagogue_name)}</p>` : ''}
    <dl class="d-fields">
      ${field('עיר', e(hall.city_name))}
      ${field('שכונה', splitHoods(hall.neighborhood_name).map(e).join(', '))}
      ${field('כתובת', e(hall.address))}
      ${field('מקסימום אורחים', hall.max_guests ? formatNumber(hall.max_guests) : '')}
      ${field('שלוחה', e(hall.extension))}
      ${field('טלפון להעברה', phone)}
      ${field('מייל לעדכונים', mail)}
      ${field('מצב', hall.is_active ? 'פעיל' : 'מושבת, לא מופיע בחיפוש הטלפוני')}
    </dl>
    ${counts}
    <div class="d-actions">
      <button class="btn" data-act="edit">${icon('edit')}עריכת האולם</button>
      <button class="btn ghost" data-act="calls">יומן השיחות של האולם</button>
    </div>`;
}

async function open(id) {
  const hall = ctx.getHalls().find((h) => String(h.id) === String(id));
  if (!hall) return;
  const range = ctx.getRange();
  const mine = ++openSeq;
  render(hall, range, null);
  if (!dialog().open) {
    dialog().showModal();
    history.pushState({ ...history.state, n: (history.state?.n ?? 0) + 1, dialog: true }, '');
    ctx.afterPush();
  }
  try {
    const [period, all] = await Promise.all([
      api.statsByHall(range),
      range.from === ALL_FROM ? null : api.statsByHall({ from: ALL_FROM, to: range.to }),
    ]);
    if (mine !== openSeq || !dialog().open) return;
    const pick = (rows) => rows?.find((r) => String(r.hall_id) === String(hall.id));
    render(hall, range, { period: pick(period), all: pick(all ?? period) });
  } catch (err) {
    if (mine !== openSeq) return;
    $('#detailsBody .d-loading')?.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: `מספרי השיחות לא נטענו. ${err.message}` }));
  }
}

// סוגרים דרך ההיסטוריה (כמו כפתור חזרה); מנגנון הניווט הראשי סוגר בפועל את החלון
function dismiss() {
  if (history.state?.dialog) history.back();
  else dialog().close();
}

// סוגר, ורק אחרי שההיסטוריה חזרה למקום - מבצע את הפעולה (מעבר ליומן / עריכה)
function leaveThen(action) {
  if (!history.state?.dialog) { dialog().close(); action(); return; }
  addEventListener('popstate', action, { once: true }); // נרשם אחרי המאזין הראשי, ולכן רץ אחריו
  history.back();
}

export function initDetails(options) {
  ctx = { ...ctx, ...options };
  document.addEventListener('open-details', (e) => open(e.detail.id));
  const dlg = dialog();
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(); }); // Escape
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) { dismiss(); return; } // לחיצה על הרקע
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const hall = ctx.getHalls().find((h) => String($('#detailsBody').dataset.id) === String(h.id));
    if (act === 'close') dismiss();
    else if (hall && act === 'calls') leaveThen(() => document.dispatchEvent(new CustomEvent('open-calls', { detail: { hall } })));
    else if (hall && act === 'edit') leaveThen(() => document.dispatchEvent(new CustomEvent('edit-hall', { detail: { hall } })));
  });
}

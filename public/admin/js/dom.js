// עזרים קטנים ל-DOM, לחיפוש ולשמירת העדפות.
export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const formatNumber = (n) => Number(n || 0).toLocaleString('he-IL');

export const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '');

export const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function showError(message) {
  $('#error').innerHTML = message ? `<div class="error-box" role="alert">${escapeHtml(message)}</div>` : '';
}

// חיפוש: בלי ניקוד, גרשיים ומקפים, ולא רגיש לאותיות גדולות. כל מילה בחיפוש חייבת להופיע.
const simplify = (s) => String(s ?? '').toLowerCase().replace(/[֑-ׇ]/g, '').replace(/["'`׳״\-]/g, '');
export function matches(haystack, term) {
  const words = simplify(term).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = simplify(haystack);
  return words.every((w) => text.includes(w));
}

// העדפות (מיון, סינון) נשמרות בדפדפן; אם הוא חוסם אחסון - הדף עובד בלי זה.
const PREFS = 'ub-admin-v1';
export function pref(name, fallback) {
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(PREFS))?.[name] ?? {}) }; } catch { return fallback; }
}
export function savePref(name, value) {
  try {
    const all = JSON.parse(localStorage.getItem(PREFS)) ?? {};
    localStorage.setItem(PREFS, JSON.stringify({ ...all, [name]: value }));
  } catch { /* אחסון חסום */ }
}

// תא ב-CSV: מירכאות, וגם הגנה מפני נוסחאות באקסל (תא שמתחיל ב- = + - @ נשמר כטקסט עם גרש בהתחלה).
// מספרי מתקשרים מגיעים מהמערכת הטלפונית ללא אימות, ולכן אסור שיתפרשו כנוסחה.
export const csvCell = (v) => {
  const text = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

// CSV שנפתח נכון באקסל בעברית (BOM + מירכאות)
export function downloadCsv(filename, header, rows) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ממלא רשימה נפתחת ושומר את הבחירה אם היא עדיין קיימת
export function fillSelect(select, values, allLabel) {
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` +
    values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  select.value = values.includes(current) ? current : '';
}

export const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'));

// הודעה קצרה שנעלמת לבד (למשל "האולם נשמר")
export function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3600);
}

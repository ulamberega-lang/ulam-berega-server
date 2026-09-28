// עזרים קטנים ל-DOM.
export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const formatNumber = (n) => Number(n || 0).toLocaleString('he-IL');

export const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '');

export function showError(message) {
  $('#error').innerHTML = message ? `<div class="error-box">${escapeHtml(message)}</div>` : '';
}

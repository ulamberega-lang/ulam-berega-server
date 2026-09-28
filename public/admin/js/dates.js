// תאריכים בפורמט YYYY-MM-DD לפי שעון ישראל.
import { hebrewDate } from './hebrew-date.js';
const ISRAEL = 'Asia/Jerusalem';

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL }).format(new Date());

export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  const list = [];
  for (let d = from; d <= to && list.length <= 400; d = addDays(d, 1)) list.push(d);
  return list;
}

export function preset(name) {
  const t = today();
  const monthStart = `${t.slice(0, 8)}01`;
  switch (name) {
    case 'today': return { from: t, to: t };
    case 'yesterday': return { from: addDays(t, -1), to: addDays(t, -1) };
    case 'week': return { from: addDays(t, -6), to: t };
    case 'month': return { from: addDays(t, -29), to: t };
    case 'thisMonth': return { from: monthStart, to: t };
    case 'lastMonth': {
      const lastMonthEnd = addDays(monthStart, -1);
      return { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd };
    }
  }
}

const dayFormat = new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' });
export const formatDay = (iso) => dayFormat.format(new Date(`${iso}T12:00:00Z`));
export const hebrewDay = (iso) => hebrewDate(`${iso}T12:00:00Z`, { withYear: false });
export const isWeekend = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 6; // שבת

const timeFormat = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ISRAEL });
export const formatDateTime = (timestamp) => timeFormat.format(new Date(timestamp));
export const hebrewOf = (timestamp) => hebrewDate(timestamp, { withYear: false });
export const hebrewRange = ({ from, to }) => {
  const a = hebrewDate(`${from}T12:00:00Z`), b = hebrewDate(`${to}T12:00:00Z`);
  return a === b ? a : `${a} עד ${b}`;
};

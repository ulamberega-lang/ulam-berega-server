// נתוני אולמות משותפים: שורה לכל אולם עם מספרי השיחות שלו בתקופה.
import { escapeHtml } from './dom.js';

export function buildRows(halls, statsRows) {
  const stats = new Map(statsRows.map((r) => [Number(r.hall_id), r]));
  return halls.map((h) => {
    const s = stats.get(Number(h.id));
    const total = Number(s?.total || 0), answered = Number(s?.answered || 0), unanswered = Number(s?.unanswered || 0);
    return {
      hall: h, id: h.id, name: h.name || '', city: h.city_name || '', hood: h.neighborhood_name || '',
      total, answered, unanswered, rate: total ? answered / total : null,
      guests: h.max_guests, ext: h.extension, active: h.is_active,
    };
  });
}

export const HALL_GETTERS = {
  name: (r) => r.name, city: (r) => r.city, hood: (r) => r.hood,
  total: (r) => r.total, answered: (r) => r.answered, unanswered: (r) => r.unanswered, rate: (r) => r.rate,
  guests: (r) => r.guests, ext: (r) => (r.ext ? Number(r.ext) : null),
};

export const HALL_SORTS = [
  { key: 'name', label: 'שם אולם', text: true },
  { key: 'city', label: 'עיר', text: true },
  { key: 'hood', label: 'שכונה', text: true },
  { key: 'total', label: 'סה"כ שיחות' },
  { key: 'answered', label: 'שיחות שנענו' },
  { key: 'unanswered', label: 'שיחות שלא נענו' },
  { key: 'rate', label: 'אחוז מענה' },
];

export const byName = (a, b) => a.name.localeCompare(b.name, 'he');

// כל מה שאפשר לחפש באולם
export const searchText = (r) => [r.name, r.city, r.hood, r.hall.address, r.ext, r.hall.gabbai_phone].join(' ');

export const hallLabel = (h) => `${h.name}, ${h.city_name}`;

export const location = (r) => [r.city, r.hood].filter(Boolean).map(escapeHtml).join(' · ');

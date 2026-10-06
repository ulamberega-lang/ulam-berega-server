// מצב כל שיחה פעילה (באיזה שלב המתקשר, מה בחר). נשמר בזיכרון השרת.
import { IVR } from '../config.js';

const sessions = new Map(); // מזהה שיחה → מצב

setInterval(() => {
  const cutoff = Date.now() - IVR.SESSION_TTL_MS;
  for (const [id, s] of sessions) if (s.t < cutoff) sessions.delete(id);
}, 10 * 60 * 1000).unref(); // unref: הטיימר לא מונע מהתהליך להיסגר (בבדיקות)

export const getSession = (id) => sessions.get(id);
export const deleteSession = (id) => sessions.delete(id);

// n = מספור שמות המשתנים בימות (v1, v2...); t = זמן הפעילות האחרונה
export function createSession(id) {
  const s = { id, n: 0, t: Date.now() };
  resetSession(s);
  sessions.set(id, s);
  return s;
}

// חזרה לתפריט הראשי
export function resetSession(s) {
  Object.assign(s, { step: 'menu', mode: null, page: 0, hoodPage: 0, cityPage: 0, listPage: 0, guests: null, city: null, hood: null, hall: null, noMatch: null, said: null, sizeMode: null, redoGuests: false });
}

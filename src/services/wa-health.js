// בדיקת תקינות החיבור ל-Meta: כל חצי שעה קריאה קלה עם הטוקן, ומייל התראה (דרך Brevo, אל MAIL_FROM) אם החיבור נחסם או פג.
// כך לא מגלים בעצמם שהבוט לא עונה (חסימת "API access blocked", טוקן שפג, חשבון לא מאושר).
import { config } from '../config.js';
import { GRAPH } from '../whatsapp/api.js';
import { escapeHtml, mailConfigured, sendMail } from '../lib/brevo.js';

const CHECK_MS = 30 * 60 * 1000;
const FIRST_MS = 2 * 60 * 1000;          // לא מיד בעלייה (פריסות תכופות)
const REALERT_MS = 6 * 60 * 60 * 1000;   // תקלה שנמשכת: תזכורת אחת ל-6 שעות
const FAILS_BEFORE_ALERT = 2;            // תקלת רשת חד-פעמית לא מעירה אף אחד

const state = { fails: 0, alertedAt: 0 };
export const resetHealth = () => { state.fails = 0; state.alertedAt = 0; };

// הסבר קצר ופעולה מומלצת לפי קוד השגיאה של Meta
function advice(error) {
  if (/API access blocked|\b200\b/i.test(error)) return 'Meta חוסמת את הגישה: ב-developers.facebook.com, באפליקציה, לחפש "נדרש אישור חשבון" ולאשר חשבון מפתחים.';
  if (/\b190\b|expired|Invalid OAuth/i.test(error)) return 'הטוקן (WA_ACCESS_TOKEN) פג או בוטל: ליצור טוקן קבוע של System User ולעדכן ב-Render.';
  if (/\b4\b|\b17\b|rate/i.test(error)) return 'הגבלת קצב של Meta: בדרך כלל חולפת לבד.';
  return 'לבדוק בלוג של Render את השורות שמתחילות ב-whatsapp: ובדף /admin/whatsapp.html.';
}

// קריאה אחת: מחזיר { ok, error }
async function ping() {
  try {
    const res = await fetch(`${GRAPH}/me?fields=id`, { headers: { authorization: `Bearer ${config.waToken}` }, signal: AbortSignal.timeout(10000) });
    if (res.ok) return { ok: true };
    return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function alertMail(subject, body) {
  if (!mailConfigured()) return console.error('wa-health: אי אפשר לשלוח התראה, BREVO_API_KEY או MAIL_FROM לא מוגדרים');
  const r = await sendMail({ to: config.mailFrom, subject, html: `<div dir="rtl" style="font-family:Arial">${body}</div>` });
  if (!r.ok) console.error('wa-health: שליחת ההתראה נכשלה:', r.error);
}

export async function runCheck(now = Date.now()) {
  if (!config.waToken) return;
  const { ok, error } = await ping();
  if (ok) {
    if (state.alertedAt) await alertMail('בוט הוואטסאפ חזר לפעול', '<p>החיבור ל-Meta תקין שוב.</p>');
    return resetHealth();
  }
  state.fails++;
  console.error(`wa-health: ${error}`);
  if (state.fails < FAILS_BEFORE_ALERT || now - state.alertedAt < REALERT_MS) return;
  state.alertedAt = now;
  await alertMail('התראה: בוט הוואטסאפ לא פעיל',
    `<p>בדיקת החיבור ל-Meta נכשלה.</p><p><b>${escapeHtml(error)}</b></p><p>${escapeHtml(advice(error))}</p>`);
}

export function startWaHealth() {
  if (!config.waToken) return console.log('wa-health: WA_ACCESS_TOKEN לא מוגדר, אין בדיקת תקינות');
  const tick = () => runCheck().catch((e) => console.error('wa-health:', e.message));
  setTimeout(() => { tick(); setInterval(tick, CHECK_MS).unref(); }, FIRST_MS).unref();
  console.log('wa-health: בדיקת חיבור ל-Meta כל 30 דקות');
}

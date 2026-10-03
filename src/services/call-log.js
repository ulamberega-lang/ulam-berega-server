// מעקב אחרי שיחה: התחלה, העברה לאולם, "אין מענה" וסיום - כולל המיילים לאולם.
import * as calls from '../repositories/calls.js';
import { notifyHall } from './mailer.js';

const logError = (where) => (e) => console.error(`${where}:`, e.message);

export function callStarted(callId, callerPhone) {
  if (!callId) return Promise.resolve();
  return calls.recordCallStart(callId, callerPhone).catch(logError('callStarted'));
}

export function callRouted(callId, callerPhone, hall, calledPhone) {
  return calls.recordRouting(callId, callerPhone, hall.id, calledPhone).catch(logError('callRouted'));
}

const notify = (row, answered) => {
  if (!row?.hall_id) return;
  notifyHall({ hallId: row.hall_id, callerPhone: row.caller_phone, startedAt: row.created_at, answered })
    .catch(logError('mail'));
};

// ---------- תוצאת החיוג לאולם (ימות שולחת מיד בסיום החיוג: routing_api_send) ----------
// DialStatus: ANSWER נענה | NOANSWER אין מענה | BUSY תפוס | CANCEL המתקשר ניתק לפני מענה | CONGESTION שגיאה

const toSeconds = (v) => {
  const s = String(v ?? '').trim();
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);                         // "00:01:23"
  return parts.length > 1 && parts.every(Number.isFinite) ? parts.reduce((acc, n) => acc * 60 + n, 0) : null;
};
const localPhone = (p) => String(p ?? '').replace(/\D/g, '').replace(/^972/, '0');

export async function routingFinished(q, lastValue) {
  const status = String(lastValue(q.DialStatus) ?? '').toUpperCase();
  if (!status) return console.error('routing-status: no DialStatus', JSON.stringify(q).slice(0, 300));

  // מזהים את השיחה לפי מזהה ימות, ואם לא נשלח - לפי מספר המתקשר
  let callId = (q.ApiCallId && await calls.findByCallId(q.ApiCallId)) ? q.ApiCallId : null;
  // בלי מספר מתקשר (חסוי) אי אפשר לזהות לפי מספר: היה תופס שיחה חסומה אחרת שפתוחה באותו זמן
  const phone = localPhone(lastValue(q.Phone) || q.ApiPhone);
  if (!callId && phone) callId = (await calls.findOpenRoutingByCaller(phone))?.yemot_call_id;
  if (!callId) return console.error('routing-status: call not found', JSON.stringify(q).slice(0, 300));

  await calls.updateByCallId(callId, { dial_status: status, answer_sec: toSeconds(lastValue(q.AnswerTime)) });
  if (status === 'ANSWER') notify(await calls.markAnswered(callId), true);
  else notify(await calls.markNotAnswered(callId), false);
}

// האולם לא ענה (השיחה עברה לשלוחה 9) → מייל מיידי על שיחה שלא נענתה
export async function callNotAnswered(callId) {
  notify(await calls.markNotAnswered(callId), false);
}

// ניתוק. תוצאת החיוג מגיעה מימות בנפרד (routingFinished). אם לא הגיעה - לא מנחשים "נענה":
// השיחה נשארת בלי תוצאה (ביומן "ללא תוצאת חיוג"), ואין מייל לאולם. אם התוצאה תגיע מאוחר, היא תעדכן ותשלח מייל כרגיל.
// בלוג נרשם אם עדיין אין תוצאה אחרי כמה שניות (בדרך כלל המתקשר ניתק באמצע החיוג, וימות לא דיווחה).
const RESULT_WAIT_MS = 8000;

export async function callEnded(callId) {
  if (!callId) return;
  const row = await calls.findByCallId(callId);
  if (!row || row.ended_at) return; // כבר נסגרה

  await calls.updateByCallId(callId, {
    ended_at: new Date().toISOString(),
    duration_sec: Math.round((Date.now() - new Date(row.created_at).getTime()) / 1000),
  });

  if (row.hall_id && row.answered === null && !row.dial_status) {
    setTimeout(() => checkResult(callId).catch(logError('check-result')), RESULT_WAIT_MS);
  }
}

async function checkResult(callId) {
  const row = await calls.findByCallId(callId);
  if (!row || row.dial_status || row.answered !== null) return; // התוצאה האמיתית כבר הגיעה
  console.error('routing-status: no result from Yemot for', callId);
}

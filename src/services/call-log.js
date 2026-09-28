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

// האולם לא ענה → מייל מיידי על שיחה שלא נענתה
export async function callNotAnswered(callId) {
  const row = await calls.markNotAnswered(callId);
  if (row?.hall_id) {
    notifyHall({ hallId: row.hall_id, callerPhone: row.caller_phone, startedAt: row.created_at, answered: false })
      .catch(logError('mail'));
  }
}

// ניתוק. אם השיחה הועברה ולא חזרה לשלוחת "אין מענה" - היא נענתה, ונשלח מייל
export async function callEnded(callId) {
  if (!callId) return;
  const row = await calls.findByCallId(callId);
  if (!row || row.ended_at) return; // כבר נסגרה - מונע מייל כפול

  const patch = {
    ended_at: new Date().toISOString(),
    duration_sec: Math.round((Date.now() - new Date(row.created_at).getTime()) / 1000),
  };
  const answered = row.hall_id && row.answered === null;
  if (answered) patch.answered = true;
  await calls.updateByCallId(callId, patch);

  if (answered) {
    await notifyHall({ hallId: row.hall_id, callerPhone: row.caller_phone, startedAt: row.created_at, answered: true })
      .catch(logError('mail'));
  }
}

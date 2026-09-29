// העברת המתקשר לאולם לפי מספר שלוחה.
import { IVR } from '../config.js';
import { routeCall } from '../lib/yemot.js';
import * as halls from '../services/hall-directory.js';
import { callRouted } from '../services/call-log.js';
import { withNikud, withPrefix } from '../services/nikud.js';
import { getSession } from './sessions.js';

// מחזיר תשובה לימות, או null אם אין אולם פעיל בשלוחה הזו.
// "מעביר לאולם X" ואחריו הכתובת; brief (שלוחות 2 ו-3) - בלי הכתובת
export async function routeToHall(q, extension, { brief = false } = {}) {
  const hall = await halls.findActiveByExtension(extension);
  if (!hall) return null;

  const session = getSession(q.ApiCallId);
  if (session) session.routed = true; // אם האולם לא יענה - נחזור לשלב הקודם

  const phone = (hall.gabbai_phone || '').replace(/\D/g, '');
  callRouted(q.ApiCallId, q.ApiPhone, hall, phone); // ברקע - לא מעכב את ההעברה

  return routeCall([
    `מַעֲבִיר ${withPrefix('ל', hall.name)}`,
    !brief && withNikud(hall.address), // מילה-מילה: "רחוב הרב קוק 5"
  ], phone, IVR.WAIT_SEC, IVR.NO_ANSWER_EXT);
}

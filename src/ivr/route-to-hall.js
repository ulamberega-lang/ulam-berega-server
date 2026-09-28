// העברת המתקשר לאולם לפי מספר שלוחה.
import { IVR } from '../config.js';
import { routeCall } from '../lib/yemot.js';
import * as halls from '../repositories/halls.js';
import { callRouted } from '../services/call-log.js';
import { withNikud } from '../services/nikud.js';
import { getSession } from './sessions.js';

// מחזיר תשובה לימות, או null אם אין אולם פעיל בשלוחה הזו
export async function routeToHall(q, extension) {
  const hall = await halls.findActiveByExtension(extension);
  if (!hall) return null;

  const session = getSession(q.ApiCallId);
  if (session) session.routed = true; // אם האולם לא יענה - נחזור לשלב הקודם

  const phone = (hall.gabbai_phone || '').replace(/\D/g, '');
  await callRouted(q.ApiCallId, q.ApiPhone, hall, phone);

  return routeCall([
    withNikud(hall.name),
    hall.neighborhood_name && `שְׁכוּנַת ${withNikud(hall.neighborhood_name)}`,
    withNikud(hall.address), // מילה-מילה: "רחוב הרב קוק 5"
    hall.max_guests && `עַד ${hall.max_guests} אוֹרְחִים`,
    `מִסְפַּר הַשְּׁלוּחָה שֶׁל הָאוּלָם ${hall.extension}`, // כדי שבפעם הבאה יוכלו להקיש ישירות
    'מַעֲבִיר לָאוּלָם',
  ], phone, IVR.WAIT_SEC, IVR.NO_ANSWER_EXT);
}

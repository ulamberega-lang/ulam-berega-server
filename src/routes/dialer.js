// חייגן יוצא (שלוחה 7 בימות): בעל הפרויקט מקיש מספר, והשרת מעביר אליו את השיחה כשהזיהוי אצל הנמען הוא מספר המערכת.
// רק מספרים שב-OWNER_PHONES. לא נרשם ב-leads_log ולא נשלחים מיילים - רק שורת לוג.
import { Router } from 'express';
import { config } from '../config.js';
import { isOwnerPhone, localDigits } from '../lib/owner-phones.js';
import { readParams, lastValue, say, tapOptions, routeCall } from '../lib/yemot.js';

export const dialerRouter = Router();

const DIAL_WAIT_SEC = 60;
// בסיום החיוג מתנתקים: בלי ערך עשירי ימות מחזירה את המחייג שלב אחד אחורה (וזה היה שואל מספר שוב)
const VALID_NUMBER = /^0\d{8,9}$/;

// כל שאלה מקבלת שם משתנה חדש (v1, v2...): ימות שולחת בכל פנייה את כל הערכים שנאספו
const ask = (n, note) => `read=${say([note, 'הַקֵּשׁ אֶת הַמִּסְפָּר וּבְסִיּוּם סוּלָמִית'])}=v${n},no,${tapOptions(10, 10)}`;

dialerRouter.all('/', (req, res) => {
  const q = readParams(req);
  res.type('text/plain; charset=utf-8');
  if (q.hangup === 'yes') return res.send('');
  if (!isOwnerPhone(q.ApiPhone)) return res.send('go_to_folder=hangup'); // בלי להשמיע כלום

  const used = Object.keys(q).map((k) => /^v(\d+)$/.exec(k)?.[1]).filter(Boolean).map(Number);
  if (!used.length) return res.send(ask(1));

  const n = Math.max(...used);
  const number = String(lastValue(q[`v${n}`]) ?? '').replace(/\D/g, '');
  if (!VALID_NUMBER.test(number)) return res.send(ask(n + 1, 'מִסְפָּר לֹא תָּקִין'));

  console.log(`dialer: ${localDigits(q.ApiPhone)} → ${number}`);
  return res.send(routeCall(['מְחַיֵּג'], number, DIAL_WAIT_SEC, 'hangup', config.dialerCallerId));
});

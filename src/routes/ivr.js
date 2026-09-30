// נתיבים שימות המשיח פונה אליהם:
//   /api/ivr            - השלוחה הראשית (כל שלבי השיחה)
//   /api/ivr/no-answer  - שלוחה 9, כשהאולם לא ענה
//   /api/ivr/owner      - שלוחת "בעל אולם" (אופציונלית, הקראה איטית)
//   /api/ivr/routing-status - תוצאת החיוג לאולם (נענה / לא נענה / תפוס / המתקשר ניתק)
import { Router } from 'express';
import { readParams, lastValue, clean, hangup, goToFolder } from '../lib/yemot.js';
import { getSession, createSession, deleteSession, resetSession } from '../ivr/sessions.js';
import { prompt, handleAnswer, isSpeechStep, transcribeAnswer, fallbackToList } from '../ivr/flow.js';
import { routeToHall } from '../ivr/route-to-hall.js';
import { ownerReply, ownerRestart } from '../ivr/owner-info.js';
import { callStarted, callEnded, callNotAnswered, routingFinished } from '../services/call-log.js';

export const ivrRouter = Router();

// מדידה: כל תשובה שלקחה לשרת יותר משנייה נרשמת בלוג, עם השלב בשיחה
ivrRouter.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - started;
    if (ms > 1000) console.log(`slow: ${req.path} step=${res.locals.step ?? '-'} ${ms}ms`);
  });
  next();
});

ivrRouter.all('/', async (req, res) => {
  const q = readParams(req);
  const id = q.ApiCallId;
  res.type('text/plain; charset=utf-8');
  try {
    if (q.hangup === 'yes') {
      deleteSession(id);
      await callEnded(id);
      return res.send('');
    }

    if (!id) return res.status(400).send('');

    let s = getSession(id);
    if (!s) return res.send(await startCall(q));

    // חזרה מ"אין מענה": מי שבחר מהרשימה חוזר לרשימה, מי שהקיש שלוחה - לתפריט הראשי
    if (s.back) {
      s.back = false;
      s.routed = false;
      if (s.step !== 'results') resetSession(s);
      return res.send(await prompt(s));
    }

    res.locals.step = s.step;
    let raw = String(lastValue(q[`v${s.n}`]) ?? '');
    if (isSpeechStep(s) && !raw.includes('*')) {
      raw = await transcribeAnswer(s); // בשלבי דיבור ימות רק מקליטה - מתמללים בעצמנו
      if (raw === null) return res.send(await fallbackToList(s));
    }
    return res.send(await handleAnswer(s, q, clean(raw), raw));
  } catch (err) {
    console.error('ivr:', err);
    return res.send(hangup('תַּקָּלָה בַּמַּעֲרֶכֶת נַסֵּה שׁוּב מְאוּחָר יוֹתֵר'));
  }
});

async function startCall(q) {
  callStarted(q.ApiCallId, q.ApiPhone); // ברקע - לא מעכב את הפתיח

  // כניסה ישירה משלוחת אולם בימות (api_add_0=ext=101)
  const ext = lastValue(q.ext);
  if (ext) return (await routeToHall(q, ext, { brief: true })) ?? hangup('שְׁלוּחָה לֹא קַיֶּימֶת');

  const s = createSession(q.ApiCallId);
  // השרת אותחל באמצע שיחה - ממשיכים ממספור המשתנים הקיים ומודיעים על חזרה לתפריט
  const used = Object.keys(q).map((k) => /^v(\d+)$/.exec(k)?.[1]).filter(Boolean).map(Number);
  if (used.length) {
    s.n = Math.max(...used);
    s.note = 'נַחֲזוֹר לַתַּפְרִיט הָרָאשִׁי';
  }
  return prompt(s);
}

ivrRouter.all('/no-answer', async (req, res) => {
  const q = readParams(req);
  const id = q.ApiCallId;
  res.type('text/plain; charset=utf-8');
  try {
    if (q.hangup === 'yes') {
      deleteSession(id);
      await callEnded(id);
      return res.send('');
    }
    await callNotAnswered(id);

    const s = getSession(id);
    if (s?.routed) {
      s.back = true;
      return res.send(goToFolder('/', 'אֵין מַעֲנֶה בָּאוּלָם'));
    }
    return res.send(hangup('אֵין מַעֲנֶה בָּאוּלָם נַסֵּה שׁוּב מְאוּחָר יוֹתֵר'));
  } catch (err) {
    console.error('no-answer:', err);
    return res.send(hangup('אֵין מַעֲנֶה בָּאוּלָם'));
  }
});

// שלוחת "בעל אולם" (OWNER_EXT, למשל 7): הקראה איטית יותר של ההסבר איך מוסיפים אולם, ואז חזרה לתפריט הראשי
ivrRouter.all('/owner', async (req, res) => {
  const q = readParams(req);
  const id = q.ApiCallId;
  res.type('text/plain; charset=utf-8');
  try {
    if (q.hangup === 'yes') {
      deleteSession(id);
      await callEnded(id);
      return res.send('');
    }
    const s = getSession(id);
    return res.send(s ? ownerReply(s, q) : ownerRestart());
  } catch (err) {
    console.error('owner:', err);
    return res.send(hangup('תַּקָּלָה בַּמַּעֲרֶכֶת נַסֵּה שׁוּב מְאוּחָר יוֹתֵר'));
  }
});

// תוצאת החיוג לאולם - ימות שולחת לכאן בסיום כל חיוג (routing_api_send בשלוחה הראשית)
ivrRouter.all('/routing-status', async (req, res) => {
  const q = readParams(req);
  res.type('text/plain; charset=utf-8').send('ok');
  routingFinished(q, lastValue).catch((e) => console.error('routing-status:', e.message));
});

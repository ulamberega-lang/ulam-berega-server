// נתיבים שימות המשיח פונה אליהם:
//   /api/ivr            - השלוחה הראשית (כל שלבי השיחה)
//   /api/ivr/no-answer  - שלוחה 9, כשהאולם לא ענה
import { Router } from 'express';
import { readParams, lastValue, clean, hangup, goToFolder } from '../lib/yemot.js';
import { getSession, createSession, deleteSession, resetSession } from '../ivr/sessions.js';
import { prompt, handleAnswer, isSpeechStep, transcribeAnswer, fallbackToList } from '../ivr/flow.js';
import { routeToHall } from '../ivr/route-to-hall.js';
import { callStarted, callEnded, callNotAnswered } from '../services/call-log.js';

export const ivrRouter = Router();

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

    let s = getSession(id);
    if (!s) return res.send(await startCall(q));

    // חזרה מ"אין מענה": מי שבחר מהרשימה חוזר לרשימה, מי שהקיש שלוחה - לתפריט הראשי
    if (s.back) {
      s.back = false;
      s.routed = false;
      if (s.step !== 'results') resetSession(s);
      return res.send(await prompt(s));
    }

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
  await callStarted(q.ApiCallId, q.ApiPhone);

  // כניסה ישירה משלוחת אולם בימות (api_add_0=ext=101)
  const ext = lastValue(q.ext);
  if (ext) return (await routeToHall(q, ext)) ?? hangup('שְׁלוּחָה לֹא קַיֶּימֶת');

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

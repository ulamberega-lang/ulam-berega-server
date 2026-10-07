// זרימת השיחה: מה שואלים בכל שלב (prompt) ואיך מטפלים בתשובה (handleAnswer).
//
// שלבים:
//   1 חיפוש לפי כמות ומיקום:  guests → guestsOk → city → cityOk → hood → (hoodSay → hoodOk | hoodMenu) → results
//   2 מספר שלוחה:             extEntry
//   3 חיפוש לפי שם:            city → cityOk → hallSay → hallOk | hallMenu
//   cityMenu / hoodMenu / hallMenu - בחירה מרשימה (גם כשהתמלול נכשל)
//   noFit - אין אולם בגודל מתאים אבל יש גדולים ו/או קטנים יותר: לשמוע אותם או לשנות כמות
//   noMatch - נאמר שם שלא נמצא: לנסות שוב (1) או לבחור מרשימה (2)
//   4 בעל אולם:               ownerInfo (הסבר איך מוסיפים אולם, בלי חיפוש)
//   5 הודעה קולית:            voicemail (הקלטה שנשלחת במייל)
import { IVR } from '../config.js';
import { say, tapOptions, recordOptions } from '../lib/yemot.js';
import { saveVoicemail } from '../services/voicemail.js';
import { bestMatch, dropGeneric, normalize, parseNumber } from '../lib/text-match.js';
import * as halls from '../services/hall-directory.js';
import { withNikud, withPrefix, synagogueSuffix } from '../services/nikud.js';
import { splitHoods, splitNames, nameFor } from '../lib/hoods.js';
import { transcribeRecording } from '../services/transcriber.js';
import { resetSession, deleteSession } from './sessions.js';
import { callDiscarded } from '../services/call-log.js';
import { isOwnerPhone } from '../lib/owner-phones.js';
import { OWNER_PARTS, OWNER_OPTIONS } from './owner-info.js';
import { routeToHall } from './route-to-hall.js';

const { NO_HOOD } = halls; // "אולמות נוספים בעיר": אולמות בלי שכונה
const CONFIRM = ['לְאִישּׁוּר הַקֵּשׁ 1', 'לְתִיקּוּן הַקֵּשׁ 2'];
const STAR_HINT = 'בְּכָל שָׁלָב אֶפְשָׁר לַחֲזוֹר לַתַּפְרִיט הָרָאשִׁי בְּהַקָּשַׁת כּוֹכָבִית';

// מילים שמתקשרים מוסיפים או משמיטים ("אולם בית ישראל" / "בית ישראל", "בשכונת רמות" / "רמות")
export const HALL_WORDS = ['אולם', 'אולמי', 'האולם', 'באולם'];
export const CITY_WORDS = ['עיר', 'העיר', 'בעיר'];
export const HOOD_WORDS = ['שכונת', 'שכונה', 'השכונה', 'בשכונת', 'בשכונה'];

// התאמה של מה שנאמר לרשימת שמות. התאמה לא מדויקת נרשמת בלוג (מה נאמר ומה נבחר), כדי לזהות טעויות זיהוי
function matchName(step, said, options, generic) {
  const found = bestMatch(said, options, { generic });
  if (found && normalize(found) !== normalize(said)) console.log(`heard: ${step} "${said}" → "${found}"`);
  return found;
}

// ---------- שאלה למתקשר ----------

// כל שאלה מקבלת שם משתנה חדש (v1, v2...) כי ימות שולחת בכל פנייה את כל מה שנאסף
function ask(s, parts, options) {
  s.n++;
  s.t = Date.now();
  const text = say([s.note, ...parts]);
  s.note = null;
  return `read=${text}=v${s.n},no,${options}`;
}

// ---------- הקלטות (שלבי דיבור) ----------

const recordingFile = (s, n) => `${s.id.slice(-8)}_${n}`;
// הודעה קולית: קובץ נפרד שלא נמחק (ההקלטות של שלבי הדיבור נמחקות אחרי התמלול)
export const voicemailFile = (s, n) => `vm_${recordingFile(s, n)}`;
export const voicemailPath = (s) => `ivr2:${IVR.REC_DIR}/${voicemailFile(s, s.n)}.wav`;
const recordAnswer = (s) => recordOptions(IVR.REC_DIR, recordingFile(s, s.n + 1), IVR.REC_MAX_SEC); // ask() מקדם את n

const SPEECH_STEPS = {
  city: { kind: 'עיר', hints: () => halls.getActiveCities(), list: 'cityMenu' },
  hoodSay: { kind: 'שכונה', hints: (s) => s.allHoods, list: 'hoodMenu' },
  hallSay: { kind: 'אולם אירועים', hints: (s) => uniqueNames(s.cityHalls), list: 'hallMenu' },
};

export const isSpeechStep = (s) => s.step in SPEECH_STEPS;

// מחזיר את מה שנאמר, או null אם התמלול נכשל
export async function transcribeAnswer(s) {
  const step = SPEECH_STEPS[s.step];
  // הרמזים נטענים במקביל להורדה; catch ריק מונע קריסה אם הם נכשלים לפני שממתינים להם
  const hints = Promise.resolve().then(() => step.hints(s));
  hints.catch(() => {});
  return transcribeRecording({
    path: `ivr2:${IVR.REC_DIR}/${recordingFile(s, s.n)}.wav`,
    hints,
    kind: step.kind,
  }).catch((e) => { console.error('transcribe:', e.message); return null; });
}

// התמלול נכשל (למשל נגמרה היתרה ב-OpenAI) - בחירה מרשימה בהקשה
export function fallbackToList(s) {
  s.note = 'בְּחַר מֵהָרְשִׁימָה';
  s.listPage = 0;
  s.cityPage = 0;
  s.hoodPage = 0;
  s.said = null;
  if (s.step === 'hallSay') s.hallChoices = s.cityHalls;
  s.step = SPEECH_STEPS[s.step].list;
  return prompt(s);
}

// אחרי שנמצא שם: אולם אחד → אישור; כמה באותו שם → בחירה ביניהם; אף אחד → כל אולמות העיר
function chooseHall(s, name, pool, spoken) {
  const matches = name ? pool.filter((h) => hasName(h, name)) : [];
  s.said = matches.length ? name : null; // השם שנאמר, להקראה באישור וב"מעביר"
  if (matches.length === 1) { s.hall = matches[0]; s.step = 'hallOk'; return prompt(s); }
  if (!matches.length && spoken.trim()) {
    return notFound(s, 'hallSay', `לֹא נִמְצָא אוּלָם בְּשֵׁם ${spoken}${s.city ? ` ${withPrefix('ב', s.city)}` : ''}`);
  }
  s.listPage = 0;
  s.hallChoices = matches.length ? matches : pool;
  s.step = 'hallMenu';
  return prompt(s);
}

// נאמר שם שלא נמצא: שואלים אם לנסות שוב או לבחור מרשימה (step = שלב הדיבור שממנו באנו)
function notFound(s, step, note) {
  s.note = note;
  s.noMatch = step;
  s.step = 'noMatch';
  return prompt(s);
}

// אחרי בחירת עיר: חיפוש לפי שם → שאלת שם האולם; אחרת → שכונה
const afterCity = (s) => (s.mode === 'name' ? 'hallSay' : 'hood');

// כל מה שאפשר לומר בחיפוש לפי שם: שם האולם, ושם בית הכנסת שלו
const uniqueNames = (list) => [...new Set(list.flatMap((h) => [...splitNames(h.name), h.synagogue_name]).filter(Boolean))];
const hasName = (h, name) => splitNames(h.name).includes(name) || h.synagogue_name === name;

// "בשכונת X". אולם בכמה שכונות: אם חיפשו שכונה שהוא רשום בה - רק היא, אחרת כולן ("בשכונות X ו-Y")
export function hoodPhrase(hall, searched) {
  const all = splitHoods(hall.neighborhood_name);
  const list = searched && all.includes(searched) ? [searched] : all;
  if (list.length < 2) return `בִּשְׁכוּנַת ${withNikud(list[0] ?? '')}`;
  return `בִּשְׁכוּנוֹת ${withNikud(list[0])}${list.slice(1).map((n) => ` ${withPrefix('ו', n)}`).join('')}`;
}

// שם אולם להקראה. העיר - באישור, או כשברשימה יש כמה ערים; השכונה - כשיש בעיר שני אולמות באותו שם
// אולם עם אותו שם באותה עיר: מבדילים לפי שכונה, ואם גם השכונה זהה (או חסרה) - לפי הכתובת
// said: השם שהמתקשר אמר בחיפוש לפי שם (אולם עם כמה שמות מוקרא בשם שחיפש)
function hallLabel(hall, list, withCity = new Set(list.map((h) => h.city_name)).size > 1, prefix = '', said = null) {
  const twins = list.filter((h) => h !== hall && h.name === hall.name && h.city_name === hall.city_name
    && (h.synagogue_name ?? '') === (hall.synagogue_name ?? ''));
  const sameHood = twins.some((h) => (h.neighborhood_name ?? '') === (hall.neighborhood_name ?? ''));
  return (prefix ? withPrefix(prefix, nameFor(hall.name, said)) : withNikud(nameFor(hall.name, said))) + synagogueSuffix(hall)
    + (withCity ? ` ${withPrefix('ב', hall.city_name)}` : '')
    + (twins.length && hall.neighborhood_name ? ` ${hoodPhrase(hall)}` : '')
    + (sameHood && hall.address ? ` ${withNikud(hall.address)}` : '');
}

// ---------- מה שואלים בכל שלב ----------

export async function prompt(s) {
  // "אולמות גדולים/קטנים יותר" תקף רק לחיפוש הנוכחי: שינוי כמות, עיר או שכונה מאפס אותו
  if (['guests', 'city', 'hood', 'hoodSay', 'hoodMenu'].includes(s.step)) s.sizeMode = null;
  switch (s.step) {
    case 'menu':
      return ask(s, ['בְּרוּכִים הַבָּאִים לְשִׂמְחָה בְּשִׂיחָה', 'לְחִיפּוּשׂ אוּלָם הַקֵּשׁ 1',
        'אִם יָדוּעַ לְךָ מִסְפַּר הַשְּׁלוּחָה שֶׁל הָאוּלָם הַקֵּשׁ 2',
        'לְחִיפּוּשׂ לְפִי שֵׁם הָאוּלָם הַקֵּשׁ 3',
        'לְהוֹסָפַת אוּלָם לַמַּעֲרֶכֶת הַקֵּשׁ 4', 'לְהַשְׁאָרַת הוֹדָעָה הַקֵּשׁ 5'], tapOptions(1));


    case 'voicemail':
      return ask(s, ['הַשְׁאֵר הוֹדָעָה אַחֲרֵי הַצְּלִיל. אֱמוֹר אֶת שִׁמְךָ וְאֶת סִבַּת הַפְּנִיָּה, וּבְסִיּוּם הַקֵּשׁ סוּלָמִית'],
        recordOptions(IVR.REC_DIR, voicemailFile(s, s.n + 1), IVR.VOICEMAIL_MAX_SEC, true));

    case 'ownerInfo':
      return ask(s, [...OWNER_PARTS, ...OWNER_OPTIONS], tapOptions(1));

    case 'extEntry':
      return ask(s, ['הַקֵּשׁ אֶת מִסְפַּר הַשְּׁלוּחָה שֶׁל הָאוּלָם וּבְסִיּוּם סוּלָמִית'], tapOptions(4, 7));

    case 'guests': {
      const hint = !s.hinted && STAR_HINT; // פעם אחת בשיחה, לפני השאלה הראשונה בחיפוש
      s.hinted = true;
      return ask(s, [hint, 'הַקֵּשׁ אֶת כַּמּוּת הַמּוּזְמָנִים הַמְּשׁוֹעֶרֶת וּבְסִיּוּם סוּלָמִית'], tapOptions(4, 7));
    }
    case 'guestsOk':
      return ask(s, [`הֵבַנְתִּי ${s.guests} מוּזְמָנִים`, ...CONFIRM], tapOptions(1));

    case 'city':
      return ask(s, ['אֱמוֹר אֶת שֵׁם הָעִיר אַחֲרֵי הַצְּלִיל וּבְסִיּוּם הַקֵּשׁ סוּלָמִית'], recordAnswer(s));
    case 'cityOk':
      return ask(s, [`הֵבַנְתִּי ${withNikud(s.city)}`, ...CONFIRM], tapOptions(1));
    case 'cityMenu': {
      s.cities = await halls.getActiveCities();
      const from = s.cityPage * IVR.MENU_PAGE;
      s.cityMore = s.cities.length > from + IVR.MENU_PAGE;
      return ask(s, ['בְּאֵיזוֹ עִיר',
        ...s.cities.slice(from, from + IVR.MENU_PAGE).map((c, i) => `${withPrefix('ל', c)} הַקֵּשׁ ${i + 1}`),
        s.cityMore && 'לְעָרִים נוֹסָפוֹת הַקֵּשׁ 9'], tapOptions(1));
    }

    case 'noMatch':
      return ask(s, ['לְנִסָּיוֹן נוֹסָף הַקֵּשׁ 1', 'לִרְשִׁימָה הַקֵּשׁ 2'], tapOptions(1));

    case 'hallSay':
      s.cityHalls = await halls.getActiveHallsInCity(s.city);
      return ask(s, ['אֱמוֹר אֶת שֵׁם הָאוּלָם אַחֲרֵי הַצְּלִיל וּבְסִיּוּם הַקֵּשׁ סוּלָמִית'], recordAnswer(s));
    case 'hallOk':
      return ask(s, [`הֵבַנְתִּי ${hallLabel(s.hall, s.cityHalls, true, '', s.said)}`, 'לְמַעֲבָר לָאוּלָם הַקֵּשׁ 1', 'לְתִיקּוּן הַקֵּשׁ 2'], tapOptions(1));
    case 'hallMenu': {
      const list = s.hallChoices;
      const from = s.listPage * IVR.MENU_PAGE;
      s.listMore = list.length > from + IVR.MENU_PAGE;
      return ask(s, ['לְאֵיזֶה אוּלָם',
        ...list.slice(from, from + IVR.MENU_PAGE).map((h, i) => `${hallLabel(h, list, undefined, 'ל', s.said)} הַקֵּשׁ ${i + 1}`),
        s.listMore && 'לְאוּלַמּוֹת נוֹסָפִים הַקֵּשׁ 9',
        'לַאֲמִירַת הַשֵּׁם שׁוּב הַקֵּשׁ 0'], tapOptions(1));
    }

    case 'hood':
      s.allHoods = await halls.getActiveNeighborhoods(s.city); // לזיהוי קולי: כל שכונה שקיימת בעיר
      // אין בעיר אולם בגודל מתאים: לא שואלים על שכונה, ישר להצעה לאולמות גדולים/קטנים יותר
      if (!(await halls.searchHalls({ city: s.city, guests: s.guests })).length) { s.step = 'noFit'; return prompt(s); }
      s.hoods = await halls.getActiveNeighborhoods(s.city, s.guests); // ברשימה: רק שכונות עם אולם מתאים
      if (!s.hoods.length) { s.step = 'results'; s.page = 0; return prompt(s); }
      return ask(s, ['לַאֲמִירַת שֵׁם הַשְּׁכוּנָה הַקֵּשׁ 1', 'לִבְחִירַת שְׁכוּנָה מֵרְשִׁימָה הַקֵּשׁ 2',
        'לְחִיפּוּשׂ בְּכָל הָעִיר הַקֵּשׁ 0'], tapOptions(1));
    case 'hoodSay':
      return ask(s, ['אֱמוֹר אֶת שֵׁם הַשְּׁכוּנָה אַחֲרֵי הַצְּלִיל וּבְסִיּוּם הַקֵּשׁ סוּלָמִית'], recordAnswer(s));
    case 'hoodOk':
      return ask(s, [`הֵבַנְתִּי שְׁכוּנַת ${withNikud(s.hood)}`, ...CONFIRM], tapOptions(1));
    case 'hoodMenu': {
      const from = s.hoodPage * IVR.MENU_PAGE;
      const onPage = s.hoods.slice(from, from + IVR.MENU_PAGE);
      s.hoodMore = s.hoods.length > from + IVR.MENU_PAGE;
      // בסוף הרשימה (בעמוד האחרון): אולמות בעיר שלא רשומה להם שכונה. המספר שלהם הבא אחרי השכונה האחרונה (עד 9, כי אין "עוד")
      s.hoodExtra = !s.hoodMore && await halls.hasNoHoodHalls(s.city, s.guests);
      return ask(s, ['בְּאֵיזוֹ שְׁכוּנָה',
        ...onPage.map((h, i) => `${withPrefix('ל', h)} הַקֵּשׁ ${i + 1}`),
        s.hoodMore && 'לִשְׁכוּנוֹת נוֹסָפוֹת הַקֵּשׁ 9',
        s.hoodExtra && `לְאוּלַמּוֹת נוֹסָפִים בָּעִיר הַקֵּשׁ ${onPage.length + 1}`,
        'לְכָל הָעִיר הַקֵּשׁ 0'], tapOptions(1));
    }

    case 'noResults':
      return ask(s, [`לֹא נִמְצְאוּ אוּלַמּוֹת ${withPrefix('ב', s.city)} עֲבוּר ${s.guests} מוּזְמָנִים`,
        'לְשִׁינּוּי כַּמּוּת הַמּוּזְמָנִים הַקֵּשׁ 1', 'לְשִׁינּוּי הָעִיר הַקֵּשׁ 2',
        'לַתַּפְרִיט הָרָאשִׁי הַקֵּשׁ כּוֹכָבִית'], tapOptions(1));

    case 'noFit': {
      const choices = await noFitChoices(s);
      const text = { larger: 'לִשְׁמִיעַת אוּלַמּוֹת גְּדוֹלִים יוֹתֵר', smaller: 'לִשְׁמִיעַת אוּלַמּוֹת קְטַנִּים יוֹתֵר', guests: 'לְשִׁינּוּי כַּמּוּת הַמּוּזְמָנִים' };
      return ask(s, [`לֹא נִמְצְאוּ אוּלַמּוֹת ${s.hood && s.hood !== NO_HOOD ? `בִּשְׁכוּנַת ${withNikud(s.hood)}` : withPrefix('ב', s.city)} הַמַּתְאִימִים עֲבוּר ${s.guests} מוּזְמָנִים`,
        ...choices.map((c, i) => `${text[c]} הַקֵּשׁ ${i + 1}`),
        'לַתַּפְרִיט הָרָאשִׁי הַקֵּשׁ כּוֹכָבִית'], tapOptions(1));
    }

    case 'results':
      return promptResults(s);
  }
}

// מה אפשר להציע כשאין אולם בטווח: גדולים יותר ו/או קטנים יותר (רק מה שקיים), ושינוי כמות
async function noFitChoices(s) {
  const where = { city: s.city, neighborhood: s.hood, guests: s.guests };
  const choices = [];
  if ((await halls.searchHalls({ ...where, size: 'larger' })).length) choices.push('larger');
  if ((await halls.searchHalls({ ...where, size: 'smaller' })).length) choices.push('smaller');
  return [...choices, 'guests'];
}

// מציעים "אולמות נוספים בעיר" כשחיפשו שכונה מסוימת (בלי גודל מיוחד) ויש בעיר אולם בלי שכונה בגודל מתאים
const offerNoHood = async (s) => Boolean(s.hood) && s.hood !== NO_HOOD && !s.sizeMode && halls.hasNoHoodHalls(s.city, s.guests);

async function promptResults(s) {
  const found = await halls.searchHalls({ city: s.city, neighborhood: s.hood, guests: s.guests, size: s.sizeMode });
  if (!found.length) {
    // אין אולם בגודל מתאים, אבל יש גדולים או קטנים יותר: שואלים אם לשמוע אותם
    if ((await noFitChoices(s)).length > 1) {
      s.step = 'noFit';
      return prompt(s);
    }
    if (s.hood) {
      s.note = s.hood === NO_HOOD ? 'לֹא נִמְצְאוּ אוּלַמּוֹת מַתְאִימִים בָּעִיר' : `לֹא נִמְצְאוּ אוּלַמּוֹת מַתְאִימִים בִּשְׁכוּנַת ${withNikud(s.hood)}`;
      s.hood = null;
      s.step = 'hood';
      return prompt(s);
    }
    s.step = 'noResults';
    return prompt(s);
  }

  const from = s.page * IVR.RESULTS_PAGE;
  const page = found.slice(from, from + IVR.RESULTS_PAGE);
  s.more = found.length > from + IVR.RESULTS_PAGE;

  const parts = [];
  if (s.page === 0) parts.push(found.length === 1 ? 'נִמְצָא אוּלָם אֶחָד' : `נִמְצְאוּ ${found.length} אוּלַמּוֹת`);
  // מקישים את מספר השלוחה עצמו (למשל 101) - כדי שהמתקשר יזכור אותו לפעם הבאה
  for (const h of page) {
    parts.push(withNikud(nameFor(h.name)) + synagogueSuffix(h), h.neighborhood_name && hoodPhrase(h, s.hood),
      `עַד ${h.max_guests} אוֹרְחִים`, `לְמַעֲבָר לָאוּלָם הַקֵּשׁ ${h.extension} וְסוּלָמִית`);
  }
  if (s.more) parts.push('לְאוּלַמּוֹת נוֹסָפִים הַקֵּשׁ 9 וְסוּלָמִית');
  // בסוף: אולמות בגודל קרוב (מחוץ לטווח), אם יש
  if (!s.sizeMode && (await halls.searchHalls({ city: s.city, neighborhood: s.hood, guests: s.guests, size: 'near' })).length) {
    parts.push('לְאוּלַמּוֹת בְּגֹדֶל קָרוֹב הַקֵּשׁ 7 וְסוּלָמִית');
  }
  // בחיפוש שכונה מסוימת: דרך לאולמות בעיר שלא רשומה להם שכונה (הם לא מופיעים בחיפוש שכונה)
  if (await offerNoHood(s)) parts.push('לְאוּלַמּוֹת נוֹסָפִים בָּעִיר הַקֵּשׁ 6 וְסוּלָמִית');
  if (s.hood) parts.push('לְחִיפּוּשׂ בִּשְׁכוּנָה נוֹסֶפֶת הַקֵּשׁ 0 וְסוּלָמִית');
  parts.push('לִשְׁמִיעָה חוֹזֶרֶת הַקֵּשׁ 8 וְסוּלָמִית');
  return ask(s, parts, tapOptions(4, 7)); // סולמית מסיימת מיד; בלעדיה - המתנה עד 7 שניות
}

// ---------- טיפול בתשובה ----------

// val = התשובה אחרי ניקוי; raw = כפי שהתקבלה
export async function handleAnswer(s, q, val, raw) {
  const go = (step) => { s.step = step; return prompt(s); };
  const retry = (note) => { s.note = note; return prompt(s); }; // בלי הגבלת ניסיונות
  const confirm = (okStep, fixStep) => (val === '1' ? go(okStep) : val === '2' ? go(fixStep) : retry('לֹא הֵבַנְתִּי'));
  const invalid = () => retry('בְּחִירָה לֹא תְּקִינָה');
  const pickFromPage = (list, page) => {
    const n = Number(val);
    return n >= 1 && n <= IVR.MENU_PAGE ? list[page * IVR.MENU_PAGE + n - 1] : null;
  };

  // כוכבית בכל שלב = חזרה לתפריט הראשי
  if (val.includes('*')) { resetSession(s); return prompt(s); }
  if (!val) return retry('לֹא נִשְׁמְעָה תְּשׁוּבָה');

  switch (s.step) {
    case 'menu':
      if (val === '1') { s.mode = 'filters'; return go('guests'); }
      if (val === '2') return go('extEntry');
      if (val === '3') { s.mode = 'name'; return go('city'); }
      if (val === '4') return go('ownerInfo');
      if (val === '5') return go('voicemail');
      // כניסה סמויה לחייגן היוצא (שלוחה 7): רק מספרי בעל הפרויקט; לכל השאר 7 היא בחירה לא תקינה
      if (val === '7' && isOwnerPhone(q.ApiPhone)) { deleteSession(s.id); await callDiscarded(s.id); return 'go_to_folder=/7'; }
      return invalid();
    case 'voicemail':
      // ההקלטה נשלחת במייל ברקע (לא מעכבת את השיחה), וחוזרים לתפריט הראשי
      saveVoicemail({ path: voicemailPath(s), callerPhone: q.ApiPhone }).catch((e) => console.error('voicemail:', e.message));
      resetSession(s);
      s.note = 'הַהוֹדָעָה נִשְׁמְרָה. תּוֹדָה, נַחֲזֹר אֵלֶיךָ בְּהֶקְדֵּם';
      return prompt(s);
    case 'ownerInfo':
      if (val === '1') return go('ownerInfo');
      if (val === '2') { resetSession(s); return prompt(s); }
      return invalid();
    case 'extEntry':
      return (await routeToHall(q, val, { brief: true })) ?? retry(`שְׁלוּחָה ${val} לֹא קַיֶּימֶת`);

    case 'guests': {
      const n = parseNumber(raw);
      if (!(n >= 1 && n <= 5000)) return retry('לֹא הֵבַנְתִּי אֶת הַמִּסְפָּר');
      s.guests = n;
      return go('guestsOk');
    }
    case 'guestsOk':
      // שינוי כמות אחרי "לא נמצא": ממשיכים באותה עיר ושכונה, בלי לשאול אותן שוב
      if (s.redoGuests && val === '1') { s.redoGuests = false; s.page = 0; return go('results'); }
      return confirm('city', 'guests');

    case 'city': {
      const city = matchName('city', val, await halls.getActiveCities(), CITY_WORDS);
      if (!city) return notFound(s, 'city', `לֹא נִמְצְאוּ אוּלַמּוֹת בְּ${dropGeneric(val, CITY_WORDS)}`);
      s.city = city;
      return go('cityOk');
    }
    case 'noMatch':
      if (val === '1') return go(s.noMatch);
      if (val === '2') { s.step = s.noMatch; return fallbackToList(s); }
      return invalid();

    case 'cityOk':
      return confirm(afterCity(s), 'city');
    case 'cityMenu': {
      if (val === '9' && s.cityMore) { s.cityPage++; return go('cityMenu'); }
      const city = pickFromPage(s.cities, s.cityPage);
      if (!city) return invalid();
      s.city = city;
      return go(afterCity(s));
    }

    case 'hallSay': {
      return chooseHall(s, matchName('hallSay', val, uniqueNames(s.cityHalls), HALL_WORDS), s.cityHalls, dropGeneric(val, HALL_WORDS)); // בהודעת "לא נמצא" בלי "אולם" כפול
    }
    case 'hallOk':
      if (val === '1') return (await routeToHall(q, s.hall.extension, { brief: true, said: s.said })) ?? invalid();
      if (val === '2') return go('hallSay');
      return retry('לֹא הֵבַנְתִּי');
    case 'hallMenu': {
      if (val === '0') return go('hallSay');
      if (val === '9' && s.listMore) { s.listPage++; return go('hallMenu'); }
      const hall = pickFromPage(s.hallChoices, s.listPage);
      if (!hall) return invalid();
      return (await routeToHall(q, hall.extension, { brief: true, said: s.said })) ?? invalid();
    }

    case 'hood':
      s.page = 0;
      s.hoodPage = 0;
      if (val === '0') { s.hood = null; return go('results'); }
      if (val === '1') return go('hoodSay');
      if (val === '2') return go('hoodMenu');
      return invalid();
    case 'hoodSay': {
      const hood = matchName('hoodSay', val, s.allHoods, HOOD_WORDS);
      if (hood) { s.hood = hood; return go('hoodOk'); }
      return notFound(s, 'hoodSay', `לֹא נִמְצְאוּ אוּלַמּוֹת בִּשְׁכוּנַת ${dropGeneric(val, HOOD_WORDS)}`);
    }
    case 'hoodOk':
      return confirm('results', 'hoodSay');
    case 'hoodMenu': {
      s.page = 0;
      if (val === '0') { s.hood = null; return go('results'); }
      if (val === '9' && s.hoodMore) { s.hoodPage++; return go('hoodMenu'); }
      if (s.hoodExtra && Number(val) === Math.min(IVR.MENU_PAGE, s.hoods.length - s.hoodPage * IVR.MENU_PAGE) + 1) { // "אולמות נוספים בעיר"
        s.hood = NO_HOOD;
        return go('results');
      }
      const hood = pickFromPage(s.hoods, s.hoodPage);
      if (!hood) return invalid();
      s.hood = hood;
      return go('results');
    }

    case 'noFit': {
      const choice = (await noFitChoices(s))[Number(val) - 1];
      if (choice === 'guests') { s.redoGuests = true; return go('guests'); }
      if (!choice) return invalid();
      s.sizeMode = choice;
      s.page = 0;
      return go('results');
    }

    case 'noResults':
      if (val === '1') { s.redoGuests = true; return go('guests'); }
      if (val === '2') return go('city');
      return invalid();

    case 'results':
      if (/^\d{2,}$/.test(val)) return (await routeToHall(q, val)) ?? retry(`שְׁלוּחָה ${val} לֹא קַיֶּימֶת`);
      if (val === '9') {
        if (s.more) { s.page++; return go('results'); }
        return retry('אֵין אוּלַמּוֹת נוֹסָפִים');
      }
      if (val === '8') return go('results');
      if (val === '7' && !s.sizeMode && (await halls.searchHalls({ city: s.city, neighborhood: s.hood, guests: s.guests, size: 'near' })).length) {
        s.sizeMode = 'near';
        s.page = 0;
        return go('results');
      }
      if (val === '6' && await offerNoHood(s)) { s.hood = NO_HOOD; s.page = 0; return go('results'); }
      if (val === '0' && s.hood) { s.hood = null; s.hoodPage = 0; return go('hood'); }
      return invalid();
  }
  resetSession(s);
  return prompt(s);
}

// זרימת השיחה: מה שואלים בכל שלב (prompt) ואיך מטפלים בתשובה (handleAnswer).
//
// שלבים:  menu → guests → guestsOk → city → cityOk → hood → (hoodSay → hoodOk | hoodMenu) → results
//         menu → extEntry (הקשת מספר שלוחה ישירה)
//         cityMenu / hoodMenu - בחירה מרשימה (גם כשהתמלול נכשל)
import { IVR } from '../config.js';
import { say, tapOptions, recordOptions } from '../lib/yemot.js';
import { bestMatch, parseNumber } from '../lib/text-match.js';
import * as halls from '../repositories/halls.js';
import { withNikud } from '../services/nikud.js';
import { transcribeRecording } from '../services/transcriber.js';
import { resetSession } from './sessions.js';
import { routeToHall } from './route-to-hall.js';

const CONFIRM = ['לְאִישּׁוּר הַקֵּשׁ 1', 'לְתִיקּוּן הַקֵּשׁ 2'];
const STAR_HINT = 'בְּכָל שָׁלָב אֶפְשָׁר לַחֲזוֹר לַתַּפְרִיט הָרָאשִׁי בְּהַקָּשַׁת כּוֹכָבִית';

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
const recordAnswer = (s) => recordOptions(IVR.REC_DIR, recordingFile(s, s.n + 1), IVR.REC_MAX_SEC); // ask() מקדם את n

export const isSpeechStep = (s) => s.step === 'city' || s.step === 'hoodSay';

// מחזיר את מה שנאמר, או null אם התמלול נכשל
export async function transcribeAnswer(s) {
  const isCity = s.step === 'city';
  return transcribeRecording({
    path: `ivr2:${IVR.REC_DIR}/${recordingFile(s, s.n)}.wav`,
    hints: isCity ? await halls.getActiveCities() : s.hoods,
    kind: isCity ? 'עיר' : 'שכונה',
  }).catch((e) => { console.error('transcribe:', e.message); return null; });
}

// התמלול נכשל (למשל נגמרה היתרה ב-OpenAI) - בחירה מרשימה בהקשה
export function fallbackToList(s) {
  s.note = 'בְּחַר מֵהָרְשִׁימָה';
  if (s.step === 'city') { s.cityPage = 0; s.step = 'cityMenu'; } else { s.hoodPage = 0; s.step = 'hoodMenu'; }
  return prompt(s);
}

// ---------- מה שואלים בכל שלב ----------

export async function prompt(s) {
  switch (s.step) {
    case 'menu':
      return ask(s, ['בְּרוּכִים הַבָּאִים לֶגְמַ״ח אוּלָם בֶּרֶגַע', 'לְחִיפּוּשׂ אוּלָם הַקֵּשׁ 1',
        'אִם יָדוּעַ לְךָ מִסְפַּר הַשְּׁלוּחָה שֶׁל הָאוּלָם הַקֵּשׁ 2'], tapOptions(1));

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
        ...s.cities.slice(from, from + IVR.MENU_PAGE).map((c, i) => `לְ${withNikud(c)} הַקֵּשׁ ${i + 1}`),
        s.cityMore && 'לְעָרִים נוֹסָפוֹת הַקֵּשׁ 9'], tapOptions(1));
    }

    case 'hood':
      s.hoods = await halls.getActiveNeighborhoods(s.city);
      if (!s.hoods.length) { s.step = 'results'; s.page = 0; return prompt(s); }
      return ask(s, ['לַאֲמִירַת שֵׁם הַשְּׁכוּנָה הַקֵּשׁ 1', 'לִבְחִירַת שְׁכוּנָה מֵרְשִׁימָה הַקֵּשׁ 2',
        'לְחִיפּוּשׂ בְּכָל הָעִיר הַקֵּשׁ 0'], tapOptions(1));
    case 'hoodSay':
      return ask(s, ['אֱמוֹר אֶת שֵׁם הַשְּׁכוּנָה אַחֲרֵי הַצְּלִיל וּבְסִיּוּם הַקֵּשׁ סוּלָמִית'], recordAnswer(s));
    case 'hoodOk':
      return ask(s, [`הֵבַנְתִּי שְׁכוּנַת ${withNikud(s.hood)}`, ...CONFIRM], tapOptions(1));
    case 'hoodMenu': {
      const from = s.hoodPage * IVR.MENU_PAGE;
      s.hoodMore = s.hoods.length > from + IVR.MENU_PAGE;
      return ask(s, ['בְּאֵיזוֹ שְׁכוּנָה',
        ...s.hoods.slice(from, from + IVR.MENU_PAGE).map((h, i) => `לְ${withNikud(h)} הַקֵּשׁ ${i + 1}`),
        s.hoodMore && 'לִשְׁכוּנוֹת נוֹסָפוֹת הַקֵּשׁ 9',
        'לְכָל הָעִיר הַקֵּשׁ 0'], tapOptions(1));
    }

    case 'noResults':
      return ask(s, [`לֹא נִמְצְאוּ אוּלַמּוֹת בְּ${withNikud(s.city)} לְ${s.guests} מוּזְמָנִים`,
        'לְשִׁינּוּי כַּמּוּת הַמּוּזְמָנִים הַקֵּשׁ 1', 'לְשִׁינּוּי הָעִיר הַקֵּשׁ 2',
        'לַתַּפְרִיט הָרָאשִׁי הַקֵּשׁ כּוֹכָבִית'], tapOptions(1));

    case 'results':
      return promptResults(s);
  }
}

async function promptResults(s) {
  const found = await halls.searchHalls({ city: s.city, neighborhood: s.hood, guests: s.guests });
  if (!found.length) {
    if (s.hood) {
      s.note = `לֹא נִמְצְאוּ אוּלַמּוֹת מַתְאִימִים בִּשְׁכוּנַת ${withNikud(s.hood)}`;
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
    parts.push(withNikud(h.name), h.neighborhood_name && `בִּשְׁכוּנַת ${withNikud(h.neighborhood_name)}`,
      `עַד ${h.max_guests} אוֹרְחִים`, `לְמַעֲבָר לָאוּלָם הַקֵּשׁ ${h.extension} וְסוּלָמִית`);
  }
  if (s.more) parts.push('לְאוּלַמּוֹת נוֹסָפִים הַקֵּשׁ 9 וְסוּלָמִית');
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
      if (val === '1') return go('guests');
      if (val === '2') return go('extEntry');
      return invalid();
    case 'extEntry':
      return (await routeToHall(q, val)) ?? retry(`שְׁלוּחָה ${val} לֹא קַיֶּימֶת`);

    case 'guests': {
      const n = parseNumber(raw);
      if (!(n >= 1 && n <= 5000)) return retry('לֹא הֵבַנְתִּי אֶת הַמִּסְפָּר');
      s.guests = n;
      return go('guestsOk');
    }
    case 'guestsOk':
      return confirm('city', 'guests');

    case 'city': {
      const city = bestMatch(val, await halls.getActiveCities());
      if (!city) return retry(`לֹא נִמְצְאוּ אוּלַמּוֹת בְּ${val}`); // חוזרים על מה שנשמע
      s.city = city;
      return go('cityOk');
    }
    case 'cityOk':
      return confirm('hood', 'city');
    case 'cityMenu': {
      if (val === '9' && s.cityMore) { s.cityPage++; return go('cityMenu'); }
      const city = pickFromPage(s.cities, s.cityPage);
      if (!city) return invalid();
      s.city = city;
      return go('hood');
    }

    case 'hood':
      s.page = 0;
      s.hoodPage = 0;
      if (val === '0') { s.hood = null; return go('results'); }
      if (val === '1') return go('hoodSay');
      if (val === '2') return go('hoodMenu');
      return invalid();
    case 'hoodSay': {
      const hood = bestMatch(val, s.hoods);
      if (hood) { s.hood = hood; return go('hoodOk'); }
      s.note = `לֹא נִמְצְאוּ אוּלַמּוֹת בִּשְׁכוּנַת ${val}`;
      return go('hoodMenu');
    }
    case 'hoodOk':
      return confirm('results', 'hoodSay');
    case 'hoodMenu': {
      s.page = 0;
      if (val === '0') { s.hood = null; return go('results'); }
      if (val === '9' && s.hoodMore) { s.hoodPage++; return go('hoodMenu'); }
      const hood = pickFromPage(s.hoods, s.hoodPage);
      if (!hood) return invalid();
      s.hood = hood;
      return go('results');
    }

    case 'noResults':
      if (val === '1') return go('guests');
      if (val === '2') return go('city');
      return invalid();

    case 'results':
      if (/^\d{2,}$/.test(val)) return (await routeToHall(q, val)) ?? retry(`שְׁלוּחָה ${val} לֹא קַיֶּימֶת`);
      if (val === '9') {
        if (s.more) { s.page++; return go('results'); }
        return retry('אֵין אוּלַמּוֹת נוֹסָפִים');
      }
      if (val === '8') return go('results');
      if (val === '0' && s.hood) { s.hood = null; s.hoodPage = 0; return go('hood'); }
      return invalid();
  }
  resetSession(s);
  return prompt(s);
}

// זרימת הבוט בוואטסאפ: handleMessage(session, input, ctx) → רשימת הודעות לשליחה.
// פונקציה נקייה ביחס לרשת (הקריאה היחידה היא לרשימת האולמות שבזיכרון), כדי שאפשר יהיה לבדוק אותה.
// הבוט רק מוסר מספר שלוחה: המתקשר מחייג בעצמו למרכזייה ומקיש 2 ושלוחה, ולכן ההעברה, המיילים ויומן השיחות
// נשארים כמו בשיחה רגילה.
//
// input: { id } (לחיצה על כפתור או שורה ברשימה) או { text }
// ctx:   { dial } המספר שאליו המשתמש כותב (הוא גם מספר המרכזייה)
// הודעה: { kind: 'text', text } | { kind: 'buttons', body, buttons: [[id, title]] } | { kind: 'list', body, button, rows: [[id, title, description?]] }
import * as halls from '../services/hall-directory.js';
import { splitHoods, splitNames } from '../lib/hoods.js';
import { bestMatch, dropGeneric, normalize, parseNumber, splitCity } from '../lib/text-match.js';
import { CITY_WORDS, HALL_WORDS, HOOD_WORDS } from '../ivr/flow.js';
import { T } from './texts.js';

const { NO_HOOD } = halls;
const PAGE = 8;          // פריטים בכל עמוד ברשימה (בנוסף: "עוד" ו"תפריט"/"כל העיר" - עד 10 שורות)
const RESULTS_PAGE = 5;  // אולמות בכל הודעת תוצאות

const text = (t) => ({ kind: 'text', text: t });
const buttons = (body, list) => ({ kind: 'buttons', body, buttons: list });
const list = (body, button, rows) => ({ kind: 'list', body, button, rows });
const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

const HEBREW = /[א-ת]/;
const MENU_WORDS = ['תפריט', 'menu', 'start', 'התחלה', 'שלום', 'hi', 'hello'];

export function newSession(firstText = '') {
  return { lang: firstText && !HEBREW.test(firstText) && /[a-z]/i.test(firstText) ? 'en' : 'he', step: 'menu', t: Date.now() };
}

const reset = (s) => Object.assign(s, { step: 'menu', mode: null, free: false, guests: null, city: null, hood: null, sizeMode: null, redoGuests: false, page: 0 });

// ---------- הצגה ----------

function menu(s, note, t = T[s.lang]) {
  return [list([note, t.menuBody].filter(Boolean).join('\n'), t.menuButton,
    [['m:search', t.search, t.searchDesc], ['m:name', t.byName, t.byNameDesc], ['x:ext', t.ext, t.extDesc], ['x:owner', t.owner], ['x:lang', t.lang]])];
}

// עמוד של רשימה: PAGE פריטים, ואחריהם "עוד" אם יש, ושורות קבועות (extra)
function pageRows(s, items, label, pageKey, moreLabel, extra) {
  const from = (s[pageKey] ?? 0) * PAGE;
  const more = items.length > from + PAGE;
  const rows = items.slice(from, from + PAGE).map((it, i) => [`${label}:${from + i}`, ...it]);
  if (more) rows.push([`${label}:more`, moreLabel]);
  return { rows: [...rows, ...extra], more, from };
}

// קישור https לדף שפותח חייגן עם המספר, 2, השלוחה וסולמית (וואטסאפ לא מפעילה קישורי tel: באנדרואיד)
const dialPage = (ctx, ext, t) => {
  const num = String(ctx.dial ?? '').replace(/\D/g, '');
  return ctx.link && num ? `${t.dialPage}: ${ctx.link}/c/${num}/${ext}` : undefined;
};

// קישור חיוג להודעה קולית (תפריט 5 בטלפון)
const voicemailLink = (ctx) => {
  const num = String(ctx.dial ?? '').replace(/\D/g, '');
  return ctx.link && num ? `${ctx.link}/m/${num}` : '';
};

// הודעת אולם אחת (בכרטיס ובכל אולם ברשימת התוצאות): שם, כתובת, אורחים, הוראת חיוג וקישור
const hallBlock = (h, t, ctx = {}, hood) => {
  const hoods = splitHoods(h.neighborhood_name);
  const shown = hood && hoods.includes(hood) ? [hood] : hoods;
  const link = dialPage(ctx, h.extension, t);
  return [`*${h.name}*${h.synagogue_name ? ` (${t.synagogue} ${h.synagogue_name})` : ''}`,
    [h.address, shown.length && `${t.hoodWord} ${shown.join(' / ')}`, h.city_name].filter(Boolean).join(', '),
    t.upTo(h.max_guests), '', t.howToCall(ctx.dial, h.extension), ...(link ? ['', link] : [])].join('\n');
};

function hallCard(s, h, ctx) {
  const t = T[s.lang];
  const body = hallBlock(h, t, ctx);
  s.step = 'menu';
  return [buttons(body, [['m:menu', t.back]])];
}

const noFitChoices = async (s) => {
  const where = { city: s.city, neighborhood: s.hood, guests: s.guests };
  const out = [];
  if ((await halls.searchHalls({ ...where, size: 'larger' })).length) out.push('larger');
  if ((await halls.searchHalls({ ...where, size: 'smaller' })).length) out.push('smaller');
  return [...out, 'guests'];
};

async function show(s, ctx, note) {
  const t = T[s.lang];
  const ask = (...parts) => [note, ...parts].filter(Boolean).join('\n');
  // "גדולים/קטנים יותר" תקף רק לחיפוש הנוכחי: שינוי כמות, עיר או שכונה מאפס אותו
  if (['guests', 'city', 'hood', 'hoodMenu'].includes(s.step)) s.sizeMode = null;
  switch (s.step) {
    case 'menu': return menu(s, note);
    case 'guests': return [text(ask(t.askGuests))];
    case 'extEntry': return [text(ask(t.askExt))];
    case 'city': {
      s.cities = await halls.getActiveCities();
      const { rows } = pageRows(s, s.cities.map((c) => [cut(c, 24)]), 'c', 'cityPage', t.moreCities, [['m:menu', t.back]]);
      return [list(ask(t.askCity), t.cityButton, rows)];
    }
    case 'hood': {
      s.allHoods = await halls.getActiveNeighborhoods(s.city);
      // אין בעיר אולם בגודל מתאים: ישר להצעה לאולמות גדולים/קטנים יותר
      if (!(await halls.searchHalls({ city: s.city, guests: s.guests })).length) { s.step = 'noFit'; return show(s, ctx, note); }
      s.hoods = await halls.getActiveNeighborhoods(s.city, s.guests);
      if (!s.hoods.length) { s.step = 'results'; s.page = 0; return show(s, ctx, note); }
      return [buttons(ask(t.askHood), [['k:pick', t.pickHood], ['k:all', t.allCity]])];
    }
    case 'hoodMenu': {
      const { rows, more } = pageRows(s, s.hoods.map((h) => [cut(h, 24)]), 'k', 'hoodPage', t.moreHoods, []);
      // בעמוד האחרון: אולמות בעיר שלא רשומה להם שכונה
      s.hoodExtra = !more && await halls.hasNoHoodHalls(s.city, s.guests);
      if (s.hoodExtra) rows.push(['k:extra', cut(t.extraHalls, 24)]);
      rows.push(['k:all', t.allCity]);
      return [list(ask(t.askHood), t.hoodButton, rows)];
    }
    case 'freeName': return [text(ask(t.askFree))];
    case 'hallName':
      s.cityHalls = await halls.getActiveHallsInCity(s.city);
      return [buttons(ask(t.askHall), [['h:list', t.hallList], ['m:menu', t.back]])];
    case 'hallMenu': {
      const items = s.hallChoices.map((h) => [cut(h.name, 24), cut([h.synagogue_name, h.neighborhood_name, h.city_name, h.address].filter(Boolean).join(' · '), 72)]);
      const { rows } = pageRows(s, items, 'hl', 'listPage', t.moreHalls, [['m:menu', t.back]]);
      return [list(ask(t.pickHall), t.hallButton, rows)];
    }
    case 'noHall': return [buttons(ask(), [['h:retry', t.tryAgain], ['h:list', t.hallList], ['m:menu', t.back]])];
    case 'noFit': {
      const choices = await noFitChoices(s);
      const label = { larger: t.larger, smaller: t.smaller, guests: t.changeGuests };
      const where = s.hood && s.hood !== NO_HOOD ? t.inHood(s.hood) : t.inCity(s.city);
      return [buttons(ask(t.noFit(where, s.guests)), choices.map((c) => [`f:${c}`, label[c]]))];
    }
    case 'noResults':
      return [buttons(ask(t.noResults(s.city, s.guests)), [['f:guests', t.changeGuests], ['f:city', t.changeCity], ['m:menu', t.back]])];
    case 'results': return results(s, ctx, note);
  }
  reset(s);
  return menu(s, note);
}

async function results(s, ctx, note) {
  const t = T[s.lang];
  const where = { city: s.city, neighborhood: s.hood, guests: s.guests };
  const found = await halls.searchHalls({ ...where, size: s.sizeMode });
  if (!found.length) {
    if ((await noFitChoices(s)).length > 1) { s.step = 'noFit'; return show(s, ctx, note); }
    if (s.hood) { s.hood = null; s.step = 'hood'; return show(s, ctx, s.lang === 'he' ? 'לא נמצאו אולמות מתאימים בשכונה' : 'No matching halls in that neighborhood'); }
    s.step = 'noResults';
    return show(s, ctx, note);
  }
  const from = s.page * RESULTS_PAGE;
  const onPage = found.slice(from, from + RESULTS_PAGE);
  s.more = found.length > from + RESULTS_PAGE;
  // כותרת, הודעה נפרדת לכל אולם (כל אחת עם הוראת חיוג וקישור משלה), ואחריהן רשימת הפעולות
  const head = [note, s.page === 0 && (found.length === 1 ? t.found1 : t.foundN(found.length))].filter(Boolean).join('\n');
  const cards = onPage.map((h) => text(hallBlock(h, t, ctx, s.hood)));
  const rows = [];
  if (s.more) rows.push(['r:more', t.rMore]);
  if (!s.sizeMode && (await halls.searchHalls({ ...where, size: 'near' })).length) rows.push(['r:near', t.rNear]);
  if (s.hood && s.hood !== NO_HOOD && !s.sizeMode && await halls.hasNoHoodHalls(s.city, s.guests)) rows.push(['r:extra', cut(t.extraHalls, 24)]);
  if (s.hood) rows.push(['r:hood', t.rHood]);
  rows.push(['r:guests', t.rGuests], ['m:menu', t.back]);
  return [...(head ? [text(head)] : []), ...cards, list(t.next, t.nextButton, rows)];
}

// ---------- טיפול בהודעה ----------

export async function handleMessage(s, input, ctx = {}) {
  s.t = Date.now();
  const t = T[s.lang];
  const id = input.id ?? '';
  const raw = (input.text ?? '').trim();
  const go = (step, note) => { s.step = step; return show(s, ctx, note); };
  const invalid = () => show(s, ctx, t.unknown);
  const pick = (items, key) => { // שורה שנבחרה ברשימה: "c:12" → הפריט
    const n = Number(id.split(':')[1]);
    return id.startsWith(`${key}:`) && Number.isInteger(n) && n >= 0 && n < items.length ? items[n] : null;
  };

  // פקודות שעובדות בכל שלב
  if (id === 'm:menu' || MENU_WORDS.includes(raw.toLowerCase()) || raw === '*') { reset(s); return show(s, ctx); }
  if (id === 'x:lang') { s.lang = s.lang === 'he' ? 'en' : 'he'; reset(s); return show(s, ctx); }

  switch (s.step) {
    case 'menu':
      if (id === 'm:search') { s.mode = 'filters'; return go('guests'); }
      if (id === 'm:name') { s.mode = 'name'; return go('freeName'); }
      if (id === 'x:ext') return go('extEntry');
      if (id === 'x:owner') { reset(s); return [text(t.ownerInfo(ctx.dial, voicemailLink(ctx))), ...menu(s)]; }
      if (id) return invalid();
      return show(s, ctx); // טקסט חופשי בתפריט: מציגים אותו שוב
    case 'extEntry': {
      const ext = raw.replace(/\D/g, '');
      const hall = ext && await halls.findActiveByExtension(ext);
      return hall ? hallCard(s, hall, ctx) : go('extEntry', t.extNone(raw));
    }

    case 'guests': {
      const n = parseNumber(raw);
      if (!(n >= 1 && n <= 5000)) return go('guests', t.badGuests);
      s.guests = n;
      if (s.redoGuests) { s.redoGuests = false; s.page = 0; return go('results'); } // שינוי כמות: ממשיכים באותה עיר ושכונה
      return go('city');
    }

    case 'city': {
      if (id === 'c:more') { s.cityPage = (s.cityPage ?? 0) + 1; return go('city'); }
      let city = pick(s.cities, 'c');
      if (!city && raw) {
        city = bestMatch(raw, s.cities, { generic: CITY_WORDS });
        if (!city) return go('city', t.cityNone(raw));
      }
      if (!city) return invalid();
      s.city = city; s.cityPage = 0; s.hood = null; s.hoodPage = 0;
      return go(s.mode === 'name' ? 'hallName' : 'hood');
    }

    case 'hood': {
      s.page = 0; s.hoodPage = 0;
      if (id === 'k:all') { s.hood = null; return go('results'); }
      if (id === 'k:pick') return go('hoodMenu');
      if (raw) {
        const hood = bestMatch(raw, s.allHoods, { generic: HOOD_WORDS });
        if (!hood) return go('hood', t.hoodNone(raw));
        s.hood = hood;
        return go('results');
      }
      return invalid();
    }
    case 'hoodMenu': {
      s.page = 0;
      if (id === 'k:more') { s.hoodPage++; return go('hoodMenu'); }
      if (id === 'k:all') { s.hood = null; return go('results'); }
      if (id === 'k:extra' && s.hoodExtra) { s.hood = NO_HOOD; return go('results'); }
      let hood = pick(s.hoods, 'k');
      if (!hood && raw) hood = bestMatch(raw, s.allHoods, { generic: HOOD_WORDS });
      if (!hood) return raw ? go('hoodMenu', t.hoodNone(raw)) : invalid();
      s.hood = hood;
      return go('results');
    }

    case 'noFit': {
      if (id === 'f:guests') { s.redoGuests = true; return go('guests'); }
      if (id === 'f:larger' || id === 'f:smaller') { s.sizeMode = id.slice(2); s.page = 0; return go('results'); }
      return invalid();
    }
    case 'noResults':
      if (id === 'f:guests') { s.redoGuests = true; return go('guests'); }
      if (id === 'f:city') return go('city');
      return invalid();

    case 'results':
      if (id === 'r:more' && s.more) { s.page++; return go('results'); }
      if (id === 'r:near' && !s.sizeMode) { s.sizeMode = 'near'; s.page = 0; return go('results'); }
      if (id === 'r:extra' && s.hood && s.hood !== NO_HOOD && !s.sizeMode) { s.hood = NO_HOOD; s.page = 0; return go('results'); }
      if (id === 'r:hood' && s.hood) { s.hood = null; s.hoodPage = 0; return go('hood'); }
      if (id === 'r:guests') { s.redoGuests = true; return go('guests'); }
      return invalid();

    // חיפוש לפי שם בכתיבה חופשית: "היכל שמחה בירושלים" (העיר אופציונלית)
    case 'freeName': {
      if (!raw) return invalid();
      const all = await halls.getActiveHalls();
      const { city, rest } = splitCity(raw, await halls.getActiveCities());
      // strict: חיפוש בכל האולמות - שם קצר מאוד ("אולם א") מתאים רק אם נכתב במלואו, כדי שלא יימצא בתוך כל טקסט
      const find = (list, q, strict) => {
        const all = [...new Set(list.flatMap((h) => [...splitNames(h.name), h.synagogue_name]).filter(Boolean))];
        const names = strict ? all.filter((n) => normalize(n) === normalize(q) || normalize(dropGeneric(n, HALL_WORDS)).length >= 3) : all;
        const name = bestMatch(q, names, { generic: HALL_WORDS });
        return name ? list.filter((h) => splitNames(h.name).includes(name) || h.synagogue_name === name) : [];
      };
      let matches = [];
      if (city) {
        const inCity = all.filter((h) => h.city_name === city);
        matches = rest ? find(inCity, rest) : inCity; // נכתבה רק עיר: רשימת האולמות שלה
      }
      if (!matches.length) matches = find(all, raw, true);
      if (matches.length === 1) return hallCard(s, matches[0], ctx);
      if (matches.length) { s.hallChoices = matches; s.listPage = 0; return go('hallMenu'); }
      s.free = true; s.lastName = raw;
      return go('noHall', t.hallNone(raw));
    }
    // חיפוש לפי שם: שם אולם או בית כנסת בעיר שנבחרה
    case 'hallName': {
      if (id === 'h:list') { s.hallChoices = s.cityHalls; s.listPage = 0; return go('hallMenu'); }
      if (!raw) return invalid();
      const names = [...new Set(s.cityHalls.flatMap((h) => [...splitNames(h.name), h.synagogue_name]).filter(Boolean))];
      const name = bestMatch(raw, names, { generic: HALL_WORDS });
      const matches = name ? s.cityHalls.filter((h) => splitNames(h.name).includes(name) || h.synagogue_name === name) : [];
      if (matches.length === 1) return hallCard(s, matches[0], ctx);
      if (matches.length) { s.hallChoices = matches; s.listPage = 0; return go('hallMenu'); }
      s.lastName = raw;
      return go('noHall', t.hallNone(raw));
    }
    case 'noHall':
      if (id === 'h:retry') return go(s.free ? 'freeName' : 'hallName');
      if (id === 'h:list' && s.free) { s.free = false; return go('city'); } // בחירת עיר ואז רשימת האולמות שלה
      if (id === 'h:list') { s.hallChoices = s.cityHalls; s.listPage = 0; return go('hallMenu'); }
      return invalid();
    case 'hallMenu': {
      if (id === 'hl:more') { s.listPage++; return go('hallMenu'); }
      const hall = pick(s.hallChoices, 'hl');
      return hall ? hallCard(s, hall, ctx) : invalid();
    }
  }
  reset(s);
  return show(s, ctx);
}

// ההודעה הראשונה בשיחה: ברכה ותפריט
export async function greet(s, ctx) {
  const t = T[s.lang];
  return [text(t.welcome), ...(await show(s, ctx))];
}

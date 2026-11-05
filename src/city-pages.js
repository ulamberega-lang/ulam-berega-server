// דפי עיר לקידום אתרים ("אולם קטן בירושלים"): עיר ורשימת שכונות בלבד, בלי שמות אולמות, כתובות או טלפונים.
// הנתונים: בשרת הראשי ישירות מהזיכרון, בשרת הציבורי הנפרד - מ-/api/cities של השרת הראשי (עם מטמון).
import { splitHoods } from './lib/hoods.js';

export const SITE_URL = process.env.SITE_URL || 'https://simcha-besicha.co.il';
const PHONE = '03-313-0858';
const CACHE_MS = 60 * 60 * 1000;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const slugOf = (city) => city.trim().replace(/\s+/g, '-');
export const cityPath = (city) => encodeURI(`/אולם-קטן-ב/${slugOf(city)}`);

// [{ city, count, min, max, hoods: [{ name, count, min, max }] }] מרשימת האולמות הפעילים.
// רק מספרים (כמות אולמות וטווח אורחים), בלי זהות האולמות
export function groupCities(halls) {
  const stat = (m, key, h) => {
    const s = m.get(key) ?? { count: 0, min: Infinity, max: 0 };
    s.count++; s.min = Math.min(s.min, h.max_guests || Infinity); s.max = Math.max(s.max, h.max_guests || 0);
    m.set(key, s);
  };
  const cities = new Map();
  for (const h of halls) {
    if (!h.city_name) continue;
    const c = cities.get(h.city_name) ?? { all: new Map(), hoods: new Map() };
    stat(c.all, 'all', h);
    splitHoods(h.neighborhood_name).forEach((n) => stat(c.hoods, n, h));
    cities.set(h.city_name, c);
  }
  const fin = (s) => ({ count: s.count, min: Number.isFinite(s.min) ? s.min : 0, max: s.max });
  return [...cities].map(([city, c]) => ({
    city, ...fin(c.all.get('all')),
    hoods: [...c.hoods].map(([name, s]) => ({ name, ...fin(s) })).sort((a, b) => a.name.localeCompare(b.name, 'he')),
  })).sort((a, b) => a.city.localeCompare(b.city, 'he'));
}

let provider = null; // בשרת הראשי: פונקציה ישירה
export const setCitiesProvider = (fn) => { provider = fn; };

let cache = { at: 0, cities: [] };
export async function getCities() {
  if (Date.now() - cache.at < CACHE_MS) return cache.cities;
  try {
    const cities = provider ? await provider() : await (async () => {
      const main = (process.env.MAIN_URL || 'https://ulam-berega.onrender.com').replace(/\/+$/, '');
      const r = await fetch(`${main}/api/cities`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`status ${r.status}`);
      return r.json();
    })();
    cache = { at: Date.now(), cities };
  } catch (e) {
    console.error('cities:', e.message);
    cache.at = Date.now() - CACHE_MS + 60 * 1000; // נכשל - ממשיכים עם הקודם ומנסים שוב בעוד דקה
  }
  return cache.cities;
}

export const findCity = async (slug) => (await getCities()).find((c) => slugOf(c.city) === slug);

// כל שכונה: אובייקט (גרסה חדשה) או מחרוזת (שרת ראשי ישן בזמן פריסה)
const hoodsOf = (c) => c.hoods.map((n) => (typeof n === 'string' ? { name: n } : n));
export const hoodPath = (city, hood) => encodeURI(`/אולם-קטן-ב/${slugOf(city)}/${slugOf(hood)}`);
export const findHood = (c, slug) => hoodsOf(c).find((n) => slugOf(n.name) === slug);

// "מעודכן לאוקטובר 2026" (חודש נוכחי)
const updatedAt = () => new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });
const range = (s) => (s.count && s.max ? (s.min && s.min !== s.max ? `בקיבולת של ${s.min} עד ${s.max} אורחים` : `בקיבולת של עד ${s.max} אורחים`) : '');
// מספר הטלפון בטקסט לא נשבר בין שורות (הטקסט הגלוי נשאר זהה לנתונים המובנים)
const nb = (html) => html.replaceAll(PHONE, `<span class="nb">${PHONE}</span>`);
const hallsWord = (n) => (n === 1 ? 'אולם אחד' : `${n} אולמות`);

const WAYS = (place) => `
    <ol class="ways">
      <li><a class="way main" href="/chat"><b>צ'אט באתר</b><small>מחפשים אולם ${esc(place)} ישר מהדפדפן</small></a></li>
      <li><a class="way" href="https://wa.me/97233130858" target="_blank" rel="noopener"><b>בוט WhatsApp</b><small>שולחים הודעה למספר <span class="ltr">${PHONE}</span></small></a></li>
      <li><a class="way" href="tel:033130858"><b>שיחת טלפון</b><small>מחייגים <span class="ltr">${PHONE}</span> ובוחרים בתפריט</small></a></li>
    </ol>`;

// עמוד עיר או שכונה: faq = [[שאלה, תשובה]] מוצג בדף ובנתונים המובנים (אותו טקסט)
function page({ path, h1, sub, title, desc, place, intro, sections, faq, crumbs }) {
  const url = `${SITE_URL}${path}`;
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'CollectionPage', name: h1, url, inLanguage: 'he-IL', description: desc, isPartOf: { '@id': `${SITE_URL}/#site` } },
      { '@type': 'Service', name: `חיפוש אולם אירועים ${place}`, serviceType: 'מציאת אולם לברית, אירוסין, שבע ברכות ואירועים קטנים', provider: { '@id': `${SITE_URL}/#org` }, areaServed: { '@type': 'Place', name: place }, url },
      { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE_URL}${item}` })) },
      { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<meta name="theme-color" content="#0f0d0a">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/logo.png">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="שמחה בשיחה">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE_URL}/logo.png">
<script type="application/ld+json">${ld}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&family=IBM+Plex+Mono&family=IBM+Plex+Sans+Hebrew:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/visit.js" defer></script>
</head>
<body>
<header class="top">
  <a class="mark" href="/"><img src="/logo.png" alt="" width="36" height="36">שמחה בשיחה</a>
  <nav aria-label="ניווט">
    <a class="hide-s" href="/chat">צ'אט</a>
    <a class="tel ltr" href="tel:033130858">${PHONE}</a>
  </nav>
</header>
<main class="wrap">
  <header class="page-head">
    <h1>${esc(h1)}</h1>
    <p class="sub">${esc(sub)}</p>
  </header>
  <section class="panel">
    <h2>${esc(`מחפשים אולם ${place}?`)}</h2>
    <p>${nb(intro)}</p>${WAYS(place)}
  </section>${sections}
  <section class="panel">
    <h2>שאלות נפוצות</h2>
    ${faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n    <p>${nb(esc(a))}</p>`).join('\n    ')}
  </section>
</main>
<footer class="site">
  <a class="mark" href="/"><img src="/logo.png" alt="" width="28" height="28">שמחה בשיחה</a>
  <a href="/chat">צ'אט באתר</a>
  <a href="/privacy">מדיניות פרטיות</a>
  <a href="/accessibility">הצהרת נגישות</a>
  <span>מעודכן ל${esc(updatedAt())}</span>
</footer>
</body>
</html>
`;
}

const linksPanel = (title, items) => (items.length ? `
  <section class="panel">
    <h2>${esc(title)}</h2>
    <ul class="links">${items.map(([text, href, note]) => `<li><a href="${esc(href)}">${esc(text)}${note ? `<small>${esc(note)}</small>` : ''}</a></li>`).join('')}</ul>
  </section>` : '');

export function cityPage(c, others = []) {
  const { city } = c;
  const hoods = hoodsOf(c);
  const known = c.count > 0;
  const stats = known ? `ב${city} רשומים במערכת ${hallsWord(c.count)}${range(c) ? `, ${range(c)}` : ''}.` : '';
  const faq = [
    [`איפה מוצאים אולם קטן ב${city}?`, `אפשר למצוא אולם ב${city} דרך שמחה בשיחה: בצ'אט באתר, בוואטסאפ או בטלפון ${PHONE}. מציינים כמות מוזמנים ושכונה, והמערכת מציגה אולמות מתאימים ומחברת ישירות לטלפון של האולם.`],
    ...(known ? [[`כמה אולמות יש ב${city}?`, `${stats} הרשימה מתעדכנת כשאולמות מצטרפים למערכת.`]] : []),
    ...(hoods.length ? [[`באילו שכונות ב${city} יש אולמות?`, `אולמות במערכת נמצאים בשכונות: ${hoods.map((n) => n.name).join(', ')}.`]] : []),
    [`האם יש אולם לברית, לאירוסין או לשבע ברכות ב${city}?`, `כן, המערכת מתאימה אולמות לברית, לאירוסין, לשבע ברכות ולכל אירוע קטן ב${city}, לפי כמות המוזמנים.`],
  ];
  const desc = `שמחה בשיחה: ${PHONE}. מחפשים אולם קטן ב${city}? אולם לברית, לאירוסין או לשבע ברכות. מוצאים אולם ב${city} לפי כמות מוזמנים ושכונה - בטלפון, בוואטסאפ ובצ'אט.`;
  return page({
    path: cityPath(city), h1: `אולם קטן ב${city}`, sub: 'אולם לברית, לאירוסין ולשבע ברכות',
    title: `אולם קטן ב${city} - אולם לברית, אירוסין ושבע ברכות | שמחה בשיחה`, desc, place: `ב${city}`,
    intro: esc(`שמחה בשיחה, ${PHONE}, עוזרת למצוא אולם ב${city} לפי כמות המוזמנים והשכונה, ומחברת ישירות לטלפון של האולם. מתאים לברית, לאירוסין, לשבע ברכות ולכל אירוע קטן. ${stats}`.trim()),
    sections: linksPanel(`אולמות ב${city} לפי שכונה`, hoods.map((n) => [n.name, hoodPath(city, n.name), n.count ? hallsWord(n.count) : '']))
      + linksPanel('אולמות בערים נוספות', others.filter((o) => o.city !== city).map((o) => [o.city, cityPath(o.city)])),
    faq, crumbs: [['שמחה בשיחה', '/'], [`אולם קטן ב${city}`, cityPath(city)]],
  });
}

export function hoodPage(c, hood) {
  const { city } = c;
  const stats = hood.count ? `בשכונת ${hood.name} ב${city} רשומים במערכת ${hallsWord(hood.count)}${range(hood) ? `, ${range(hood)}` : ''}.` : '';
  const place = `בשכונת ${hood.name} ב${city}`;
  const faq = [
    [`איפה מוצאים אולם קטן בשכונת ${hood.name}?`, `אפשר למצוא אולם בשכונת ${hood.name} ב${city} דרך שמחה בשיחה: בצ'אט באתר, בוואטסאפ או בטלפון ${PHONE}. בוחרים עיר ושכונה, והמערכת מחברת ישירות לטלפון של האולם.`],
    ...(hood.count ? [[`כמה אולמות יש בשכונת ${hood.name}?`, stats]] : []),
    [`האם יש אולם לברית, לאירוסין או לשבע ברכות בשכונת ${hood.name}?`, `כן, המערכת מתאימה אולמות לברית, לאירוסין, לשבע ברכות ולכל אירוע קטן ב${city}, לפי השכונה וכמות המוזמנים.`],
  ];
  const desc = `שמחה בשיחה: ${PHONE}. מחפשים אולם קטן בשכונת ${hood.name} ב${city}? אולם לברית, לאירוסין או לשבע ברכות - לפי כמות מוזמנים, בטלפון, בוואטסאפ ובצ'אט.`;
  return page({
    path: hoodPath(city, hood.name), h1: `אולם קטן בשכונת ${hood.name}, ${city}`, sub: 'אולם לברית, לאירוסין ולשבע ברכות',
    title: `אולם קטן בשכונת ${hood.name} ב${city} - אולם לברית ואירוסין | שמחה בשיחה`, desc, place,
    intro: esc(`שמחה בשיחה, ${PHONE}, עוזרת למצוא אולם בשכונת ${hood.name} ב${city} לפי כמות המוזמנים, ומחברת ישירות לטלפון של האולם. ${stats}`.trim()),
    sections: linksPanel(`עוד שכונות ב${city}`, hoodsOf(c).filter((n) => n.name !== hood.name).map((n) => [n.name, hoodPath(city, n.name)]))
      + `
  <section class="panel">
    <h2>${esc(city)}</h2>
    <ul class="links"><li><a href="${esc(cityPath(city))}">כל האולמות ב${esc(city)}<small>${c.count ? esc(hallsWord(c.count)) : ''}</small></a></li></ul>
  </section>`,
    faq, crumbs: [['שמחה בשיחה', '/'], [`אולם קטן ב${city}`, cityPath(city)], [`שכונת ${hood.name}`, hoodPath(city, hood.name)]],
  });
}

// קישורי ערים לדף הבית (קישור פנימי שמוביל לדפי העיר)
export const cityLinks = (cities) => cities.map((c) => `<li><a href="${esc(cityPath(c.city))}">אולם קטן ב${esc(c.city)}${c.count ? `<small>${esc(hallsWord(c.count))}</small>` : ''}</a></li>`).join('');

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
const hallsWord = (n) => (n === 1 ? 'אולם אחד' : `${n} אולמות`);

const WAYS = (place) => `
    <div class="ways">
      <a class="way main" href="/chat">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7h22a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H15l-6 5v-5H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><path d="M10 13h12M10 17h8"/></svg>
        <span><b>צ'אט באתר</b><small>מחפשים אולם ${esc(place)} ישר מהדפדפן</small></span>
      </a>
      <a class="way" href="https://wa.me/97233130858" target="_blank" rel="noopener">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4a12 12 0 0 0-10.3 18L4 28l6.2-1.6A12 12 0 1 0 16 4z"/><path d="M12 11c0 5 4 9 9 9l1.5-2-3-1.5-1.2 1c-1.4-.6-2.7-1.9-3.3-3.3l1-1.2L15 10z"/></svg>
        <span><b>בוט WhatsApp</b><small>שולחים הודעה למספר ${PHONE}</small></span>
      </a>
      <a class="way" href="tel:033130858">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4h4l2 6-3 2a16 16 0 0 0 8 8l2-3 6 2v4a3 3 0 0 1-3 3A21 21 0 0 1 6 7a3 3 0 0 1 3-3z"/></svg>
        <span><b>שיחת טלפון</b><small>${PHONE}, ובוחרים בתפריט</small></span>
      </a>
    </div>`;

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
<meta name="theme-color" content="#3a2e1c">
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
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700&family=Heebo:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/bg.js" defer></script>
</head>
<body>
<main class="wrap">
  <header class="brand">
    <img src="/logo.png" alt="שמחה בשיחה">
    <h1>${esc(h1)}</h1>
    <p class="sub">${esc(sub)}</p>
  </header>
  <section class="panel">
    <h2>${esc(`מחפשים אולם ${place}?`)}</h2>
    <p>${intro}</p>${WAYS(place)}
  </section>${sections}
  <section class="panel">
    <h2>שאלות נפוצות</h2>
    ${faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join('\n    ')}
  </section>
  <footer class="site"><a href="/">שמחה בשיחה</a> · <a href="/privacy">מדיניות פרטיות</a> · <a href="/accessibility">הצהרת נגישות</a> · מעודכן ל${esc(updatedAt())}</footer>
</main>
</body>
</html>
`;
}

const linksPanel = (title, items) => (items.length ? `
  <section class="panel">
    <h2>${esc(title)}</h2>
    <p>${items.map(([text, href]) => `<a href="${esc(href)}">${esc(text)}</a>`).join(' · ')}</p>
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
    intro: esc(`שמחה בשיחה עוזרת למצוא אולם ב${city} לפי כמות המוזמנים והשכונה, ומחברת ישירות לטלפון של האולם. מתאים לברית, לאירוסין, לשבע ברכות ולכל אירוע קטן. ${stats}`.trim()),
    sections: linksPanel(`אולמות ב${city} לפי שכונה`, hoods.map((n) => [`${n.name}${n.count ? ` (${n.count})` : ''}`, hoodPath(city, n.name)]))
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
    intro: esc(`שמחה בשיחה עוזרת למצוא אולם בשכונת ${hood.name} ב${city} לפי כמות המוזמנים, ומחברת ישירות לטלפון של האולם. ${stats}`.trim()),
    sections: linksPanel(`עוד שכונות ב${city}`, hoodsOf(c).filter((n) => n.name !== hood.name).map((n) => [n.name, hoodPath(city, n.name)]))
      + `
  <section class="panel"><p><a href="${esc(cityPath(city))}">כל האולמות ב${esc(city)}</a></p></section>`,
    faq, crumbs: [['שמחה בשיחה', '/'], [`אולם קטן ב${city}`, cityPath(city)], [`שכונת ${hood.name}`, hoodPath(city, hood.name)]],
  });
}

// קישורי ערים לדף הבית (קישור פנימי שמוביל לדפי העיר)
export const cityLinks = (cities) => cities.map((c) => `<a href="${esc(cityPath(c.city))}">אולם קטן ב${esc(c.city)}</a>`).join(' · ');

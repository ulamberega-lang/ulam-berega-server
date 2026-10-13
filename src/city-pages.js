// דפי עיר לקידום אתרים ("אולם קטן בירושלים"): עיר ורשימת שכונות בלבד, בלי שמות אולמות, כתובות או טלפונים.
// הנתונים: בשרת הראשי ישירות מהזיכרון, בשרת הציבורי הנפרד - מ-/api/cities של השרת הראשי (עם מטמון).
import { splitHoods } from './lib/hoods.js';

export const SITE_URL = process.env.SITE_URL || 'https://simcha-besicha.co.il';
const PHONE = '03-313-0858';
const CACHE_MS = 60 * 60 * 1000;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const slugOf = (city) => city.trim().replace(/\s+/g, '-');
export const cityPath = (city) => encodeURI(`/אולם-קטן-ב/${slugOf(city)}`);

// [{ city, hoods: [...] }] מרשימת האולמות הפעילים
export function groupCities(halls) {
  const map = new Map();
  for (const h of halls) {
    if (!h.city_name) continue;
    const set = map.get(h.city_name) ?? new Set();
    splitHoods(h.neighborhood_name).forEach((n) => set.add(n));
    map.set(h.city_name, set);
  }
  return [...map].map(([city, hoods]) => ({ city, hoods: [...hoods].sort((a, b) => a.localeCompare(b, 'he')) }))
    .sort((a, b) => a.city.localeCompare(b.city, 'he'));
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

export function cityPage({ city, hoods }) {
  const url = `${SITE_URL}${cityPath(city)}`;
  const title = `אולם קטן ב${city} - אולם לברית, אירוסין ושבע ברכות | שמחה בשיחה`;
  const desc = `שמחה בשיחה: ${PHONE}. מחפשים אולם קטן ב${city}? אולם לברית, לאירוסין או לשבע ברכות. מוצאים אולם ב${city} לפי כמות מוזמנים ושכונה - בטלפון, בוואטסאפ ובצ'אט.`;
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'Service', name: `חיפוש אולם אירועים ב${city}`, serviceType: 'מציאת אולם לברית, אירוסין, שבע ברכות ואירועים קטנים', provider: { '@id': `${SITE_URL}/#org` }, areaServed: { '@type': 'City', name: city }, url },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'שמחה בשיחה', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: `אולם קטן ב${city}`, item: url }] },
    ],
  }).replace(/</g, '\\u003c');
  const hoodList = hoods.length ? `
  <section class="panel">
    <h2>שכונות ב${esc(city)}</h2>
    <p>${hoods.map(esc).join(' · ')}</p>
  </section>` : '';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#3a2e1c">
<link rel="icon" type="image/png" href="/logo.png">
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
    <h1>אולם קטן ב${esc(city)}</h1>
    <p class="sub">אולם לברית, לאירוסין ולשבע ברכות</p>
  </header>
  <section class="panel">
    <h2>מחפשים אולם ב${esc(city)}?</h2>
    <p>שמחה בשיחה עוזרת למצוא אולם ב${esc(city)} לפי כמות המוזמנים והשכונה, ומחברת ישירות לטלפון של האולם. מתאים לברית, לאירוסין, לשבע ברכות ולכל אירוע קטן.</p>
    <div class="ways">
      <a class="way main" href="/chat">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7h22a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H15l-6 5v-5H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><path d="M10 13h12M10 17h8"/></svg>
        <span><b>צ'אט באתר</b><small>מחפשים אולם ב${esc(city)} ישר מהדפדפן</small></span>
      </a>
      <a class="way" href="https://wa.me/97233130858" target="_blank" rel="noopener">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4a12 12 0 0 0-10.3 18L4 28l6.2-1.6A12 12 0 1 0 16 4z"/><path d="M12 11c0 5 4 9 9 9l1.5-2-3-1.5-1.2 1c-1.4-.6-2.7-1.9-3.3-3.3l1-1.2L15 10z"/></svg>
        <span><b>בוט WhatsApp</b><small>שולחים הודעה למספר ${PHONE}</small></span>
      </a>
      <a class="way" href="tel:033130858">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4h4l2 6-3 2a16 16 0 0 0 8 8l2-3 6 2v4a3 3 0 0 1-3 3A21 21 0 0 1 6 7a3 3 0 0 1 3-3z"/></svg>
        <span><b>שיחת טלפון</b><small>${PHONE}, ובוחרים בתפריט</small></span>
      </a>
    </div>
  </section>${hoodList}
  <footer class="site"><a href="/">שמחה בשיחה</a> · <a href="/privacy">מדיניות פרטיות</a> · <a href="/accessibility">הצהרת נגישות</a></footer>
</main>
</body>
</html>
`;
}

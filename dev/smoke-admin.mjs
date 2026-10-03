// בדיקת דפדפן לאתר הניהול מול שרת הדמה (dev/mock-admin.mjs). דורש Playwright.
// הרצה: node dev/mock-admin.mjs &   ואז   node dev/smoke-admin.mjs
// אם Playwright מותקן גלובלית: NODE_PATH=$(npm root -g) node dev/smoke-admin.mjs
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.NODE_PATH || ''}/`);
const { chromium, devices } = require('playwright');
const base = process.env.SITE_URL || 'http://localhost:4173/admin/';

const browser = await chromium.launch();
let failed = 0;
const check = (ok, message) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', message); };

async function open(options) {
  const page = await (await browser.newContext(options)).newPage();
  page.on('pageerror', (e) => { failed++; console.log('FAIL page error:', e.message); });
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  return page;
}

// ---- מחשב ----
const p = await open({ viewport: { width: 1280, height: 900 } });
await p.goto(`${base}#stats`);
await p.waitForSelector('#hallStats tr.clickable');
const rows = () => p.$$eval('#hallStats tr.clickable', (t) => t.length);
check(await rows() === 20, 'לפי אולם: 20 אולמות');

await p.fill('#statsSearch', 'בני ברק'); check(await rows() === 4, 'חיפוש לפי עיר');
await p.fill('#statsSearch', 'זכרון'); check(await rows() === 2, 'חיפוש לפי שכונה');
await p.click('#statsSearch ~ .clear'); check(await rows() === 20, 'ניקוי חיפוש');

await p.click('th[data-sort=unanswered]');
const unanswered = await p.$$eval('#hallStats tr.clickable td.no', (t) => t.map((x) => Number(x.textContent.replace(/,/g, ''))));
check(unanswered.every((v, i) => !i || unanswered[i - 1] >= v), 'מיון לפי לא נענו (כותרת)');
check(await p.inputValue('#statsSort select') === 'unanswered', 'רשימת המיון מסונכרנת עם הכותרת');

await p.selectOption('#statsCity', 'ירושלים'); check(await rows() === 8, 'סינון לפי עיר');
await p.selectOption('#statsCity', '');
await p.selectOption('#statsGroup', 'city'); check(await p.$$eval('tr.group-row', (t) => t.length) === 5, 'קיבוץ לפי עיר');
await p.selectOption('#statsGroup', '');

// בחירת אולם, מעבר ליומן, וכפתור חזרה
check(await p.isHidden('#back'), 'אין כפתור חזרה במקום הראשון');
await p.click('#hallStats tr.clickable >> nth=1'); await p.waitForTimeout(400);
const title = await p.textContent('#daysTitle');
check(title.startsWith('לפי יום: '), 'בחירת אולם מציגה ימים');
await p.click('#openCalls'); await p.waitForTimeout(600);
check(await p.evaluate(() => location.hash) === '#calls', 'מעבר ליומן השיחות');
const hallFilter = await p.inputValue('#callsHall');
await p.click('button[data-tab=halls]'); await p.waitForSelector('.hall-card');
await p.click('#back'); await p.waitForTimeout(500);
check(await p.inputValue('#callsHall') === hallFilter, 'חזרה: יומן עם אותו סינון אולם');
await p.click('#back'); await p.waitForTimeout(600);
check(await p.textContent('#daysTitle') === title, 'חזרה: האולם עדיין נבחר');

// יומן שיחות
await p.click('button[data-tab=calls]'); await p.waitForSelector('#callsList tr');
await p.fill('#callsHall', ''); await p.waitForTimeout(400);
await p.click('#callsView button[data-value=no]');
const badges = await p.$$eval('#callsList .badge', (t) => [...new Set(t.map((x) => x.className))]);
check(badges.length === 1 && badges[0].includes('no'), 'יומן: סינון לפי לא נענו');

// אולמות, הצעת שלוחה ושמירה
await p.click('button[data-tab=halls]'); await p.waitForSelector('.hall-card');
await p.fill('#hallsSearch', 'אלעד'); check(await p.$$eval('.hall-card', (t) => t.length) === 2, 'אולמות: חיפוש לפי עיר');
await p.fill('#hallsSearch', '');
await p.click('#addHall');
await p.fill('#hallForm [name=city_name]', 'חיפה');
check(await p.inputValue('#hallForm [name=extension]') === '201', 'עיר חדשה מקבלת הצעה 201');
for (const [name, value] of Object.entries({ name: 'אולם בדיקה', max_guests: '200', gabbai_phone: '0501234567' })) await p.fill(`#hallForm [name=${name}]`, value);
await p.click('.actions .btn[value=save]');
await p.waitForSelector('.toast');
check((await p.textContent('.toast')).includes('נוסף בהצלחה'), 'הודעת שמירה');

// חזרה שומרת את סינון האולם שהוקלד ביומן (גם כשהוקלד אחרי הכניסה ללשונית)
await p.click('button[data-tab=calls]'); await p.waitForSelector('#callsList tr');
await p.fill('#callsHall', 'בני ברק'); await p.waitForTimeout(200);
await p.click('button[data-tab=stats]'); await p.waitForTimeout(400);
await p.click('#back'); await p.waitForTimeout(600);
check(await p.inputValue('#callsHall') === 'בני ברק', 'חזרה: סינון האולם ביומן נשמר');
await p.fill('#callsHall', '');

// פירוט הסיבות ל"לא נענו": מקרא עם מספרים בסיכום, ופס עם כמה גווני אדום
await p.click('button[data-tab=stats]'); await p.waitForSelector('#totals');
check(await p.$$eval('#totals .no .reasons li', (t) => t.length) >= 2, 'סיכום: מקרא סיבות ל"לא נענו"');
check(await p.$$eval('#dayStats .bar i[class^=r]', (t) => new Set(t.map((x) => x.className)).size) >= 2, 'פס ימים: כמה גווני אדום');

// שיחה בלי תוצאת חיוג: התווית מוצגת, ואין "פס" קבוע בראש הדף (התנגשות עם .progress)
await p.click('button[data-tab=calls]'); await p.waitForSelector('#callsList tr');
await p.click('#callsView button[data-value=all]'); await p.fill('#callsSearch', ''); await p.fill('#callsHall', ''); await p.waitForTimeout(400);
check(await p.$$eval('#callsList .badge', (t) => t.every((x) => x.textContent.trim() !== '' && getComputedStyle(x).position !== 'fixed')), 'יומן: כל שיחה עם תווית מצב גלויה (גם בלי תוצאת חיוג)');
check(await p.$$eval('#callsList .badge.unknown, #callsList .badge.pending', (t) => t.length) > 0, 'יומן: שיחה בלי תוצאת חיוג מסומנת');
check(await p.$$eval('#callsList .badge.guess', (t) => t.length > 0 && t.every((x) => x.textContent.includes('משוער'))) && await p.$$eval('#callsList .badge.yes:not(.guess)', (t) => t.length) > 0, 'יומן: "נענה (משוער)" רק כשחסרה תוצאת חיוג');

// חלון פרטי אולם: נפתח משלוש הנקודות ומהיומן, חזרה סוגרת אותו, והמעבר ליומן מסנן לאולם
await p.click('button[data-tab=stats]'); await p.waitForSelector('.details-btn');
await p.click('.details-btn >> nth=0'); await p.waitForSelector('#detailsDialog[open]');
check((await p.textContent('#detailsBody')).includes('שיחות בכל הזמנים'), 'פרטי אולם: מוצגים מספרי השיחות');
await p.goBack(); await p.waitForTimeout(300);
check(await p.isHidden('#detailsDialog') && await p.evaluate(() => location.hash) === '#stats', 'פרטי אולם: חזרה סוגרת את החלון ונשארת בלשונית');
await p.click('.details-btn >> nth=0'); await p.waitForSelector('#detailsDialog[open]');
await p.click('[data-act=calls]'); await p.waitForTimeout(700);
check(await p.evaluate(() => location.hash) === '#calls' && (await p.inputValue('#callsHall')) !== '', 'פרטי אולם: מעבר ליומן מסונן לאולם');
await p.click('.hall-link >> nth=0'); await p.waitForSelector('#detailsDialog[open]');
check(true, 'יומן: שם האולם פותח את חלון הפרטים');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.fill('#callsHall', '');

// אולמות: אם הסטטיסטיקה נכשלת, הרשימה עדיין מוצגת ואפשר לערוך
const q = await open({ viewport: { width: 1280, height: 900 } });
await q.route('**/admin/api/stats/halls*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"תקלה"}' }));
await q.goto(`${base}#halls`); await q.waitForSelector('.hall-card');
check(await q.$$eval('.hall-card', (t) => t.length) === 20, 'אולמות: הרשימה מוצגת גם כשהסטטיסטיקה נכשלת');
check(await q.$$eval('.hall-card .mini', (t) => t.length) === 0, 'אולמות: בלי מספרי שיחות מטעים כשהסטטיסטיקה נכשלה');
check((await q.textContent('#error')).includes('לא נטענו'), 'אולמות: מוצגת הודעת שגיאה');

// יומן: לאולמות עם אותו שם ועיר יש תוויות שונות, וכל אחד מסנן את השיחות של עצמו
const t = await open({ viewport: { width: 1280, height: 900 } });
const twins = [
  { id: 1, name: 'פאר', city_name: 'ירושלים', neighborhood_name: 'גאולה', extension: '101', is_active: true, max_guests: 100, gabbai_phone: '0501111111' },
  { id: 2, name: 'פאר', city_name: 'ירושלים', neighborhood_name: 'רמות', extension: '102', is_active: true, max_guests: 100, gabbai_phone: '0502222222' },
];
await t.route('**/admin/api/halls', (r) => r.request().method() === 'GET' ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(twins) }) : r.continue());
const asked = [];
await t.route('**/admin/api/calls*', (r) => { asked.push(new URL(r.request().url()).searchParams.get('hall')); r.fulfill({ contentType: 'application/json', body: '[]' }); });
await t.goto(`${base}#calls`); await t.waitForSelector('#callsHallOptions option', { state: 'attached' });
const labels = await t.$$eval('#callsHallOptions option', (o) => o.map((x) => x.value));
check(new Set(labels).size === 2, 'יומן: שתי תוויות שונות לאולמות תאומים');
await t.fill('#callsHall', labels[0]); await t.waitForTimeout(500);
check(asked.at(-1) === '1', 'יומן: האולם הראשון מסנן לפי המזהה שלו');
await t.fill('#callsHall', labels[1]); await t.waitForTimeout(500);
check(asked.at(-1) === '2', 'יומן: האולם השני מסנן לפי המזהה שלו');

// לחיצה על בקרים בזמן טעינה ראשונה איטית לא גורמת לשגיאות (open() סופר שגיאות דף ככישלון)
const slow = await open({ viewport: { width: 1280, height: 900 } });
await slow.route('**/admin/api/stats/**', async (r) => { await new Promise((ok) => setTimeout(ok, 800)); r.continue(); });
await slow.goto(`${base}#stats`);
await slow.click('#hideEmptyDays'); await slow.click('.days-table th[data-sort=total]'); await slow.click('#statsExport');
await slow.waitForSelector('#hallStats tr.clickable');
check(true, 'לחיצה על בקרים לפני שהנתונים נטענו: בלי שגיאות');

// ---- אייפון ----
const m = await open(devices['iPhone 14']);
for (const tab of ['stats', 'calls', 'halls']) {
  await m.goto(`${base}#${tab}`); await m.waitForTimeout(600);
  check(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `אייפון (${tab}): בלי גלילה אופקית`);
}

await browser.close();
console.log(failed ? `${failed} נכשלו` : 'הכול עבר');
process.exit(failed ? 1 : 0);

// בדיקת דפדפן לאתר הניהול מול שרת הדמה (dev/mock-admin.mjs). דורש Playwright.
// הרצה: node dev/mock-admin.mjs &   ואז   node dev/smoke-admin.mjs
// אם Playwright מותקן גלובלית: NODE_PATH=$(npm root -g) node dev/smoke-admin.mjs
import { createRequire } from 'node:module';
import { buildXlsx } from './make-xlsx.mjs';

const require = createRequire(`${process.env.NODE_PATH || ''}/`);
const { chromium, devices } = require('playwright');
const base = process.env.SITE_URL || 'http://localhost:4173/admin/';

await fetch(new URL('/__reset', base)).catch(() => {}); // שרת הדמה חוזר למצב התחלתי (הבדיקה מוחקת הודעות)
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
await p.click('#hallStats tr.clickable >> nth=1'); await p.waitForTimeout(600);
check(await p.evaluate(() => location.hash) === '#calls' && (await p.inputValue('#callsHall')) !== '', 'לחיצה על אולם: יומן השיחות שלו');
await p.click('#back'); await p.waitForTimeout(600);
await p.click('.details-btn >> nth=1'); await p.waitForSelector('#detailsDialog[open]');
await p.click('[data-act=days]'); await p.waitForTimeout(800);
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

// מחיקת אולם: הכפתור רק באולם קיים, ושואלים אישור (ביטול לא מוחק, אישור מוחק)
await p.click('#addHall'); check(await p.isHidden('#deleteHall'), 'מחיקה: אין כפתור באולם חדש');
await p.click('.actions .btn[value=cancel]');
await p.click('.hall-card .edit >> nth=0'); check(await p.isVisible('#deleteHall'), 'מחיקה: כפתור באולם קיים');
let hallAsk = '';
p.once('dialog', (d) => { hallAsk = d.message(); d.dismiss(); });
await p.click('#deleteHall'); await p.waitForTimeout(400);
check(hallAsk.includes('12 שיחות') && hallAsk.includes('לגמרי'), 'מחיקה: האישור מציג כמה שיחות יימחקו');
check(await p.isVisible('#hallDialog'), 'מחיקה: ביטול האישור משאיר את החלון פתוח');
p.once('dialog', (d) => d.accept());
await p.click('#deleteHall'); await p.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('נמחק'));
check(await p.isHidden('#hallDialog'), 'מחיקה: אחרי אישור החלון נסגר');

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
check(await p.$$eval('#callsList td.talk', (t) => t.some((x) => /^\d+:\d\d$/.test(x.textContent.trim()))), 'יומן: מוצג זמן הדיבור עם האולם');
check(await p.$$eval('#callsList .badge.guess', (t) => t.length > 0 && t.every((x) => x.textContent.includes('משוער'))) && await p.$$eval('#callsList .badge.yes:not(.guess)', (t) => t.length) > 0, 'יומן: "נענה (משוער)" רק כשחסרה תוצאת חיוג');

// לשונית הודעות: רשימה, מונה, סימון "טופל" ומחיקה
await p.click('button[data-tab=voicemails]'); await p.waitForSelector('#voicemailList tr[data-id]');
check(await p.$$eval('#voicemailList tr[data-id]', (t) => t.length) === 8, 'הודעות: 8 הודעות מוצגות');
check(await p.isHidden('#range'), 'הודעות: אין טווח תאריכים בלשונית');
check(await p.$$eval('#voicemailList audio', (t) => t.length) === 8, 'הודעות: נגן לכל הודעה');
const openBefore = Number(await p.textContent('#voicemailBadge'));
await p.check('#voicemailList tr[data-id] .vm-done >> nth=-1'); await p.waitForTimeout(300);
const openAfter = Number(await p.textContent('#voicemailBadge'));
check(openAfter === openBefore - 1, `הודעות: סימון "טופל" מוריד את המונה (${openBefore} → ${openAfter})`);
await p.fill('#voicemailSearch', '0500'); await p.waitForTimeout(200);
check(await p.$$eval('#voicemailList tr[data-id]', (t) => t.length) < 8, 'הודעות: חיפוש לפי טלפון');
await p.fill('#voicemailSearch', '');
p.once('dialog', (d) => d.accept());
await p.click('#voicemailList .vm-delete >> nth=0'); await p.waitForTimeout(400);
check(await p.$$eval('#voicemailList tr[data-id]', (t) => t.length) === 7, 'הודעות: מחיקה');
await p.click('button[data-tab=stats]'); await p.waitForTimeout(300);

// חלון פרטי אולם: נפתח משלוש הנקודות ומהיומן, חזרה סוגרת אותו, והמעבר ליומן מסנן לאולם
await p.click('button[data-tab=stats]'); await p.waitForSelector('.details-btn');
await p.click('.details-btn >> nth=0'); await p.waitForSelector('#detailsDialog[open]');
check((await p.textContent('#detailsBody')).includes('שיחות בכל הזמנים'), 'פרטי אולם: מוצגים מספרי השיחות');
await p.goBack(); await p.waitForTimeout(300);
check(await p.isHidden('#detailsDialog') && await p.evaluate(() => location.hash) === '#stats', 'פרטי אולם: חזרה סוגרת את החלון ונשארת בלשונית');
await p.click('.details-btn >> nth=0'); await p.waitForSelector('#detailsDialog[open]');
await p.click('[data-act=days]'); await p.waitForTimeout(800);
check(await p.evaluate(() => location.hash) === '#stats' && (await p.textContent('#daysTitle')).startsWith('לפי יום: '), 'פרטי אולם: מעבר ל"לפי יום" של האולם');
await p.click('button[data-tab=calls]'); await p.waitForSelector('#callsList tr');
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

// ---- מיילים ----
await p.click('button[data-tab=mails]'); await p.waitForSelector('#mailList tr .bad');
check(await p.$$eval('#mailList tr', (t) => t.length) === 6, 'מיילים: 6 שורות');
await p.click('#mailView button[data-value=bad]'); await p.waitForTimeout(200);
check(await p.$$eval('#mailList tr', (t) => t.length) === 1, 'מיילים: סינון "לא נשלחו"');
await p.click('#mailView button[data-value=all]');
await p.fill('#mailSearch', 'hall1@'); await p.waitForTimeout(200);
check(await p.$$eval('#mailList tr', (t) => t.length) === 1, 'מיילים: חיפוש לפי כתובת');
await p.fill('#mailSearch', '');
await p.click('#mailList .hall-link >> nth=0'); await p.waitForSelector('#detailsDialog[open]');
check(await p.textContent('#detailsBody [data-act=calls]') === 'יומן השיחות של האולם' && !(await p.$('#detailsBody [data-act=days]')), 'מיילים: האולם נפתח בחלון הפרטים עם כפתור ליומן השיחות');
await p.click('#detailsBody [data-act=calls]'); await p.waitForTimeout(500);
check(await p.getAttribute('button[data-tab=calls]', 'aria-selected') === 'true', 'מיילים: הכפתור מעביר ליומן השיחות');

// ---- ניקוד הקראה ----
await p.click('button[data-tab=halls]'); await p.waitForSelector('.hall-card');
await p.click('#openNikud'); await p.waitForSelector('#nikudMissing tr[data-word]');
check(await p.isVisible('#nikudBanner') && (await p.textContent('#nikudBannerText')).includes('מציע ניקוד') && await p.$eval('#nikudMissing .nk-input', (i) => i.placeholder === 'מציע ניקוד…'), 'ניקוד: בזמן הטעינה מוצג חיווי (פס והשדות "מציע ניקוד…")');
check(await p.getAttribute('button[data-tab=halls]', 'aria-selected') === 'true', 'ניקוד: הלשונית "ניהול אולמות" נשארת מסומנת');
const missingBefore = await p.$$eval('#nikudMissing tr[data-word]', (t) => t.length);
check(missingBefore > 0 && await p.$$eval('#nikudMissing td.word', (t) => t.some((x) => x.textContent.includes('בני ברק'))), 'ניקוד: מוצעים שמות בלי ניקוד (כולל עיר)');
check(!(await p.$$eval('#nikudMissing td.word', (t) => t.some((x) => x.textContent.trim().startsWith('ירושלים ')))), 'ניקוד: שם שכבר מנוקד בטבלה לא מוצע');
check(await p.$$eval('#nikudMissing td.word', (t) => t.some((x) => x.textContent.includes('בית שמש'))), 'ניקוד: ביטוי של שתי מילים מוצע כשלם');
// הצעות OpenAI נכנסות לשדות (כטיוטה) מעצמן
await p.waitForSelector('#nikudBanner', { state: 'hidden' });
check(true, 'ניקוד: החיווי נעלם אחרי שההצעות הגיעו');
await p.waitForFunction(() => document.querySelector('#nikudMissing .nk-input').value !== '');
const first = await p.inputValue('#nikudMissing tr[data-word] .nk-input >> nth=0');
check(first.length > 0 && await p.$eval('#nikudMissing tr[data-word] .nk-input', (i) => i.classList.contains('suggested')), 'ניקוד: הצעה מתמלאת אוטומטית וסומנה כהצעה');
check(await p.$$eval('#nikudMissing tr[data-word] .nk-input', (t) => t.every((i) => i.value !== '')), 'ניקוד: הצעה בכל השורות');
// רענון: האפשרות הבאה מהרשימה (מיידי), ואחרי שנגמרו - אפשרויות חדשות; בלי חזרות
const seenValues = new Set([first]);
let repeated = false;
for (let i = 0; i < 5; i++) {
  await p.click('#nikudMissing tr[data-word] .nk-refresh >> nth=0'); await p.waitForTimeout(350);
  const v = await p.inputValue('#nikudMissing tr[data-word] .nk-input >> nth=0');
  if (seenValues.has(v)) repeated = true;
  seenValues.add(v);
}
check(!repeated && seenValues.size === 6, 'ניקוד: חמישה רענונים רצופים נותנים חמש אפשרויות שונות (גם אחרי שנגמרה הרשימה הראשונה)');
// הצעה שנערכה ידנית לא נדרסת, ושמירה מעבירה לרשימת הנשמרים
const savedBefore = await p.$$eval('#nikudList tr[data-word]', (t) => t.length);
await p.fill('#nikudMissing tr[data-word] .nk-input >> nth=0', 'ניקוד לדוגמה');
await p.click('#nikudMissing tr[data-word] .nk-save >> nth=0'); await p.waitForTimeout(400);
check(await p.$$eval('#nikudList tr[data-word]', (t) => t.length) === savedBefore + 1, 'ניקוד: שמירה מעבירה את השם לרשימת הנשמרים');
check(await p.$$eval('#nikudMissing tr[data-word]', (t) => t.length) === missingBefore - 1, 'ניקוד: השם יוצא מההצעות');
// מחיקה: ריקון השדה ושמירה
p.once('dialog', (d) => d.accept());
await p.fill('#nikudList tr[data-word] .nk-input >> nth=0', '');
await p.click('#nikudList tr[data-word] .nk-save >> nth=0'); await p.waitForTimeout(400);
check(await p.$$eval('#nikudList tr[data-word]', (t) => t.length) === savedBefore, 'ניקוד: ריקון השדה ושמירה מוחקים את הניקוד');
await p.fill('#nikudSearch', 'ירושלים'); await p.waitForTimeout(200);
check(await p.$$eval('#nikudList tr[data-word]', (t) => t.length) === 1, 'ניקוד: חיפוש');
await p.fill('#nikudSearch', '');

// ייבוא אולמות: גוררים (בוחרים) קובץ, ורואים מה כבר במערכת, מה לבדוק ומה חדש
await p.click('button[data-tab=halls]'); await p.click('#openImport'); await p.waitForSelector('#importDrop');
check(await p.getAttribute('button[data-tab=halls]', 'aria-selected') === 'true' && await p.$('button[data-tab=import]') === null, 'ייבוא: נפתח מ"ניהול אולמות", בלי כפתור בתפריט, והלשונית "ניהול אולמות" נשארת מסומנת');
const sysHalls = await p.evaluate(() => fetch('/admin/api/halls').then((r) => r.json()));
const h0 = sysHalls[0], h1 = sysHalls[1];
const HEAD = ['שם אולם', 'שם בית כנסת', 'שכונה', 'כתובת מדויקת', 'טלפון / פלאפון', 'עיר', 'קטגוריה', 'מקסימום אורחים', 'הערות', 'מקור', 'מקור מקורי', 'מס׳ קבוצה'];
const line = (o) => HEAD.map((_, i) => o[i] ?? '');
const xlsx = buildXlsx([HEAD,
  line({ 0: h0.name, 5: h0.city_name, 4: h0.gabbai_phone, 3: h0.address }),         // כבר במערכת (שם, עיר, טלפון וכתובת)
  line({ 0: 'שם אחר לגמרי', 5: 'חיפה', 4: h1.gabbai_phone }),                      // אותו טלפון: לבדיקה
  line({ 0: 'אולם בדיקה חדש', 5: 'חיפה', 3: 'הנביאים 1, חיפה', 4: '04-8888888', 7: '90' }),
  line({ 0: sysHalls[2].name, 5: sysHalls[2].city_name, 4: sysHalls[2].gabbai_phone, 3: sysHalls[2].address, 10: 'מקור א', 11: '5' }),   // קבוצה: חבר אחד כבר במערכת
  line({ 0: 'אולם אחר בקבוצה', 5: 'חיפה', 10: 'מקור ב', 11: '5' }),                                              // ...ולכן גם הוא (עד שמפרידים)
]);
await p.setInputFiles('#importFile', { name: 'halls.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(xlsx) });
await p.waitForSelector('#importList tr.imp');
check(await p.$$eval('#importList tr.imp', (t) => t.length) === 2, 'ייבוא: ברירת המחדל "לטיפול" מציגה רק מה שלא במערכת');
await p.click('#importView button[data-value=all]');
const impBadges = await p.$$eval('#importList tr.imp .badge:first-child', (t) => t.map((x) => x.textContent.trim()));
check(impBadges.join() === 'כבר במערכת,לבדיקה,חדש,כבר במערכת,כבר במערכת', `ייבוא: סטטוסים, וקבוצה שחבר בה כבר במערכת (${impBadges.join()})`);
// הפרדה מקבוצה: "לא כפול" בודק את השורה לבד, והיא חוזרת לקבוצה בלחיצה נוספת
await p.click('#importList tr.imp >> nth=4 >> .split');
check(await p.textContent('#importList tr.imp >> nth=4 >> .badge') === 'חדש' && (await p.textContent('#importList tr.imp >> nth=4 >> .why')).includes('הופרד מקבוצה 5'), 'ייבוא: "לא כפול" מפריד שורה מהקבוצה ובודק אותה לבד');
check(await p.$$eval('#importList .split', (t) => t.length) === 0, 'ייבוא: בקבוצה שנשארה בה שורה אחת אין כפתור הפרדה');
await p.click('#importList tr.imp >> nth=4 >> .unsplit');
check(await p.textContent('#importList tr.imp >> nth=4 >> .badge') === 'כבר במערכת', 'ייבוא: "החזר לקבוצה" מחזיר את השורה');
await p.click('#importList tr.imp >> nth=4 >> .split');
// "מעבר לאולם": פותח את חלון פרטי האולם שבמערכת
await p.click('#importList tr.imp >> nth=0 >> .goto');
await p.waitForSelector('#detailsDialog[open]');
check((await p.textContent('#detailsDialog')).includes(h0.name), 'ייבוא: "מעבר לאולם" פותח את חלון פרטי האולם');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.click('#importView button[data-value=new]');
await p.click('#importList tr.imp .add');
check(await p.inputValue('#hallForm [name=name]') === 'אולם בדיקה חדש' && await p.inputValue('#hallForm [name=gabbai_phone]') === '048888888' && await p.inputValue('#hallForm [name=max_guests]') === '90', 'ייבוא: "הוסף למערכת" ממלא את טופל האולם');
await p.click('.actions .btn[value=cancel]');
await p.click('#importList tr.imp .mark');
check(await p.$$eval('#importList tr.imp', (t) => t.length) === 1, 'ייבוא: "סמן כטופל" מוריד את השורה מהרשימה (נשארת רק השורה שהופרדה)');
await p.click('#importView button[data-value=done]');
check(await p.$$eval('#importList tr.imp', (t) => t.length) === 1, 'ייבוא: השורה שסומנה מופיעה ב"טופלו"');
await p.click('#importList tr.imp .mark');

// וואטסאפ, צ'אט ואתר: נפתח מ"שיחות לפי אולם", בלי כפתור בתפריט
await p.click('button[data-tab=stats]'); await p.click('#openChannels'); await p.waitForSelector('#channelDays tr');
check(await p.getAttribute('button[data-tab=stats]', 'aria-selected') === 'true' && await p.isVisible('#range'), 'ערוצים: נפתח מ"שיחות לפי אולם", הלשונית מסומנת וטווח התאריכים מוצג');
check((await p.textContent('#channelTotals')).includes('42') && (await p.textContent('#channelTotals')).includes('260 כניסות'), 'ערוצים: סיכום לכל ערוץ');
const dayRow = await p.$$eval('#channelDays tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ')));
check(dayRow.length === 10 && dayRow[1].includes('1 קיבלו פרטי אולם'), 'ערוצים: לפי יום, כולל כמה קיבלו פרטי אולם');
await p.selectOption('#channelDaysSort select', 'whatsappFound');
const foundCol = await p.$$eval('#channelDays td:nth-child(2) small', (t) => t.map((x) => parseInt(x.textContent, 10)));
check(foundCol.every((v, i) => !i || foundCol[i - 1] >= v), 'ערוצים: מיון לפי "קיבלו פרטי אולם"');
await p.selectOption('#channelDaysSort select', 'day');
check(await p.$$eval('#channelVisits tr', (t) => t.length) === 4 && (await p.textContent('#channelVisits')).includes('דף הבית'), 'ערוצים: כניסות לפי דף');
await p.click('#channelVisitView button[data-value=source]');
check((await p.textContent('#channelVisits')).includes('google.com') && (await p.textContent('#channelVisits')).includes('כניסה ישירה') && (await p.textContent('#channelVisits')).includes('הקישור מהוואטסאפ שלך'), 'ערוצים: מאיפה הגיעו (כולל הקישור המיוחד)');
await p.fill('#channelVisitSearch', 'google'); check(await p.$$eval('#channelVisits tr', (t) => t.length) === 1, 'ערוצים: חיפוש');
await p.fill('#channelVisitSearch', '');
await p.click('.channel-visits th[data-sort=visits]');
const visitsCol = await p.$$eval('#channelVisits td.total', (t) => t.map((x) => Number(x.textContent.replace(/,/g, ''))));
check(visitsCol.every((v, i) => !i || visitsCol[i - 1] <= v), 'ערוצים: מיון לפי כניסות (כותרת)');
await p.click('#channelVisitView button[data-value=page]');
// איפוס: ביטול באישור לא מוחק; אישור מוחק ומציג אפסים
p.once('dialog', (d) => d.dismiss()); await p.click('#resetChannels'); await p.waitForTimeout(300);
check((await p.textContent('#channelTotals')).includes('42'), 'ערוצים: ביטול האיפוס לא מוחק');
p.once('dialog', (d) => { check(d.message().includes('אי אפשר לשחזר'), 'ערוצים: האיפוס שואל אישור'); d.accept(); });
await p.click('#resetChannels'); await p.waitForTimeout(700);
check(!(await p.textContent('#channelTotals')).includes('42') && (await p.textContent('#channelDays')).includes('אין פעילות'), 'ערוצים: אחרי איפוס הכול ריק');
await fetch(new URL('/__reset', base)).catch(() => {});
await p.click('#back'); await p.waitForTimeout(600);
check(await p.evaluate(() => location.hash) === '#stats', 'ערוצים: חזרה ל"שיחות לפי אולם"');

// איפוס השיחות הטלפוניות: ביטול לא מוחק; אישור מאפס את הסטטיסטיקה
await p.click('button[data-tab=stats]'); await p.waitForSelector('#hallStats tr.clickable');
p.once('dialog', (d) => d.dismiss()); await p.click('#resetCalls'); await p.waitForTimeout(300);
check(await p.$$eval('#hallStats td.total', (t) => t.some((x) => x.textContent.trim() !== '0')), 'שיחות: ביטול האיפוס לא מוחק');
p.once('dialog', (d) => { check(d.message().includes('יומן המיילים'), 'שיחות: האיפוס שואל אישור ואומר מה נשאר'); d.accept(); });
await p.click('#resetCalls'); await p.waitForTimeout(800);
check(await p.$$eval('#hallStats td.total', (t) => t.every((x) => x.textContent.trim() === '0')) && (await p.textContent('#totals')).includes('0'), 'שיחות: אחרי איפוס כל המספרים אפס');
await fetch(new URL('/__reset', base)).catch(() => {});

// ---- אייפון ----
const m = await open(devices['iPhone 14']);
for (const tab of ['stats', 'calls', 'halls', 'voicemails', 'mails', 'import', 'nikud', 'channels']) {
  await m.goto(`${base}#${tab}`); await m.waitForTimeout(600);
  check(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `אייפון (${tab}): בלי גלילה אופקית`);
  const narrow = await m.$$eval('.sortbox', (t) => t.filter((x) => x.offsetParent && x.getBoundingClientRect().width < 120).map((x) => x.id));
  check(!narrow.length, `אייפון (${tab}): תיבת המיון לא נדחסת ${narrow.join(' ')}`);
}

await browser.close();
console.log(failed ? `${failed} נכשלו` : 'הכול עבר');
process.exit(failed ? 1 : 0);

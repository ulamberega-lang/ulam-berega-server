// בדיקת דפדפן לאתר ההוספה של העובד (/staff) ולאישור באתר הניהול, מול השרת האמיתי עם מסד נתונים מדומה (dev/sim).
// לא צריך שרת נפרד: הבדיקה מפעילה את השרת בעצמה. דורש Playwright.
// הרצה: NODE_PATH=$(npm root -g) node dev/smoke-staff.mjs   (SHOTS=<תיקייה> שומר צילומי מסך)
import { boot, seedHalls, hallsChanged, sleep, db } from './sim/harness.mjs'; // ראשון: מחליף את Supabase
import { createRequire } from 'node:module';
import { buildXlsx } from './make-xlsx.mjs';

const require = createRequire(`${process.env.NODE_PATH || ''}/`);
const { chromium, devices } = require('playwright');
const shots = process.env.SHOTS;

const hall = (name, extension, city, hood, phone, address, guests) => ({ name, extension, city_name: city, neighborhood_name: hood, gabbai_phone: phone, address, max_guests: guests, is_active: true });
seedHalls([hall('היכל שמחה', '101', 'ירושלים', 'גאולה', '0501111111', 'רחוב א 1', 150), hall('אולם הדר', '201', 'בני ברק', 'רמת אלחנן', '0502222222', 'רחוב ב 2', 200)]);
hallsChanged(); await sleep(50);
const app = await boot();
const browser = await chromium.launch();
let failed = 0;
const check = (ok, message) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', message); };

async function open(options) {
  const page = await (await browser.newContext(options)).newPage();
  page.on('pageerror', (e) => { failed++; console.log('FAIL page error:', e.message); });
  page.on('dialog', (d) => d.accept());
  await page.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  return page;
}
async function login(page, area, password) {
  await page.goto(`${app.base}/${area}/`);
  check(page.url().endsWith(`/${area}/login`), `${area}: בלי כניסה - דף הכניסה`);
  await page.fill('#password', password);
  await page.click('#go');
  await page.waitForURL(`${app.base}/${area}/**`);
  await page.waitForTimeout(500);
}

// ---- העובד ----
const p = await open({ viewport: { width: 1280, height: 860 } });
await login(p, 'staff', 'staffpw');
check(await p.isVisible('#importDrop'), 'עובד: נפתח על ייבוא מאקסל');
await p.click('button[data-tab=halls]');
check((await p.$$eval('#hallsList tr', (t) => t.length)) === 2, 'עובד: רואה את האולמות שבמערכת');
await p.fill('#hallsSearch', 'הדר'); await p.waitForTimeout(200);
check((await p.$$eval('#hallsList tr', (t) => t.length)) === 1, 'עובד: חיפוש באולמות');
await p.fill('#hallsSearch', '');

// אולם חדש בטופס
await p.click('#addHall');
await p.fill('#hallForm [name=name]', 'אולם טופס');
await p.fill('#hallForm [name=city_name]', 'ירושלים');
await p.fill('#hallForm [name=max_guests]', '120');
await p.fill('#hallForm [name=gabbai_phone]', '052-333-4444');
await p.fill('#hallForm [name=note]', 'מהטלפון');
await p.click('#hallForm [value=save]'); await p.waitForTimeout(600);
check(db.hall_submissions.length === 1 && db.halls.length === 2, 'עובד: הטופס נשלח לאישור ולא נכנס למערכת');
check(await p.textContent('#pendingBadge') === '1', 'עובד: מונה "ממתינים"');

// ייבוא: שורה שכבר נשלחה מזוהה, שורה חדשה נשלחת מהטופס
const HEAD = ['שם אולם', 'בית כנסת', 'שכונה', 'כתובת', 'טלפון', 'עיר', 'קטגוריה', 'מקסימום אורחים', 'הערות', 'מקור', 'מקור מקורי', 'מס׳ קבוצה'];
const xlsx = buildXlsx([HEAD,
  ['היכל שמחה', '', 'גאולה', 'רחוב א 1', '0501111111', 'ירושלים', '', '150', '', 's', 'o1', ''],
  ['אולם טופס', '', '', '', '0523334444', 'ירושלים', '', '120', '', 's', 'o2', ''],
  ['אולם מקובץ', '', 'רמות', 'רחוב ג 3', '0525556666', 'ירושלים', '', '80', '', 's', 'o3', '']]);
await p.click('button[data-tab=import]');
await p.setInputFiles('#importFile', { name: 'halls.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(xlsx) });
await p.waitForSelector('#importList tr.imp');
await p.click('#importView button[data-value=all]');
const text = await p.textContent('#importList');
check(text.includes('נשלח לאישור'), 'עובד: אולם שכבר נשלח מזוהה בייבוא ("נשלח לאישור")');
if (shots) await p.screenshot({ path: `${shots}/staff-import.png`, fullPage: true });
await p.click('#importView button[data-value=new]');
await p.click('#importList tr.imp .add');
check(await p.inputValue('#hallForm [name=name]') === 'אולם מקובץ' && await p.inputValue('#hallForm [name=gabbai_phone]') === '0525556666', 'עובד: "הוסף למערכת" ממלא את הטופס מהקובץ');
await p.click('#hallForm [value=save]'); await p.waitForTimeout(600);
check(db.hall_submissions.length === 2, 'עובד: נשלח מהקובץ');
await p.click('button[data-tab=mine]');
check((await p.$$eval('#mineList tr[data-id]', (t) => t.length)) === 2 && (await p.textContent('#mineList')).includes('ממתין לאישור'), 'עובד: "מה ששלחתי" מציג את שתי ההגשות');
if (shots) await p.screenshot({ path: `${shots}/staff-mine.png`, fullPage: true });

// ---- בעל המערכת: אישור אחד, דחייה של השני ----
const a = await open({ viewport: { width: 1280, height: 860 } });
await login(a, 'admin', 'pw');
await a.click('button[data-tab=halls]'); await a.waitForTimeout(300);
check(await a.textContent('#pendingBadge') === '2', 'ניהול: מונה "לאישור"');
await a.click('#openPending'); await a.waitForSelector('#pendingList tr[data-id]');
if (shots) await a.screenshot({ path: `${shots}/admin-pending.png`, fullPage: true });
const first = db.hall_submissions.find((s) => s.data.name === 'אולם טופס');
await a.click(`#pendingList tr[data-id="${first.id}"] .approve`);
check(await a.inputValue('#hallForm [name=extension]') === '102', 'ניהול: שלוחה מוצעת לפי העיר (ירושלים 1xx)');
if (shots) await a.screenshot({ path: `${shots}/admin-approve.png` });
await a.click('#hallForm [value=save]'); await a.waitForTimeout(800);
check(db.halls.some((h) => h.name === 'אולם טופס' && h.extension === '102') && first.status === 'approved', 'ניהול: האישור יצר אולם עם השלוחה');
const second = db.hall_submissions.find((s) => s.data.name === 'אולם מקובץ');
await a.click(`#pendingList tr[data-id="${second.id}"] .reject`); await a.waitForTimeout(500);
check(second.status === 'rejected', 'ניהול: דחייה');

// העובד רואה את התוצאה
await p.reload(); await p.waitForTimeout(600);
await p.click('#mineView button[data-value=all]');
const mine = await p.textContent('#mineList');
check(mine.includes('אושר') && mine.includes('נדחה'), 'עובד: רואה מה אושר ומה נדחה');

// ---- אייפון ----
const m = await open(devices['iPhone 14']);
await login(m, 'staff', 'staffpw');
for (const tab of ['import', 'mine', 'halls']) {
  await m.goto(`${app.base}/staff/#${tab}`); await m.waitForTimeout(500);
  check(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `אייפון (${tab}): בלי גלילה אופקית`);
  if (shots) await m.screenshot({ path: `${shots}/staff-phone-${tab}.png`, fullPage: true });
}
await m.click('#addHall');
if (shots) await m.screenshot({ path: `${shots}/staff-phone-form.png` });

await browser.close();
await app.close();
console.log(failed ? `${failed} נכשלו` : 'הכול עבר');
process.exit(failed ? 1 : 0);

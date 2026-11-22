// בדיקת דפדפן לדף הגדרות השרת (/admin/settings.html) מול השרת האמיתי עם מסד ו-Render מדומים. דורש Playwright.
// הרצה: NODE_PATH=$(npm root -g) node dev/smoke-settings.mjs   (SHOTS=<תיקייה> שומר צילומי מסך)
import { boot, renderEnv, renderDeploys } from './sim/harness.mjs'; // ראשון: מחליף את Supabase
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.NODE_PATH || ''}/`);
const { chromium, devices } = require('playwright');
const shots = process.env.SHOTS;
renderEnv.set('OWNER_PHONES', process.env.OWNER_PHONES);
renderEnv.set('MAIL_FROM', process.env.MAIL_FROM);
process.env.OPENAI_API_KEY = 'sk-abcdefghijklmnop1234'; // כמו שהשרת עובד איתו, כדי שלא ייראה "ממתין"
renderEnv.set('OPENAI_API_KEY', process.env.OPENAI_API_KEY);
renderEnv.set('ADMIN_PASSWORD', 'pw');
renderEnv.set('RENDER_API_KEY', 'rnd-key');

const app = await boot();
const browser = await chromium.launch();
let failed = 0;
const check = (ok, message) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', message); };

for (const [name, opts] of [['desk', { viewport: { width: 1280, height: 900 } }], ['phone', devices['iPhone 14']]]) {
  const page = await (await browser.newContext(opts)).newPage();
  page.on('pageerror', (e) => { failed++; console.log('FAIL page error:', e.message); });
  page.on('dialog', (d) => d.accept());
  await page.goto(`${app.base}/admin/login`);
  await page.fill('#password', 'pw'); await page.click('#go'); await page.waitForURL(`${app.base}/admin/**`);
  await page.click('#settings'); await page.waitForSelector('#list section');
  if (name === 'desk') check(await page.isHidden('#banner'), 'desk: בלי שינויים - בלי פס "ממתין"'); // בטלפון כבר יש שינוי מהמחשב
  check(!(await page.content()).includes('abcdefghijklmnop'), `${name}: ערך סודי לא בדף`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${name}: בלי גלילה אופקית`);
  if (name === 'desk') {
    const owner = page.locator('#list section', { hasText: 'OWNER_PHONES' });
    await owner.locator('input').fill('0525645458,0501234567,0547654321');
    await owner.getByText('שמור').click(); await page.waitForTimeout(400);
    check(renderEnv.get('OWNER_PHONES') === '0525645458,0501234567,0547654321', 'desk: שמירה עדכנה את Render');
    check(await page.isVisible('#banner') && (await page.textContent('#list')).includes('ממתין להפעלה מחדש'), 'desk: פס ותגית "ממתין"');
    await page.fill('#search', 'חייגן'); await page.waitForTimeout(100);
    check((await page.$$eval('#list section', (s) => s.length)) === 1, 'desk: חיפוש לפי תיאור');
    await page.fill('#search', '');
    await page.click('#deploy'); await page.waitForTimeout(300);
    check(renderDeploys.length === 1, 'desk: הפעלה מחדש נשלחה');
  }
  if (shots) await page.screenshot({ path: `${shots}/settings-${name}.png`, fullPage: true });
  if (name === 'phone') {
    await page.goto(`${app.base}/admin/`); await page.waitForTimeout(400);
    if (shots) await page.screenshot({ path: `${shots}/settings-header-${name}.png` });
  }
}
await browser.close();
await app.close();
console.log(failed ? `${failed} נכשלו` : 'הכול עבר');
process.exit(failed ? 1 : 0);

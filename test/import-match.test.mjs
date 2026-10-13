// ייבוא אולמות מאקסל: קריאת הקובץ והשוואה לאולמות שכבר במערכת
import test from 'node:test';
import assert from 'node:assert/strict';
import { readXlsx } from '../public/admin/js/xlsx.js';
import { parseRows, matchAll, phonesOf, addressKey, nameScore, hallDraft } from '../public/admin/js/import-match.js';
import { buildXlsx } from '../dev/make-xlsx.mjs';

const HEADER = ['שם אולם', 'שם בית כנסת', 'שכונה', 'כתובת מדויקת', 'טלפון / פלאפון', 'עיר', 'קטגוריה', 'מקסימום אורחים', 'הערות', 'מקור', 'מקור מקורי', 'מס׳ קבוצה'];
const row = (o) => HEADER.map((_, i) => o[i] ?? '');
const HALLS = [
  { id: 1, name: 'היכל משה / אולם דוד', city_name: 'ירושלים', address: 'רחוב הרב קוק 5', gabbai_phone: '0501111111', synagogue_name: null, max_guests: 300 },
  { id: 2, name: 'אולם שמחה', city_name: 'בני ברק', address: 'רבי עקיבא 10', gabbai_phone: '0522222222', synagogue_name: 'בית אהרן' },
];

test('קורא xlsx: טקסט, תווים מיוחדים ותאים ריקים באמצע שורה', async () => {
  const bytes = buildXlsx([HEADER, row({ 0: 'אולם "א" & ב', 3: 'רח\' 1', 4: '050-1', 7: '120' })]);
  const rows = await readXlsx(bytes.buffer);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'אולם "א" & ב');
  assert.equal(rows[1][1], '');          // תא ריק באמצע נשאר במקומו
  assert.equal(rows[1][3], "רח' 1");
  assert.equal(rows[1][7], '120');
  await assert.rejects(() => readXlsx(new TextEncoder().encode('לא zip').buffer), /אקסל/);
});

test('טלפונים וכתובות', () => {
  assert.deepEqual(phonesOf('+972 3-533-2480 / 050-411-4282'), ['035332480', '0504114282']);
  assert.deepEqual(phonesOf('לא מספר'), []);
  assert.equal(addressKey('רח\' הרב קוק 5, ירושלים, ישראל', 'ירושלים'), addressKey('הרב קוק 5', 'ירושלים'));
  assert.equal(addressKey('אופקים', 'אופקים'), '');   // בלי מספר בית אין מפתח
  assert.equal(nameScore('אולמי דוד', 'דוד'), 2);      // "אולמי" מילה כללית
  assert.equal(nameScore('אחיעזר אלעד', 'אחיעזר'), 1);
  assert.equal(nameScore('היכל משה', 'היכל שמחה'), 0);
});

test('השוואה למערכת: כבר במערכת רק אם כל העמודות הקיימות תואמות', async () => {
  const bytes = buildXlsx([HEADER,
    row({ 0: 'אולם דוד', 5: 'ירושלים', 4: '050-111-1111', 3: 'הרב קוק 5', 7: '300' }),   // כל מה שיש בקובץ תואם
    row({ 0: 'אולם דוד', 5: 'ירושלים', 4: '02-111-2222' }),                               // שם ועיר זהים אבל הטלפון שונה
    row({ 0: 'אולם דוד', 5: 'ירושלים', 4: '050-111-1111', 7: '120' }),                  // מקסימום אורחים שונה
    row({ 0: 'אולם דוד', 5: 'ירושלים' }),                                               // שם ועיר בלבד: לא מספיק כדי לאשר
    row({ 0: 'אולם דוד', 5: 'ירושלים', 4: '050-111-1111' }),                            // שם, עיר וטלפון: חסרה כתובת
    row({ 0: 'שם אחר לגמרי', 5: 'ירושלים', 4: '050-1111111' }),                        // אותו טלפון, שם שונה
    row({ 0: 'אולם חדש', 5: 'חיפה', 3: 'הנביאים 1, חיפה', 4: '04-8888888' }),
    row({ 0: 'משהו', 5: 'בני ברק', 3: 'רבי עקיבא 10' }),                                // אותה כתובת
    row({ 0: 'בית אהרן', 5: 'בני ברק', 4: '052-222-2222' }),                           // שם בית הכנסת, עיר וטלפון
    row({ 0: 'אולם דוד', 5: 'חיפה' }),                                                  // שם זהה בעיר אחרת
    row({ 4: '052-3443508', 5: 'קיסריה', 8: 'ללא שם אולם בגיליון' }),                   // טלפון בלבד
    row({ 8: 'שורה ריקה' }),                                                            // בלי שם ובלי טלפון: מדולגת
  ]);
  const items = parseRows(await readXlsx(bytes.buffer));
  assert.equal(items.length, 11);
  const [full, phone, guests, nameCity, threeOfThem, samePhone, fresh, addr, syn, otherCity, phoneOnly] = matchAll(items, HALLS);
  assert.equal(full.status, 'in'); assert.equal(full.hall.id, 1);
  assert.equal(phone.status, 'maybe'); assert.ok(phone.reasons.join().includes('שונה: טלפון'));
  assert.equal(guests.status, 'maybe'); assert.ok(guests.reasons.join().includes('מקסימום אורחים'));
  assert.equal(nameCity.status, 'maybe'); assert.ok(nameCity.reasons.join().includes('חסר אישור: טלפון, כתובת'));   // שם ועיר בלבד
  assert.equal(threeOfThem.status, 'maybe'); assert.ok(threeOfThem.reasons.join().includes('חסר אישור: כתובת'));   // שם, עיר וטלפון בלי כתובת: לא מספיק
  assert.equal(samePhone.status, 'maybe'); assert.ok(samePhone.reasons.join().includes('טלפון'));
  assert.equal(fresh.status, 'new');
  assert.equal(addr.status, 'maybe'); assert.ok(addr.reasons.join().includes('כתובת'));
  assert.equal(syn.status, 'maybe'); assert.equal(syn.hall.id, 2);                             // בלי כתובת: לא מספיק, אבל מזוהה האולם
  assert.equal(otherCity.status, 'new');                       // שם בלבד, בלי עיר/טלפון/כתובת שמאשרים: לא קשור
  assert.equal(phoneOnly.status, 'new'); assert.equal(phoneOnly.item.name, '');
});

test('כל עמודה שיש בה ערך בשני הצדדים חייבת להתאים: כתובת, שכונה ובית כנסת', () => {
  const hall = { id: 9, name: 'אולם נועם', city_name: 'בני ברק', address: 'רבי עקיבא 10', neighborhood_name: 'פרדס כץ / זכרון מאיר', synagogue_name: 'בית אהרן', gabbai_phone: '0533333333', max_guests: 100 };
  const item = (o) => ({ ...parseRows([row({ 0: 'אולם נועם', 5: 'בני ברק', 4: '053-333-3333', ...o })])[0] });
  const status = (o) => matchAll([item(o)], [hall])[0];
  assert.equal(status({ 3: 'רבי עקיבא 10', 2: 'זכרון מאיר', 1: 'בית אהרן', 7: '100' }).status, 'in');
  assert.equal(status({ 3: 'רבי עקיבא 12' }).status, 'maybe');          // כתובת שונה
  assert.equal(status({ 2: 'גבעת רוקח' }).status, 'maybe');              // שכונה שונה
  assert.equal(status({ 1: 'בית אחר' }).status, 'maybe');                // בית כנסת שונה
  assert.ok(status({ 3: 'רבי עקיבא 12' }).reasons.join().includes('שונה: כתובת'));
});

test('קבוצות: אם חבר אחד כבר במערכת, כל הקבוצה כבר במערכת', () => {
  const g = (name, city, phone, address, group) => ({ ...parseRows([row({ 0: name, 5: city, 4: phone, 3: address, 11: group })])[0] });
  const rows = matchAll([g('אולם שמחה', 'בני ברק', '052-222-2222', 'רבי עקיבא 10', '7'), g('שמחה בני ברק מתחם', 'בני ברק', '', '', '7'), g('אולם זר', 'חיפה', '', '', '8')], HALLS);
  assert.deepEqual(rows.map((r) => r.groupStatus), ['in', 'in', 'new']);
  assert.equal(rows[1].groupHall.id, 2);                      // האולם שבגללו הקבוצה במערכת (למעבר אליו)
});

test('טיוטת אולם חדש: טלפון, מייל וכתובת בלי "ישראל"', () => {
  const [item] = parseRows([row({ 0: 'אולם', 3: 'הנביאים 1, חיפה, ישראל', 4: '+972 4-888-8888', 5: 'חיפה', 7: '150', 8: 'ליצירת קשר: a@b.co.il' })]);
  assert.deepEqual(hallDraft(item), { name: 'אולם', synagogue_name: '', city_name: 'חיפה', neighborhood_name: '', address: 'הנביאים 1, חיפה', max_guests: 150, gabbai_phone: '048888888', gabbai_email: 'a@b.co.il' });
});

// בדיקת קלט של טופס אולם (פונקציות נקיות). הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { hallFromBody, plainName, InputError } from '../src/lib/hall-input.js';

const ok = { name: 'אולם', city_name: 'ירושלים', max_guests: 100, extension: '101', gabbai_phone: '0501234567' };

test('plainName: מסיר ניקוד וטעמים, שומר מקף ורווח אחד', () => {
  assert.equal(plainName('יְרוּשָׁלַיִם'), 'ירושלים');
  assert.equal(plainName('בְּנֵי  בְּרַק'), 'בני ברק');
  assert.equal(plainName('בית־שמש'), 'בית־שמש');
  assert.equal(plainName(null), '');
});

test('hallFromBody: עיר ושכונה נשמרות בלי ניקוד (שכונות מופרדות ב-/ נשמרות)', () => {
  const hall = hallFromBody({ ...ok, city_name: 'יְרוּשָׁלַיִם', neighborhood_name: 'גְּאוּלָּה / בֵּית וָגָן' }, true);
  assert.equal(hall.city_name, 'ירושלים');
  assert.equal(hall.neighborhood_name, 'גאולה / בית וגן');
});

test('hallFromBody: גם שם אולם ושם בית כנסת נשמרים בלי ניקוד', () => {
  const hall = hallFromBody({ ...ok, name: 'הֵיכַל חֶמְדָּה', synagogue_name: 'אוֹהֶל דָּוִד' }, true);
  assert.equal(hall.name, 'היכל חמדה');
  assert.equal(hall.synagogue_name, 'אוהל דוד');
  assert.equal(hallFromBody({ synagogue_name: 'אוֹהֶל' }, false).synagogue_name, 'אוהל');   // גם בעריכה
});

test('hallFromBody: עיר שכולה ניקוד נחשבת ריקה', () => {
  assert.throws(() => hallFromBody({ ...ok, city_name: 'ְ' }, true), InputError);
});

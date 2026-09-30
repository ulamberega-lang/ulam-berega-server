// בדיקות להודעת "בעל אולם" (אפשרות 4 בתפריט הראשי). הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_PARTS, OWNER_OPTIONS } from '../src/ivr/owner-info.js';

test('ההודעה כוללת את כל מה שצריך לכלול במייל', () => {
  const text = OWNER_PARTS.join(' ');
  for (const part of ['שֵׁם הָאוּלָם', 'מִסְפַּר פֶּלֶאפוֹן לְהַזְמָנָה', 'כְּתוֹבֶת מְדֻיֶּקֶת', 'וּשְׁכוּנָה']) assert.ok(text.includes(part), part);
});

test('איות המייל: 10 אותיות ואחריהן שטרודל ג׳ימייל נקודה קום', () => {
  const start = OWNER_PARTS.findIndex((p) => p.startsWith('אִיּוּת'));
  assert.deepEqual(OWNER_PARTS.slice(start + 1, start + 11), ['יוּ', 'אֶל', 'הֵיי', 'אֶמם', 'בִּ', 'אִ', 'אָר', 'אִ', 'גִּ׳י', 'הֵיי']);
  assert.equal(OWNER_PARTS.length, start + 15);
});

test('כל קטע עובר ניקוי בלי תווים שמפרידים בפקודות ימות', () => {
  for (const part of [...OWNER_PARTS, ...OWNER_OPTIONS]) assert.ok(!/[.,=&"'|]/.test(part), part);
});

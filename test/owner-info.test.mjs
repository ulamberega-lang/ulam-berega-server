// בדיקות להודעת "בעל אולם" (אפשרות 4 בתפריט הראשי). הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_PARTS, OWNER_OPTIONS } from '../src/ivr/owner-info.js';

test('ההודעה כוללת את כל מה שצריך לכלול במייל', () => {
  const text = OWNER_PARTS.join(' ');
  for (const part of ['שֵׁם הָאוּלָם', 'מִסְפַּר פֶּלֶאפוֹן לְהַזְמָנָה', 'כְּתוֹבֶת מְדֻיֶּקֶת', 'וּשְׁכוּנָה']) assert.ok(text.includes(part), part);
});

test('איות המייל: 10 אותיות, כל אחת: האות, "כמו" והמילה (קטעים נפרדים), ואחריהן שטרודל ג׳ימייל נקודה קום', () => {
  const start = OWNER_PARTS.findIndex((p) => p.startsWith('אִיּוּת'));
  assert.deepEqual(OWNER_PARTS.slice(start + 1, start + 31), [
    'יוּ',
    'כְּמוֹ',
    'אוּלָם',
    'אֶל',
    'כְּמוֹ',
    'לֶחֶם',
    'אֵיי',
    'כְּמוֹ',
    'אַבָּא',
    'אֶם',
    'כְּמוֹ',
    'מַמְתָּק',
    'בִּי',
    'כְּמוֹ',
    'בָּרוּךְ',
    'אִי',
    'כְּמוֹ',
    'אֶצְבַּע',
    'אָר',
    'כְּמוֹ',
    'רָחֵל',
    'אִי',
    'כְּמוֹ',
    'אֶצְבַּע',
    'גִּ׳י',
    'כְּמוֹ',
    'גָּמָל',
    'אֵיי',
    'כְּמוֹ',
    'אַבָּא',
  ]);
  assert.equal(OWNER_PARTS.length, start + 35);
});

test('כל קטע עובר ניקוי בלי תווים שמפרידים בפקודות ימות', () => {
  for (const part of [...OWNER_PARTS, ...OWNER_OPTIONS]) assert.ok(!/[.,=&"'|]/.test(part), part);
});

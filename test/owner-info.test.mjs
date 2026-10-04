// בדיקות להודעת "בעל אולם" (אפשרות 4 בתפריט הראשי). הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_PARTS, OWNER_OPTIONS } from '../src/ivr/owner-info.js';

test('ההודעה כוללת את כל מה שצריך לכלול במייל', () => {
  const text = OWNER_PARTS.join(' ');
  for (const part of ['שֵׁם הָאוּלָם', 'מִסְפַּר פֶּלֶאפוֹן לְהַזְמָנָה', 'שְׁכוּנָה', 'מְדֻיֶּקֶת']) assert.ok(text.includes(part), part);
});

test('איות המייל (simchabesicha): 13 אותיות, כל אחת: האות, "כמו" והמילה (קטעים נפרדים), ואחריהן שטרודל ג׳ימייל נקודה קום', () => {
  const letters = [
    ['אֶס', 'שִׂמְחָה'], ['I', 'יִשְׂרָאֵל'], ['אֶם', 'מַמְתָּק'], ['סִי', 'כִּסֵּא'], ['H', 'הַר'], ['A', 'אַבָּא'],
    ['בִּי', 'בַּמְבָּה'], ['אִי', 'אֶצְבַּע'], ['אֶס', 'שִׂמְחָה'], ['I', 'יִשְׂרָאֵל'], ['סִי', 'כִּסֵּא'], ['H', 'הַר'], ['A', 'אַבָּא'],
  ];
  const start = OWNER_PARTS.findIndex((p) => p.startsWith('אִיּוּת'));
  assert.deepEqual(OWNER_PARTS.slice(start + 1, start + 1 + letters.length * 3), letters.flatMap(([name, word]) => [name, 'כְּמוֹ', word]));
  assert.deepEqual(OWNER_PARTS.slice(-4), ['שׁטְרוּדֶל', 'גִּ׳ימֵייל', 'נְקֻדָּה', 'קוֹם']);
  assert.equal(OWNER_PARTS.length, start + 1 + letters.length * 3 + 4);
});

test('כל קטע עובר ניקוי בלי תווים שמפרידים בפקודות ימות', () => {
  for (const part of [...OWNER_PARTS, ...OWNER_OPTIONS]) assert.ok(!/[.,=&"'|]/.test(part), part);
});

// בדיקות לשלוחת "בעל אולם" (הקראה איטית בשלוחה נפרדת). הרצה: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerReply, goToOwnerExt, ownerRestart, OWNER_PARTS } from '../src/ivr/owner-info.js';

const decode = (s) => decodeURIComponent(s);

test('המעבר מהתפריט הראשי: הולך לשלוחה, ומסמן חזרה לתפריט', () => {
  const s = {};
  const out = goToOwnerExt(s, '/7');
  assert.match(out, /go_to_folder=\/7$/);
  assert.equal(s.ownerArrive, true);
  assert.equal(s.back, true);
});

test('הגעה ראשונה: מקריאים את ההודעה ומחכים להקשה (own1)', () => {
  const s = { ownerArrive: true, back: true };
  const out = ownerReply(s, {});
  assert.match(out, /^read=/);
  assert.match(out, /=own1,no,1,1,7,No,no,no,,$/);
  for (const part of ['שֵׁם הָאוּלָם', 'כְּתוֹבֶת מְדֻיֶּקֶת', 'קוֹם']) assert.ok(out.includes(part), part);
  assert.equal(s.ownerArrive, false);
});

test('הקשה 1: שמיעה חוזרת עם שם משתנה חדש', () => {
  const s = { ownerArrive: true };
  ownerReply(s, {});
  const out = ownerReply(s, { own1: '1' });
  assert.match(out, /=own2,no,/);
  assert.ok(!out.includes('בְּחִירָה לֹא תְּקִינָה'));
});

test('הקשה 2 או כוכבית: חוזרים לתפריט הראשי בשלוחה הראשית', () => {
  for (const answer of ['2', '*']) {
    const s = { ownerArrive: true };
    ownerReply(s, {});
    s.back = false;
    const out = ownerReply(s, { own1: answer });
    assert.match(out, /go_to_folder=\/$/);
    assert.equal(s.back, true);
  }
});

test('הקשה לא תקינה או שקט: מקריאים שוב עם הערה', () => {
  const s = { ownerArrive: true };
  ownerReply(s, {});
  assert.ok(ownerReply(s, { own1: '7' }).includes('בְּחִירָה לֹא תְּקִינָה'));
  assert.ok(ownerReply(s, { own1: '7', own2: '' }).includes('לֹא נִשְׁמְעָה תְּשׁוּבָה'));
});

test('ימות שולחת את כל הערכים בכל פנייה (גם ערך שחזר כמערך): נקרא האחרון', () => {
  const s = { ownerArrive: true };
  ownerReply(s, {});
  ownerReply(s, { own1: '1' });                                   // own2 מוקרא
  const out = ownerReply(s, { own1: '1', own2: ['1', '2'] });
  assert.match(out, /go_to_folder=\/$/);
});

test('כניסה שנייה באותה שיחה: ערכים ישנים לא נחשבים תשובה', () => {
  const s = { ownerArrive: true };
  ownerReply(s, {});
  ownerReply(s, { own1: '2' });                                   // חזרה לתפריט
  goToOwnerExt(s, '/7');                                          // מקישים 4 שוב
  const out = ownerReply(s, { own1: '2' });                       // own1='2' נשאר מהפעם הקודמת
  assert.match(out, /^read=/);
  assert.match(out, /=own2,no,/);
});

test('גישה לשלוחה בלי הגעה מהתפריט: מתחילים מההודעה', () => {
  const out = ownerReply({}, {});
  assert.match(out, /=own1,no,/);
});

test('אין מצב שיחה (השרת אותחל): חוזרים לשלוחה הראשית', () => {
  assert.match(ownerRestart(), /go_to_folder=\/$/);
});

test('ההודעה: כל קטע עובר ניקוי בלי תווים שמפרידים בפקודות ימות', () => {
  for (const part of OWNER_PARTS) assert.ok(!/[.,=&"'|]/.test(part.replace(/[׳״]/g, '')), part);
});

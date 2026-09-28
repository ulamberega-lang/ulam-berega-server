// תאריך עברי בכתיב עברי: "י״ז בתשרי תשפ״ז".
// (לפי התאריך האזרחי - מתחלף בחצות ולא בשקיעה)

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

// 17 → י״ז, 787 → תשפ״ז (15 ו-16 נכתבים ט״ו ו-ט״ז)
export function gematria(number) {
  let n = number % 1000;
  let letters = '';
  let hundreds = Math.floor(n / 100);
  while (hundreds > 4) { letters += 'ת'; hundreds -= 4; }
  letters += HUNDREDS[hundreds];
  const rest = n % 100;
  if (rest === 15) letters += 'טו';
  else if (rest === 16) letters += 'טז';
  else letters += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  return letters.length > 1 ? `${letters.slice(0, -1)}״${letters.slice(-1)}` : `${letters}׳`;
}

const hebrewCalendar = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem',
});

export function hebrewDate(date, { withYear = true } = {}) {
  const parts = Object.fromEntries(hebrewCalendar.formatToParts(new Date(date)).map((p) => [p.type, p.value]));
  const text = `${gematria(Number(parts.day))} ב${parts.month}`;
  return withYear ? `${text} ${gematria(Number(parts.year))}` : text;
}

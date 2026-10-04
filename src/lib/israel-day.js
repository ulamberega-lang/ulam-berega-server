// תחילת היום האזרחי (חצות) בשעון ישראל, כרגע זמן אמיתי (Date). מתחשב בשעון קיץ וחורף.
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const parts = (date) => Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));

export function startOfIsraelDay(now = new Date()) {
  const { year, month, day } = parts(now);
  const midnightUtc = Date.parse(`${year}-${month}-${day}T00:00:00Z`);
  // ישראל מקדימה את UTC ב-2 או 3 שעות: מחפשים את הרגע ששעון ישראל מראה בו חצות של אותו תאריך
  for (const hours of [3, 2]) {
    const candidate = new Date(midnightUtc - hours * 3600e3);
    const p = parts(candidate);
    if (`${p.year}-${p.month}-${p.day}` === `${year}-${month}-${day}` && p.hour === '00') return candidate;
  }
  return new Date(midnightUtc - 3 * 3600e3);
}

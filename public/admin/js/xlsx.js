// קורא קובץ אקסל (xlsx) בדפדפן, בלי ספרייה: xlsx הוא zip של קבצי XML. מחזיר את הגיליון הראשון כמערך שורות של טקסט.
// משתמש ב-DecompressionStream של הדפדפן (וגם של Node, לבדיקות).

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// מפת קבצים בתוך ה-zip: שם → { method, start, size } לפי הספר המרכזי
function zipEntries(buf) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (u32(v, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('זה לא קובץ אקסל תקין (xlsx)');
  const count = u16(v, eocd + 10);
  let p = u32(v, eocd + 16);
  const names = new TextDecoder();
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (u32(v, p) !== 0x02014b50) break;
    const method = u16(v, p + 10), size = u32(v, p + 20);
    const nameLen = u16(v, p + 28), extraLen = u16(v, p + 30), commentLen = u16(v, p + 32), local = u32(v, p + 42);
    const name = names.decode(new Uint8Array(buf, p + 46, nameLen));
    const start = local + 30 + u16(v, local + 26) + u16(v, local + 28);
    entries.set(name, { method, start, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function text(buf, entries, name) {
  const e = entries.get(name);
  if (!e) return null;
  const raw = new Uint8Array(buf, e.start, e.size);
  const bytes = e.method === 0 ? raw : await inflate(raw);
  return new TextDecoder().decode(bytes);
}

const unescapeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, g) => {
  if (g[0] === '#') return String.fromCodePoint(g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : Number(g.slice(1)));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[g.toLowerCase()];
});

// כל טקסט ה-<t> בתוך קטע (מתעלם מ-rPh, ההגייה)
const textOf = (xml) => unescapeXml([...xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

const colIndex = (ref) => [...ref.match(/^[A-Z]+/)[0]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function readXlsx(buf) {
  const entries = zipEntries(buf);
  const shared = [...((await text(buf, entries, 'xl/sharedStrings.xml')) ?? '').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const sheetName = entries.has('xl/worksheets/sheet1.xml') ? 'xl/worksheets/sheet1.xml' : [...entries.keys()].find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheet = sheetName && await text(buf, entries, sheetName);
  if (!sheet) throw new Error('לא נמצא גיליון בקובץ');
  const rows = [];
  for (const [, rowXml] of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const [, attrs, inner = ''] of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = null;
      if (type === 's' && v != null) value = shared[Number(v)] ?? null;
      else if (type === 'inlineStr') value = textOf(inner);
      else if (v != null) value = unescapeXml(v);
      row[colIndex(ref)] = value;
    }
    rows.push(Array.from(row, (c) => (c == null ? '' : String(c))));
  }
  return rows;
}

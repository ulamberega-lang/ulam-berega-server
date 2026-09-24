import express from 'express';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// service_role בשרת בלבד (משתנה סביבה ב-Render)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CITIES = { '1': 'בני ברק', '2': 'ירושלים' };
const WAIT_SEC = 30;         // זמן המתנה למענה הגבאי
const NO_ANSWER_EXT = '/9';  // שלוחת "אין מענה" (type=api -> /api/ivr/no-answer)

const params = (req) => ({ ...req.query, ...req.body });
const clean = (s) => String(s ?? '').replace(/[.,\-=&"'\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
const say = (...parts) => parts.filter(Boolean).map((p) => `t-${clean(p)}`).join('.');

async function closeCall(callId) {
  if (!callId) return;
  const { data } = await supabase
    .from('leads_log').select('created_at, answered').eq('yemot_call_id', callId).maybeSingle();
  if (!data) return;
  await supabase.from('leads_log').update({
    ended_at: new Date().toISOString(),
    duration_sec: Math.round((Date.now() - new Date(data.created_at).getTime()) / 1000),
    answered: data.answered ?? true, // לא חזר לשלוחת "אין מענה" => נענה
  }).eq('yemot_call_id', callId);
}

app.get('/health', (req, res) => res.send('ok')); // לפינג נגד שינה של Render

app.all('/api/ivr', async (req, res) => {
  const q = params(req);
  console.log('YEMOT', JSON.stringify(q));
  res.type('text/plain; charset=utf-8');
  try {
    if (q.hangup === 'yes') { await closeCall(q.ApiCallId); return res.send(''); }

    // city יכול להגיע מ-api_add_0 או מהקשת המתקשר; אם הגיע פעמיים - לוקחים את האחרון
    const city = [].concat(q.city ?? '').pop();
    const cityName = CITIES[city];
    if (!cityName) {
      return res.send(`read=${say('לבני ברק הקש 1', 'לירושלים הקש 2')}=city,no,1,1,7,No,yes,yes`);
    }

    const { data: halls, error } = await supabase
      .from('halls').select('*')
      .eq('is_active', true).eq('city_name', cityName)
      .order('name').limit(1);

    if (error || !halls?.length) {
      return res.send(`id_list_message=${say('לא נמצא גבאי זמין')}&go_to_folder=hangup`);
    }
    const hall = halls[0];
    const phone = (hall.gabbai_phone || '').replace(/\D/g, '');

    await supabase.from('leads_log').upsert({
      yemot_call_id: q.ApiCallId,
      hall_id: hall.id,
      caller_phone: q.ApiPhone || '',
      called_phone: phone,
      source: 'phone_ivr',
    }, { onConflict: 'yemot_call_id' });

    const info = say(
      hall.name,
      hall.neighborhood_name && `שכונת ${hall.neighborhood_name}`,
      hall.address,
      hall.max_guests && `עד ${hall.max_guests} אורחים`,
      'מעביר לגבאי'
    );
    // ערכי routing לפי הסדר: 1 מספר ... 9 זמן המתנה, 10 מעבר בסיום
    const routing = [phone, '', '', '', '', '', '', '', WAIT_SEC, NO_ANSWER_EXT].join(',');
    return res.send(`id_list_message=${info}&routing=${routing}`);
  } catch (err) {
    console.error('שגיאה בשרת:', err);
    return res.send(`id_list_message=${say('תקלה במערכת')}&go_to_folder=hangup`);
  }
});

app.all('/api/ivr/no-answer', async (req, res) => {
  const q = params(req);
  res.type('text/plain; charset=utf-8');
  if (q.hangup === 'yes') { await closeCall(q.ApiCallId); return res.send(''); }
  await supabase.from('leads_log').update({ answered: false }).eq('yemot_call_id', q.ApiCallId);
  return res.send(`id_list_message=${say('הגבאי לא ענה נסה שוב מאוחר יותר')}&go_to_folder=hangup`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// חיבור ל-Supabase דרך משתני סביבה מאובטחים
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// נקודת קצה לקבלת שיחות מימות המשיח
app.get('/api/ivr', async (req, res) => {
    try {
        const callerPhone = req.query.ApiPhone || 'unknown';
        const selectedCity = req.query.city;

        // אם המשתמש עוד לא בחר עיר - תפריט הקשה
        if (!selectedCity) {
            return res.send("read=t-הקש 1 לבני ברק, 2 לירושלים=city,1,1,1,7,Numeric,no");
        }

        let cityName = 'בני ברק';
        if (selectedCity === '2') cityName = 'ירושלים';

        // שליפת אולם פעיל מ-Supabase
        const { data: halls, error } = await supabase
            .from('halls')
            .select('*')
            .eq('city_name', cityName)
            .eq('is_active', true)
            .limit(1);

        if (error || !halls || halls.length === 0) {
            return res.send("id_list_message=t-לא נמצאו אולמות פנויים בעיר זו&go_to_folder=/");
        }

        const hall = halls[0];

        // רישום הליד בטבלת התיעוד
        await supabase.from('leads_log').insert([
            { hall_id: hall.id, caller_phone: callerPhone, source: 'phone_ivr' }
        ]);

        // ניתוב השיחה לגבאי
        return res.send(`routing_yemot=${hall.gabbai_phone}`);

    } catch (err) {
        console.error(err);
        return res.send("id_list_message=t-אירעה שגיאה במערכת, אנא נסה שוב מאוחר יותר&go_to_folder=/");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

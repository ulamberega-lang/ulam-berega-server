// קריאות לשרת (/admin/api).
async function request(path, options = {}) {
  const res = await fetch(`/admin/api/${path}`, { headers: { 'content-type': 'application/json' }, ...options });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) { location.href = '/admin/login'; throw new Error('צריך להיכנס מחדש'); } // התנתקות או פג תוקף
  if (!res.ok) throw new Error(body.error || 'השרת לא הגיב. נסה לרענן את הדף.');
  return body;
}

const query = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();

export const api = {
  listHalls: () => request('halls'),
  createHall: (hall) => request('halls', { method: 'POST', body: JSON.stringify(hall) }),
  updateHall: (id, hall) => request(`halls/${id}`, { method: 'PUT', body: JSON.stringify(hall) }),

  listVoicemails: () => request('voicemails'),
  setVoicemailHandled: (id, handled) => request(`voicemails/${id}`, { method: 'PUT', body: JSON.stringify({ handled }) }),
  deleteVoicemail: (id) => request(`voicemails/${id}`, { method: 'DELETE', body: '{}' }),

  listMails: () => request('mails'),

  listPronunciations: () => request('pronunciations'),
  savePronunciation: (word, nikud) => request('pronunciations', { method: 'PUT', body: JSON.stringify({ word, nikud }) }),
  suggestPronunciations: (items, previous) => request('pronunciations/suggest', { method: 'POST', body: JSON.stringify({ items, previous }) }),

  statsByHall: ({ from, to }) => request(`stats/halls?${query({ from, to })}`),
  statsByDay: ({ from, to }, hall) => request(`stats/days?${query({ from, to, hall })}`),
  listCalls: ({ from, to }, hall) => request(`calls?${query({ from, to, hall })}`),
};

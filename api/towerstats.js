export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apiKey');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const response = await fetch('https://api.towerstats.com/api/game_badges', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apiKey': '12e8fc20-0162-4eec-af87-377d1f5286e0-5a60a5b8-da15-475b-a2ca-ee92c4ba1143'
      },
      body
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: 'Failed to fetch from TowerStats: ' + e.message });
  }
}

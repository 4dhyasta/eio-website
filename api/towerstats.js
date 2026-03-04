export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { userid, action } = req.body;

    if (action === 'user_data') {
      // Step 1: Get badges owned by user
      const r = await fetch('https://www.towerstats.com/api/user_data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://www.towerstats.com/' },
        body: JSON.stringify({ userid })
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    if (action === 'check_badge') {
      // Step 2: Get tower names for owned badge IDs
      const { badges } = req.body;
      const r = await fetch('https://www.towerstats.com/api/check_badge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://www.towerstats.com/' },
        body: JSON.stringify({ userid, badges })
      });
      const data = await r.json();
      return res.status(200).json(data);
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

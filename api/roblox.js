export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { action, usernames, badgeIds } = req.body;

    if (action === 'get_user') {
      const r = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames, excludeBannedUsers: true })
      });
      return res.status(200).json(await r.json());
    }

    if (action === 'get_badges') {
      // Batch fetch badge names from Roblox (max 100 per request)
      const ids = badgeIds.slice(0, 100).join(',');
      const r = await fetch(`https://badges.roblox.com/v1/badges?badgeIds=${ids}`, {
        headers: { 'Accept': 'application/json' }
      });
      return res.status(200).json(await r.json());
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

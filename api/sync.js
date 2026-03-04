import { TOWER_DB, TOWER_NAME_DB } from './towerdb.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { username } = req.body;
    const ETOH_UNIVERSE_ID = 3264581003;

    // Step 1: Get Roblox user ID
    const userRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
    });
    const userJson = await userRes.json();
    const userId = userJson.data?.[0]?.id;
    if (!userId) return res.status(404).json({ error: 'Roblox user not found' });

    // Step 2: Get all EToH badge IDs from our database
    const allBadgeIds = Object.keys(TOWER_DB).map(Number);

    // Step 3: Check which badges user owns (100 at a time)
    const ownedBadgeIds = new Set();
    for (let i = 0; i < allBadgeIds.length; i += 100) {
      const chunk = allBadgeIds.slice(i, i + 100).join(',');
      const r = await fetch(
        `https://badges.roblox.com/v1/users/${userId}/badges/awarded-dates?badgeIds=${chunk}`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data = await r.json();
      if (data.data) data.data.forEach(b => ownedBadgeIds.add(b.badgeId));
    }

    // Step 4: Map owned badges to completions using our database
    const VALID_PREFIXES = ['tower of', 'steeple of', 'citadel of'];
    const seen = new Set();
    const completions = [];
    for (const badgeId of ownedBadgeIds) {
      const tower = TOWER_DB[badgeId];
      if (!tower) continue;
      // Only include actual tower/steeple/citadel badges
      const nameLower = tower.name.toLowerCase();
      if (!VALID_PREFIXES.some(p => nameLower.startsWith(p))) continue;
      // Deduplicate by tower name (same tower may have 2 badge IDs)
      if (seen.has(nameLower)) continue;
      seen.add(nameLower);
      completions.push({
        towerName: tower.name,
        difficulty: tower.difficulty,
        completedAt: new Date().toISOString(),
        badgeId
      });
    }

    res.status(200).json({ userId, total: completions.length, completions });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

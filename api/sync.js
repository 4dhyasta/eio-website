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

    // Step 2: Get ALL badges from EToH universe (paginated)
    let allGameBadges = [];
    let cursor = '';
    do {
      const url = `https://badges.roblox.com/v1/universes/${ETOH_UNIVERSE_ID}/badges?limit=100&sortOrder=Asc${cursor ? '&cursor=' + cursor : ''}`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await r.json();
      if (data.data) allGameBadges = allGameBadges.concat(data.data);
      cursor = data.nextPageCursor || '';
      if (allGameBadges.length > 5000) break;
    } while (cursor);

    if (allGameBadges.length === 0) {
      return res.status(500).json({ error: 'Could not fetch EToH badges', universeId: ETOH_UNIVERSE_ID });
    }

    // Step 3: Check which of these badges the user owns
    // Roblox allows checking 100 badge IDs at a time
    const badgeIds = allGameBadges.map(b => b.id);
    const ownedBadgeIds = new Set();

    for (let i = 0; i < badgeIds.length; i += 100) {
      const chunk = badgeIds.slice(i, i + 100).join(',');
      const r = await fetch(
        `https://badges.roblox.com/v1/users/${userId}/badges/awarded-dates?badgeIds=${chunk}`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data = await r.json();
      if (data.data) {
        data.data.forEach(b => ownedBadgeIds.add(b.badgeId));
      }
    }

    // Step 4: Filter game badges to only owned ones, then map to completions
    const diffKeywords = ['Unreal','Horrific','Catastrophic','Extreme','Insane',
      'Remorseless','Intense','Challenging','Difficult','Hard','Medium','Easy'];

    const badgeMap = {};
    allGameBadges.forEach(b => { badgeMap[b.id] = b; });

    const completions = [...ownedBadgeIds].map(badgeId => {
      const b = badgeMap[badgeId];
      if (!b) return null;
      let name = b.displayName || b.name || '';
      let difficulty = 'Unknown';
      const searchIn = (b.description || '') + ' ' + name;
      for (const d of diffKeywords) {
        if (searchIn.toLowerCase().includes(d.toLowerCase())) { difficulty = d; break; }
      }
      return { towerName: name, difficulty, completedAt: new Date().toISOString(), badgeId };
    }).filter(Boolean);

    res.status(200).json({ userId, total: completions.length, completions });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

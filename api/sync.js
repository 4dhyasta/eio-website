export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { username } = req.body;

    // Step 1: Get Roblox user ID
    const userRes = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
    });
    const userJson = await userRes.json();
    const userId = userJson.data?.[0]?.id;
    if (!userId) return res.status(404).json({ error: 'User not found' });

    // Step 2: Fetch all badges user has earned (paginated)
    let allBadges = [];
    let cursor = '';
    do {
      const url = `https://badges.roblox.com/v1/users/${userId}/badges?limit=100&sortOrder=Asc${cursor ? '&cursor=' + cursor : ''}`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await r.json();
      if (data.data) allBadges = allBadges.concat(data.data);
      cursor = data.nextPageCursor || '';
      if (allBadges.length > 3000) break;
    } while (cursor);

    // Step 3: Filter EToH badges
    // EToH place ID: 8562822414, universe ID: 3264581003
    // awarder.id = place ID that awarded the badge
    const ETOH_PLACE_ID = 8562822414;
    const ETOH_UNIVERSE_ID = 3264581003;

    const etohBadges = allBadges.filter(b => {
      const awarder = b.awarder || {};
      const awarding = b.awardingGame || {};
      return (
        awarder.id === ETOH_PLACE_ID ||
        awarder.id === ETOH_UNIVERSE_ID ||
        awarding.id === ETOH_PLACE_ID ||
        awarding.universeId === ETOH_UNIVERSE_ID ||
        awarding.rootPlaceId === ETOH_PLACE_ID
      );
    });

    // DEBUG: return sample of raw badge data so we can see the structure
    if (etohBadges.length === 0 && allBadges.length > 0) {
      // Return first few badges so we can inspect the structure
      return res.status(200).json({
        userId,
        total: 0,
        completions: [],
        debug_total_badges: allBadges.length,
        debug_sample: allBadges.slice(0, 3)
      });
    }

    // Step 4: Parse tower name and difficulty from badge
    const diffKeywords = ['Unreal','Horrific','Catastrophic','Extreme','Insane','Remorseless','Intense','Challenging','Difficult','Hard','Medium','Easy'];

    const completions = etohBadges.map(b => {
      let name = b.displayName || b.name || '';
      let difficulty = 'Unknown';
      const searchIn = (b.description || '') + ' ' + name;
      for (const d of diffKeywords) {
        if (searchIn.toLowerCase().includes(d.toLowerCase())) { difficulty = d; break; }
      }
      return {
        towerName: name,
        difficulty,
        completedAt: b.statistics?.awaredDate || new Date().toISOString(),
        badgeId: b.id
      };
    }).filter(c => c.towerName.length > 0);

    res.status(200).json({ userId, total: completions.length, completions });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

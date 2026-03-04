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

    // Step 2: Get all badges user has earned in EToH universe
    // EToH universe ID: 3264581003, place ID: 8562822414
    // We fetch badges the user owns from the EToH game
    const ETOH_UNIVERSE = 3264581003;
    let allBadges = [];
    let cursor = '';

    do {
      const url = `https://badges.roblox.com/v1/users/${userId}/badges?limit=100&sortOrder=Asc${cursor ? '&cursor=' + cursor : ''}`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await r.json();
      if (data.data) allBadges = allBadges.concat(data.data);
      cursor = data.nextPageCursor || '';
      if (allBadges.length > 2000) break; // safety limit
    } while (cursor);

    // Step 3: Filter only EToH badges (awardingGame.universeId matches)
    const etohBadges = allBadges.filter(b => b.awardingGame?.universeId === ETOH_UNIVERSE);

    // Step 4: Parse tower name and difficulty from badge name
    // EToH badge format: "Tower Name [Difficulty]" or "Beat Tower Name"
    const diffKeywords = [
      'Unreal','Horrific','Catastrophic','Extreme','Insane',
      'Remorseless','Intense','Challenging','Difficult','Hard','Medium','Easy'
    ];

    const completions = etohBadges.map(b => {
      let name = b.displayName || b.name || '';
      let difficulty = 'Unknown';

      // Remove common prefixes
      name = name.replace(/^(beat|complete|finish|tower of)\s*/i, '').trim();
      // Capitalize first letter
      if (name) name = name.charAt(0).toUpperCase() + name.slice(1);

      // Find difficulty in badge description or name
      const searchIn = (b.description || '') + ' ' + (b.displayName || '') + ' ' + (b.name || '');
      for (const d of diffKeywords) {
        if (searchIn.toLowerCase().includes(d.toLowerCase())) {
          difficulty = d;
          break;
        }
      }

      return {
        towerName: name,
        difficulty,
        completedAt: b.statistics?.awaredDate || new Date().toISOString(),
        badgeId: b.id
      };
    }).filter(c => c.towerName.length > 0);

    res.status(200).json({ 
      userId,
      total: completions.length,
      completions 
    });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

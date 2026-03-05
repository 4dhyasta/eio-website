import { TOWER_DB } from './towerdb.js';

const GAMES = {
  etoh: { name: 'EToH', placeId: 8562822414, universeId: 3264581003 },
  tea:  { name: 'TEA',  placeId: 15873244701, universeId: null },
  cscd: { name: 'CSCD', placeId: 10283991824, universeId: null },
};

async function getUniverseId(placeId) {
  const r = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
  const d = await r.json();
  return d.universeId;
}

async function getGameBadges(universeId) {
  let all = [], cursor = '';
  do {
    const url = `https://badges.roblox.com/v1/universes/${universeId}/badges?limit=100&sortOrder=Asc${cursor ? '&cursor='+cursor : ''}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const d = await r.json();
    if (d.data) all = all.concat(d.data);
    cursor = d.nextPageCursor || '';
    if (all.length > 5000) break;
  } while (cursor);
  return all;
}

async function getOwnedBadges(userId, badgeIds) {
  const owned = new Map(); // badgeId -> awardedDate
  for (let i = 0; i < badgeIds.length; i += 100) {
    const chunk = badgeIds.slice(i, i + 100).join(',');
    const r = await fetch(
      `https://badges.roblox.com/v1/users/${userId}/badges/awarded-dates?badgeIds=${chunk}`,
      { headers: { Accept: 'application/json' } }
    );
    const d = await r.json();
    if (d.data) d.data.forEach(b => owned.set(b.badgeId, b.awardedDate));
  }
  return owned;
}

const VALID_PREFIXES = ['tower of', 'steeple of', 'citadel of'];
const DIFF_KEYWORDS = ['Nil','Unreal','Horrific','Catastrophic','Terrifying','Extreme','Insane','Remorseless','Intense','Challenging','Difficult','Hard','Medium','Easy'];

function parseBadgeName(rawName, gameKey) {
  let name = rawName || '';
  let isAllJump = false;

  // CSCD: "Tower of XXX - All Jumps"
  if (gameKey === 'cscd') {
    const ajMatch = name.match(/^(.+?)\s*-\s*All Jumps?$/i);
    if (ajMatch) {
      name = ajMatch[1].trim();
      isAllJump = true;
    }
  }

  // Remove "Beat the" / "Beat" prefix
  name = name.replace(/^beat\s+the\s+/i, '').replace(/^beat\s+/i, '').trim();

  // Only include Tower of / Steeple of / Citadel of
  if (!VALID_PREFIXES.some(p => name.toLowerCase().startsWith(p))) return null;

  return { name, isAllJump };
}

function getDifficulty(badge, gameKey) {
  // For EToH: use our accurate towerdb
  if (gameKey === 'etoh') {
    const dbEntry = TOWER_DB[badge.id];
    if (dbEntry) return dbEntry.difficulty;
  }

  // For TEA/CSCD: search badge name + description for difficulty keywords
  // Order matters: check hardest first to avoid false matches
  const searchIn = ((badge.description || '') + ' ' + (badge.displayName || '') + ' ' + (badge.name || '')).toLowerCase();
  for (const d of DIFF_KEYWORDS) {
    // Use word boundary matching to avoid "Insane" matching "Insanely"
    const regex = new RegExp('\\b' + d.toLowerCase() + '\\b');
    if (regex.test(searchIn)) return d;
  }
  return 'Unknown';
}

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
    if (!userId) return res.status(404).json({ error: 'Roblox user not found' });

    // Step 2: Resolve universe IDs for TEA & CSCD
    const [teaUniverseId, cscdUniverseId] = await Promise.all([
      getUniverseId(GAMES.tea.placeId),
      getUniverseId(GAMES.cscd.placeId),
    ]);
    GAMES.tea.universeId = teaUniverseId;
    GAMES.cscd.universeId = cscdUniverseId;

    // Step 3: Fetch all badges for all 3 games
    const [etohBadges, teaBadges, cscdBadges] = await Promise.all([
      getGameBadges(GAMES.etoh.universeId),
      getGameBadges(GAMES.tea.universeId),
      getGameBadges(GAMES.cscd.universeId),
    ]);

    const gamesBadges = { etoh: etohBadges, tea: teaBadges, cscd: cscdBadges };

    // Step 4: Check which badges user owns across all games
    const allBadgeIds = [...etohBadges, ...teaBadges, ...cscdBadges].map(b => b.id);
    const ownedMap = await getOwnedBadges(userId, allBadgeIds);

    // Step 5: Build badge lookup map
    const badgeLookup = {};
    for (const [gameKey, badges] of Object.entries(gamesBadges)) {
      badges.forEach(b => { badgeLookup[b.id] = { ...b, gameKey }; });
    }

    // Step 6: Build completions
    const seen = new Set();
    const completions = [];

    for (const [badgeId, awardedDate] of ownedMap) {
      const badge = badgeLookup[badgeId];
      if (!badge) continue;

      const rawName = badge.displayName || badge.name || '';
      const parsed = parseBadgeName(rawName, badge.gameKey);
      if (!parsed) continue;

      const { name, isAllJump } = parsed;
      const dedupeKey = `${badge.gameKey}:${name.toLowerCase()}:${isAllJump}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const difficulty = getDifficulty(badge, badge.gameKey);

      completions.push({
        towerName: name,
        difficulty,
        game: badge.gameKey,         // 'etoh' | 'tea' | 'cscd'
        isAllJump: isAllJump || false,
        completedAt: awardedDate || new Date().toISOString(),
        badgeId
      });
    }

    res.status(200).json({ userId, total: completions.length, completions });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

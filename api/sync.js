import { TOWER_DB, TEA_NAME_DB } from './towerdb.js';

const GAMES = {
  etoh: { name: 'EToH', placeId: 8562822414,  universeId: 3264581003 },
  tea:  { name: 'TEA',  placeId: 15873244701, universeId: 5488708927 },
  cscd: { name: 'CSCD', placeId: 10283991824, universeId: 3762953501 },
};

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

function getDifficultyInfo(badge, gameKey, towerName) {
  // EToH: use accurate badge ID db
  if (gameKey === 'etoh') {
    const dbEntry = TOWER_DB[badge.id];
    if (dbEntry) return { difficulty: dbEntry.difficulty, diffNum: dbEntry.diffNum || 0 };
  }

  // TEA: use name-based db
  if (gameKey === 'tea' && towerName) {
    const entry = TEA_NAME_DB[towerName.toLowerCase()];
    if (entry) return { difficulty: entry, diffNum: 0 };
  }

  // Fallback: keyword search in badge name/description
  const searchIn = ((badge.description || '') + ' ' + (badge.displayName || '') + ' ' + (badge.name || '')).toLowerCase();
  for (const d of DIFF_KEYWORDS) {
    const regex = new RegExp('\\b' + d.toLowerCase() + '\\b');
    if (regex.test(searchIn)) return { difficulty: d, diffNum: 0 };
  }
  return { difficulty: 'Unknown', diffNum: 0 };
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

    // Step 3: Fetch all badges for all 3 games in parallel
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

    // Step 6: Build completions - first pass to get all legit difficulties
    const legitDiffByName = {}; // gameKey:towerName -> difficulty

    const allParsed = [];
    for (const [badgeId, awardedDate] of ownedMap) {
      const badge = badgeLookup[badgeId];
      if (!badge) continue;
      const rawName = badge.displayName || badge.name || '';
      const parsed = parseBadgeName(rawName, badge.gameKey);
      if (!parsed) continue;
      const diffInfo = getDifficultyInfo(badge, badge.gameKey, parsed.name);
      const diff = diffInfo.difficulty;
      const diffNum = diffInfo.diffNum;
      // Store legit difficulty
      if (!parsed.isAllJump && diff !== 'Unknown') {
        legitDiffByName[`${badge.gameKey}:${parsed.name.toLowerCase()}`] = { difficulty: diff, diffNum };
      }
      allParsed.push({ badge, parsed, awardedDate, badgeId, diff, diffNum });
    }

    // Second pass: build completions, merge same tower across games
    const towerMap = new Map(); // towerName_lower:isAllJump -> completion entry
    const seenPerGame = new Set(); // gameKey:name:isAllJump dedup

    for (const { badge, parsed, awardedDate, badgeId, diff, diffNum } of allParsed) {
      const { name, isAllJump } = parsed;
      const gameKey = badge.gameKey;
      const perGameKey = `${gameKey}:${name.toLowerCase()}:${isAllJump}`;
      if (seenPerGame.has(perGameKey)) continue;
      seenPerGame.add(perGameKey);

      const legitInfo = legitDiffByName[`${gameKey}:${name.toLowerCase()}`];
      const resolvedDiff = isAllJump ? (legitInfo?.difficulty || diff) : diff;
      const resolvedDiffNum = isAllJump ? (legitInfo?.diffNum || diffNum) : diffNum;

      const DIFF_ORDER = ['Easy','Medium','Hard','Difficult','Challenging','Intense','Remorseless','Insane','Extreme','Terrifying','Catastrophic','Horrific','Unreal','Nil'];
      const mergeKey = `${name.toLowerCase()}:${isAllJump}`;
      if (towerMap.has(mergeKey)) {
        const existing = towerMap.get(mergeKey);
        if (!existing.games.includes(gameKey)) existing.games.push(gameKey);
        // Use highest diffNum, fallback to diffOrder index
        const existScore = existing.diffNum || DIFF_ORDER.indexOf(existing.difficulty);
        const newScore = resolvedDiffNum || DIFF_ORDER.indexOf(resolvedDiff);
        if (newScore > existScore) {
          existing.difficulty = resolvedDiff;
          existing.diffNum = resolvedDiffNum;
        }
      } else {
        towerMap.set(mergeKey, {
          towerName: name,
          difficulty: resolvedDiff,
          diffNum: resolvedDiffNum,
          games: [gameKey],
          isAllJump: isAllJump || false,
          completedAt: awardedDate || new Date().toISOString(),
          badgeId
        });
      }
    }

    // Convert game arrays to sorted string: etoh → tea → cscd order
    const GAME_ORDER = ['etoh', 'tea', 'cscd'];
    const completions = Array.from(towerMap.values()).map(c => ({
      ...c,
      game: GAME_ORDER.filter(g => c.games.includes(g)).join('+'),
      games: undefined
    }));

    res.status(200).json({ userId, total: completions.length, completions });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

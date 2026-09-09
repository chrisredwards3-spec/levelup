const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (path.startsWith('/api/')) {
      return handleApi(request, env, path, url);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    if (event.cron === '0 8 * * 6') {
      ctx.waitUntil(syncButtonBoys(env));
    } else {
      ctx.waitUntil(checkPrices(env));
    }
  }
};

async function handleApi(request, env, path, url) {
  const method = request.method;

  if (path === '/api/health') {
    return json({ status: 'ok' });
  }

  // Game search via IGDB
  if (path === '/api/search' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    if (q.length < 2) return json([]);
    try {
      const results = await searchIGDB(q, env);
      return json(results);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }

  // Debug
  if (path === '/api/debug' && method === 'GET') {
    const clientId = await env.KV.get('config:igdb_client_id');
    const clientSecret = await env.KV.get('config:igdb_client_secret');
    const token = await env.KV.get('igdb:token', 'json');
    return json({
      hasClientId: !!clientId,
      clientIdLen: clientId ? clientId.length : 0,
      hasClientSecret: !!clientSecret,
      hasToken: !!token,
      tokenExpired: token ? token.expires < Date.now() : null
    });
  }

  // Consoles
  if (path === '/api/consoles') {
    if (method === 'GET') {
      return json(await env.KV.get('consoles', 'json') || []);
    }
    if (method === 'POST') {
      const body = await request.json();
      const consoles = await env.KV.get('consoles', 'json') || [];
      if (!consoles.find(c => c.id === body.id)) {
        consoles.push(body);
        await env.KV.put('consoles', JSON.stringify(consoles));
      }
      return json(consoles);
    }
    if (method === 'DELETE') {
      const body = await request.json();
      let consoles = await env.KV.get('consoles', 'json') || [];
      consoles = consoles.filter(c => c.id !== body.id);
      await env.KV.put('consoles', JSON.stringify(consoles));
      return json(consoles);
    }
  }

  // Library
  if (path === '/api/library') {
    if (method === 'GET') {
      let library = await env.KV.get('library', 'json') || [];
      const missing = library.filter(g => g.id && g.timeToBeat == null);
      if (missing.length) {
        try {
          const ids = missing.map(g => g.id);
          const token = await getIGDBToken(env);
          const clientId = await env.KV.get('config:igdb_client_id');
          const ttbRes = await fetch('https://api.igdb.com/v4/game_time_to_beats', {
            method: 'POST',
            headers: { 'Client-ID': clientId, 'Authorization': 'Bearer ' + token, 'Content-Type': 'text/plain' },
            body: 'fields game_id,normally;\nwhere game_id = (' + ids.join(',') + ');\nlimit ' + ids.length + ';'
          });
          const ttbData = await ttbRes.json();
          if (Array.isArray(ttbData)) {
            const ttbMap = {};
            ttbData.forEach(t => { if (t.normally) ttbMap[t.game_id] = Math.round(t.normally / 3600); });
            library = library.map(g => ttbMap[g.id] ? Object.assign({}, g, { timeToBeat: ttbMap[g.id] }) : g);
            await env.KV.put('library', JSON.stringify(library));
          }
        } catch (_) {}
      }
      return json(library);
    }
    if (method === 'POST') {
      const body = await request.json();
      const library = await env.KV.get('library', 'json') || [];
      const idx = library.findIndex(g => g.id === body.id);
      if (idx >= 0) {
        library[idx] = Object.assign({}, library[idx], body);
      } else {
        library.push(Object.assign({}, body, { addedAt: Date.now(), dropCount: 0 }));
      }
      await env.KV.put('library', JSON.stringify(library));
      return json(library);
    }
    if (method === 'DELETE') {
      const body = await request.json();
      let library = await env.KV.get('library', 'json') || [];
      library = library.filter(g => {
        if (body.id && g.id && g.id === body.id) return false;
        if (body.name && body.addedAt && g.name === body.name && g.addedAt === body.addedAt) return false;
        return true;
      });
      await env.KV.put('library', JSON.stringify(library));
      return json(library);
    }
  }

  // Wishlist
  if (path === '/api/wishlist') {
    if (method === 'GET') {
      let wishlist = await env.KV.get('wishlist', 'json') || [];
      const missing = wishlist.filter(g => g.id && g.timeToBeat == null);
      if (missing.length) {
        try {
          const ids = missing.map(g => g.id);
          const token = await getIGDBToken(env);
          const clientId = await env.KV.get('config:igdb_client_id');
          const ttbRes = await fetch('https://api.igdb.com/v4/game_time_to_beats', {
            method: 'POST',
            headers: { 'Client-ID': clientId, 'Authorization': 'Bearer ' + token, 'Content-Type': 'text/plain' },
            body: 'fields game_id,normally;\nwhere game_id = (' + ids.join(',') + ');\nlimit ' + ids.length + ';'
          });
          const ttbData = await ttbRes.json();
          if (Array.isArray(ttbData)) {
            const ttbMap = {};
            ttbData.forEach(t => { if (t.normally) ttbMap[t.game_id] = Math.round(t.normally / 3600); });
            wishlist = wishlist.map(g => ttbMap[g.id] ? Object.assign({}, g, { timeToBeat: ttbMap[g.id] }) : g);
            await env.KV.put('wishlist', JSON.stringify(wishlist));
          }
        } catch (_) {}
      }
      return json(wishlist);
    }
    if (method === 'POST') {
      const body = await request.json();
      const wishlist = await env.KV.get('wishlist', 'json') || [];
      if (!wishlist.find(g => g.id === body.id)) {
        wishlist.push(Object.assign({}, body, { addedAt: Date.now() }));
        await env.KV.put('wishlist', JSON.stringify(wishlist));
      }
      return json(wishlist);
    }
    if (method === 'DELETE') {
      const body = await request.json();
      let wishlist = await env.KV.get('wishlist', 'json') || [];
      wishlist = wishlist.filter(g => g.id !== body.id);
      await env.KV.put('wishlist', JSON.stringify(wishlist));
      return json(wishlist);
    }
  }

  if (path === '/api/mood' && method === 'POST') {
    try {
      const body = await request.json();
      const result = await getMoodPick(body.history || [], env);
      return json(result);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }

  if (path === '/api/discover' && method === 'GET') {
    const cached = await env.KV.get('discover:ai', 'json');
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    if (cached && cached.generatedAt && (Date.now() - cached.generatedAt) < threeDays) {
      return json(cached);
    }
    try {
      const result = await getAIPicks(env);
      return json(result);
    } catch (err) {
      return json({ picks: [], generatedAt: null, error: err.message });
    }
  }

  if (path === '/api/discover/refresh' && method === 'POST') {
    try {
      await env.KV.delete('discover:ai');
      const result = await getAIPicks(env);
      return json(result);
    } catch (err) {
      return json({ picks: [], generatedAt: null, error: err.message }, 500);
    }
  }

  // Ryan Hedges — match day squad status
  if (path === '/api/hedges/matchday' && method === 'GET') {
    try {
      const result = await getHedgesMatchday(env);
      return json(result);
    } catch (err) {
      return json({ configured: false, error: err.message }, 200);
    }
  }

  // Ryan Hedges — match-by-match stats (key passes, shots, rating, etc)
  if (path === '/api/hedges/matches' && method === 'GET') {
    const cached = await env.KV.get('hedges:matches', 'json');
    const twelveHours = 12 * 60 * 60 * 1000;
    if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < twelveHours) {
      return json(cached);
    }
    try {
      const result = await getHedgesMatchLog(env);
      return json(result);
    } catch (err) {
      return json(cached || { configured: false, matches: [], error: err.message });
    }
  }

  if (path === '/api/hedges/matches/refresh' && method === 'POST') {
    try {
      await env.KV.delete('hedges:matches');
      const result = await getHedgesMatchLog(env);
      return json(result);
    } catch (err) {
      return json({ configured: false, matches: [], error: err.message }, 500);
    }
  }

  if (path === '/api/buttonboys' && method === 'GET') {
    const cached = await env.KV.get('buttonboys', 'json');
    const day = 24 * 60 * 60 * 1000;
    if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < day) {
      return json(cached.episodes);
    }
    try {
      const episodes = await fetchAndParseButtonBoys();
      await env.KV.put('buttonboys', JSON.stringify({ episodes, fetchedAt: Date.now() }));
      return json(episodes);
    } catch (err) {
      return json(cached ? cached.episodes : []);
    }
  }

  return json({ error: 'Not found' }, 404);
}

// ── IGDB ────────────────────────────────────────────────────────

async function getIGDBToken(env) {
  const cached = await env.KV.get('igdb:token', 'json');
  if (cached && cached.expires > Date.now()) return cached.token;

  const clientId = await env.KV.get('config:igdb_client_id');
  const clientSecret = await env.KV.get('config:igdb_client_secret');
  if (!clientId || !clientSecret) throw new Error('IGDB credentials not configured in KV');

  const res = await fetch(
    'https://id.twitch.tv/oauth2/token?client_id=' + clientId +
    '&client_secret=' + clientSecret +
    '&grant_type=client_credentials',
    { method: 'POST' }
  );
  const data = await res.json();
  await env.KV.put('igdb:token', JSON.stringify({
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 3600) * 1000
  }));
  return data.access_token;
}

async function searchIGDB(query, env) {
  const token = await getIGDBToken(env);
  const clientId = await env.KV.get('config:igdb_client_id');
  const safe = query.replace(/"/g, '').trim();

  const headers = {
    'Client-ID': clientId,
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'text/plain'
  };

  const fields = 'fields id,name,cover.url,platforms.abbreviation,first_release_date,aggregated_rating;';

  // Primary: full-text search
  const res1 = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers,
    body: fields + '\nsearch "' + safe + '";\nlimit 10;'
  });
  const raw1 = await res1.json();
  let games = Array.isArray(raw1) ? raw1 : [];

  // Fallback: substring match on last meaningful word (handles partial words + multi-word combos)
  if (games.length < 4) {
    const words = safe.split(/\s+/).filter(w => w.length >= 3);
    const word = words[words.length - 1];
    if (word) {
      const res2 = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers,
        body: fields + '\nwhere name ~* *"' + word + '"*;\nlimit 10;'
      });
      const raw2 = await res2.json();
      if (Array.isArray(raw2)) {
        const seen = new Set(games.map(g => g.id));
        raw2.forEach(g => { if (!seen.has(g.id)) games.push(g); });
      }
    }
  }

  const top = games.slice(0, 10);

  // Fetch time-to-beat for all results in one call
  const ids = top.map(g => g.id).filter(Boolean);
  const ttbMap = {};
  if (ids.length) {
    try {
      const ttbRes = await fetch('https://api.igdb.com/v4/game_time_to_beats', {
        method: 'POST',
        headers,
        body: 'fields game_id,normally;\nwhere game_id = (' + ids.join(',') + ');\nlimit ' + ids.length + ';'
      });
      const ttbData = await ttbRes.json();
      if (Array.isArray(ttbData)) {
        ttbData.forEach(t => { if (t.normally) ttbMap[t.game_id] = Math.round(t.normally / 3600); });
      }
    } catch (_) {}
  }

  return top.map(g => ({
    id: g.id,
    name: g.name,
    cover: g.cover ? g.cover.url.replace('t_thumb', 't_cover_big').replace('//', 'https://') : null,
    platforms: g.platforms ? g.platforms.map(p => p.abbreviation).filter(Boolean) : [],
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
    metacritic: g.aggregated_rating ? Math.round(g.aggregated_rating) : null,
    timeToBeat: ttbMap[g.id] || null
  }));
}

// ── Mood Picker ──────────────────────────────────────────────────

async function getMoodPick(history, env) {
  const apiKey = await env.KV.get('config:anthropic_api_key');
  if (!apiKey) throw new Error('no_key');

  const library = await env.KV.get('library', 'json') || [];
  const wishlist = await env.KV.get('wishlist', 'json') || [];

  const finished = library
    .filter(g => g.status === 'completed' && g.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(g => g.name + ' (' + g.score + '/10)').join(', ');

  const exclude = library.map(g => g.name).concat(wishlist.map(g => g.name)).join(', ');

  const historyStr = history.length
    ? 'Questions asked so far:\n' + history.map(h => 'Q: ' + h.question + '\nA: ' + h.answer).join('\n') + '\n\n'
    : '';

  const prompt = history.length >= 5
    ? 'You are a game recommender. User taste: ' + finished + '. Do not recommend: ' + exclude + '.\n\n' +
      historyStr +
      'You have enough info. Recommend exactly 3 games that match their answers. Only recommend games with Metacritic 70+. Return ONLY valid JSON:\n' +
      '{"type":"picks","intro":"one friendly sentence","picks":[{"name":"exact title","reason":"why it fits their answers","platforms":["PS5","Switch"],"metacritic":85,"timeToBeat":20,"train":false}]}'
    : 'You are a game recommender helping someone pick what to play right now. User taste: ' + finished + '.\n\n' +
      historyStr +
      'Ask question ' + (history.length + 1) + ' of 5. Keep it short and punchy. Cover things like: time available, genre/vibe, mood/setting, play style, home or on the go. Return ONLY valid JSON:\n' +
      '{"type":"question","text":"short question","options":["option1","option2","option3","option4"]}';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: prompt }] })
  });

  const data = await res.json();
  let text = data.content && data.content[0] ? data.content[0].text : '{}';
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(text);
}

// ── Button Boys ──────────────────────────────────────────────────

function parseCSVRow(line) {
  const cells = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  cells.push(cur.trim());
  return cells;
}

async function fetchAndParseButtonBoys() {
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1PsPTg3wdyT11EZ9SnWPoDf_-BXXb_thBBmrRtSvZwmk/export?format=csv&gid=0';
  const res = await fetch(SHEET_URL);
  const csv = await res.text();
  const lines = csv.split('\n');

  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('HIDDEN CACHE EPISODE')) { dataStart = i + 1; break; }
  }
  if (dataStart === -1) return [];

  const platCols = [
    { name: 'PS', idx: 5 },
    { name: 'Xbox', idx: 6 },
    { name: 'Switch', idx: 7 },
    { name: 'PC', idx: 8 },
    { name: 'iOS', idx: 9 },
    { name: 'Android', idx: 10 }
  ];

  const episodes = [];
  for (let i = dataStart; i < lines.length - 1; i += 2) {
    const info = parseCSVRow(lines[i]);
    const prices = parseCSVRow(lines[i + 1]);
    const epNum = info[1];
    const game = info[3];
    if (!epNum || !game || isNaN(parseInt(epNum))) continue;
    const platforms = platCols
      .filter(p => info[p.idx])
      .map(p => ({ name: p.name, price: prices[p.idx] || null }));
    episodes.push({
      episode: parseInt(epNum),
      episodeName: info[2] || '',
      game,
      metacritic: info[4] ? parseInt(info[4]) : null,
      platforms
    });
  }
  return episodes.sort((a, b) => b.episode - a.episode);
}

// ── AI Picks ─────────────────────────────────────────────────────

async function getAIPicks(env) {
  const apiKey = await env.KV.get('config:anthropic_api_key');
  if (!apiKey) return { picks: [], generatedAt: null, message: 'no_key' };

  const library = await env.KV.get('library', 'json') || [];
  const wishlist = await env.KV.get('wishlist', 'json') || [];

  const finished = library
    .filter(g => g.status === 'completed' && g.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  if (finished.length < 3) return { picks: [], generatedAt: null, message: 'not_enough_games' };

  const finishedList = finished.map(g => g.name + ' (' + g.score + '/10)').join(', ');
  const alreadyKnown = library.map(g => g.name).concat(wishlist.map(g => g.name)).join(', ');

  const prompt = 'Games this person has finished and rated: ' + finishedList + '\n\n' +
    'Games they already own, are playing, or have wishlisted (DO NOT recommend any of these): ' + alreadyKnown + '\n\n' +
    'Recommend exactly 8 games they would enjoy that are not in either list above. ' +
    'Only recommend games with a Metacritic score of 70 or above — do not recommend poorly reviewed or niche titles. ' +
    'Split them as: 4 larger games best played at home in long sessions (train:false), and 4 games ideal for a train journey — must have natural short-session play, must be completely safe for public viewing, no sexual content, no graphic violence on screen, nothing NSFW (train:true). ' +
    'Return ONLY a valid JSON array, no markdown, no explanation:\n' +
    '[{"name":"exact game title","reason":"one sentence why based on their taste","platforms":["PS5","Switch","PC"],"metacritic":85,"timeToBeat":20,"train":false}]';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await res.json();
  let text = data.content && data.content[0] ? data.content[0].text : '[]';
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const picks = JSON.parse(text);
  const result = { picks, generatedAt: Date.now() };
  await env.KV.put('discover:ai', JSON.stringify(result));
  return result;
}

// ── Ryan Hedges / API-Football ──────────────────────────────────
//
// Data source: api-football.com (v3.football.api-sports.io). Free tier
// covers this comfortably (~20-25 calls/day with the caching below vs a
// 100/day quota). Set the key once:
//   npx wrangler kv key put --binding=KV "config:api_football_key" "YOUR_KEY"
// Everything else (finding Ryan Hedges' player id, his current club,
// fixtures) is resolved automatically and cached.

const HEDGES_PLAYER_NAME = { first: 'Ryan', last: 'Hedges' };

async function apiFootball(pathAndQuery, env) {
  const key = await env.KV.get('config:api_football_key');
  if (!key) {
    const err = new Error('API-Football key not configured');
    err.notConfigured = true;
    throw err;
  }
  const res = await fetch('https://v3.football.api-sports.io' + pathAndQuery, {
    headers: { 'x-apisports-key': key }
  });
  if (!res.ok) throw new Error('API-Football request failed: ' + res.status);
  const data = await res.json();
  if (data.errors && Array.isArray(data.errors) ? data.errors.length : Object.keys(data.errors || {}).length) {
    throw new Error('API-Football error: ' + JSON.stringify(data.errors));
  }
  return data.response;
}

async function resolveHedgesIds(env) {
  const cached = await env.KV.get('hedges:ids', 'json');
  const week = 7 * 24 * 60 * 60 * 1000;
  if (cached && cached.resolvedAt && (Date.now() - cached.resolvedAt) < week) return cached;

  const profiles = await apiFootball('/players/profiles?search=' + encodeURIComponent(HEDGES_PLAYER_NAME.last), env);
  const match = (profiles || []).find(p =>
    p.player.firstname === HEDGES_PLAYER_NAME.first && p.player.lastname === HEDGES_PLAYER_NAME.last
  ) || (profiles || [])[0];
  if (!match) throw new Error('Could not find Ryan Hedges on API-Football');

  const playerId = match.player.id;
  const season = new Date().getFullYear();

  let team = null;
  for (const s of [season, season - 1]) {
    const stats = await apiFootball('/players?id=' + playerId + '&season=' + s, env);
    const row = (stats || [])[0];
    if (row && row.statistics && row.statistics[0] && row.statistics[0].team) {
      team = row.statistics[0].team;
      break;
    }
  }
  if (!team) throw new Error('Could not resolve current club for Ryan Hedges');

  const ids = { playerId, teamId: team.id, teamName: team.name, resolvedAt: Date.now() };
  await env.KV.put('hedges:ids', JSON.stringify(ids));
  return ids;
}

async function getHedgesMatchday(env) {
  const { playerId, teamId, teamName } = await resolveHedgesIds(env);

  const cacheKey = 'hedges:matchday';
  const cached = await env.KV.get(cacheKey, 'json');
  const fifteenMin = 15 * 60 * 1000;
  if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < fifteenMin) return cached;

  const [next, last] = await Promise.all([
    apiFootball('/fixtures?team=' + teamId + '&next=1', env),
    apiFootball('/fixtures?team=' + teamId + '&last=1', env),
  ]);

  const nextFixture = (next || [])[0];
  const lastFixture = (last || [])[0];

  // Prefer the upcoming fixture unless the last one finished less than 3h ago.
  let fixture = nextFixture;
  if (lastFixture) {
    const lastKickoff = new Date(lastFixture.fixture.date).getTime();
    const threeHours = 3 * 60 * 60 * 1000;
    if (Date.now() - lastKickoff < threeHours) fixture = lastFixture;
  }
  if (!fixture) fixture = nextFixture || lastFixture;

  if (!fixture) {
    const result = { configured: true, status: 'no_fixture', teamName, fetchedAt: Date.now() };
    await env.KV.put(cacheKey, JSON.stringify(result));
    return result;
  }

  const base = {
    configured: true,
    teamName,
    opponent: fixture.teams.home.id === teamId ? fixture.teams.away.name : fixture.teams.home.name,
    venue: fixture.fixture.venue ? fixture.fixture.venue.name : null,
    home: fixture.teams.home.id === teamId,
    competition: fixture.league.name,
    kickoffISO: fixture.fixture.date,
    fixtureStatus: fixture.fixture.status.short,
    fetchedAt: Date.now(),
  };

  const lineups = await apiFootball('/fixtures/lineups?fixture=' + fixture.fixture.id, env);
  if (!lineups || !lineups.length) {
    const result = Object.assign({}, base, {
      status: 'not_announced',
      detail: 'Lineups are not published yet — they typically land around an hour before kickoff.',
    });
    await env.KV.put(cacheKey, JSON.stringify(result));
    return result;
  }

  const teamLineup = lineups.find(l => l.team.id === teamId);
  const inStartXI = teamLineup && teamLineup.startXI.some(p => p.player.id === playerId);
  const inSubs = teamLineup && teamLineup.substitutes.some(p => p.player.id === playerId);

  let status, detail;
  if (inStartXI) {
    status = 'starting_xi';
    detail = 'Ryan Hedges is in the starting XI.';
  } else if (inSubs) {
    const finished = ['FT', 'AET', 'PEN'].includes(fixture.fixture.status.short);
    if (finished) {
      const playerStats = await apiFootball('/fixtures/players?fixture=' + fixture.fixture.id, env);
      const teamStats = (playerStats || []).find(t => t.team.id === teamId);
      const p = teamStats && teamStats.players.find(pl => pl.player.id === playerId);
      const minutes = p && p.statistics[0] ? p.statistics[0].games.minutes : 0;
      status = minutes ? 'substitute_played' : 'substitute_unused';
      detail = minutes
        ? `Came off the bench and played ${minutes} minutes.`
        : 'Named among the substitutes but did not come on.';
    } else {
      status = 'substitute';
      detail = 'Named among the substitutes — available for impact from the bench.';
    }
  } else if (teamLineup) {
    status = 'not_selected';
    detail = 'Not named in the matchday squad.';
  } else {
    status = 'not_announced';
    detail = 'Lineup data unavailable for this fixture yet.';
  }

  const result = Object.assign({}, base, { status, detail });
  await env.KV.put(cacheKey, JSON.stringify(result));
  return result;
}

async function getHedgesMatchLog(env) {
  const { playerId, teamId, teamName } = await resolveHedgesIds(env);

  const fixtures = await apiFootball('/fixtures?team=' + teamId + '&last=10', env);
  const matches = [];

  for (const f of fixtures || []) {
    try {
      const playerStats = await apiFootball('/fixtures/players?fixture=' + f.fixture.id, env);
      const teamStats = (playerStats || []).find(t => t.team.id === teamId);
      const p = teamStats && teamStats.players.find(pl => pl.player.id === playerId);
      if (!p || !p.statistics[0] || !p.statistics[0].games.minutes) continue; // didn't feature

      const s = p.statistics[0];
      matches.push({
        date: f.fixture.date,
        competition: f.league.name,
        opponent: f.teams.home.id === teamId ? f.teams.away.name : f.teams.home.name,
        home: f.teams.home.id === teamId,
        score: f.goals.home + '–' + f.goals.away,
        started: s.games.substitute === false,
        minutes: s.games.minutes,
        rating: s.games.rating ? Number(s.games.rating).toFixed(1) : null,
        goals: s.goals.total || 0,
        assists: s.goals.assists || 0,
        shots: s.shots ? s.shots.total || 0 : 0,
        shotsOnTarget: s.shots ? s.shots.on || 0 : 0,
        passes: s.passes ? s.passes.total || 0 : 0,
        keyPasses: s.passes ? s.passes.key || 0 : 0,
        passAccuracy: s.passes ? s.passes.accuracy || null : null,
        tackles: s.tackles ? s.tackles.total || 0 : 0,
        duelsWon: s.duels ? s.duels.won || 0 : 0,
        duelsTotal: s.duels ? s.duels.total || 0 : 0,
        dribblesSuccess: s.dribbles ? s.dribbles.success || 0 : 0,
        yellowCards: s.cards ? s.cards.yellow || 0 : 0,
        redCards: s.cards ? s.cards.red || 0 : 0,
      });
    } catch (_) {
      // skip fixtures we can't read stats for
    }
  }

  matches.sort((a, b) => new Date(b.date) - new Date(a.date));
  const result = { configured: true, teamName, matches, fetchedAt: Date.now() };
  await env.KV.put('hedges:matches', JSON.stringify(result));
  return result;
}

// ── Crons ────────────────────────────────────────────────────────

async function syncButtonBoys(env) {
  try {
    const episodes = await fetchAndParseButtonBoys();
    await env.KV.put('buttonboys', JSON.stringify({ episodes, fetchedAt: Date.now() }));
  } catch (_) {}
}

async function checkPrices(env) {
  // TODO: load wishlist, check prices, push alerts if threshold hit
}

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
      return json(await env.KV.get('library', 'json') || []);
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
      return json(await env.KV.get('wishlist', 'json') || []);
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
    '[{"name":"exact game title","reason":"one sentence why based on their taste","platforms":["PS5","Switch","PC"],"metacritic":85,"train":false}]';

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

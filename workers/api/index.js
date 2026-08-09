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
    return json(await env.KV.get('discover', 'json') || { picks: [], buttonBoys: [], generatedAt: null });
  }

  if (path === '/api/buttonboys' && method === 'GET') {
    return json(await env.KV.get('buttonboys', 'json') || []);
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
  const safe = query.replace(/"/g, '');
  const body = 'fields id,name,cover.url,platforms.abbreviation,first_release_date,aggregated_rating;\nsearch "' + safe + '";\nlimit 10;';

  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'text/plain'
    },
    body
  });

  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error('IGDB returned: ' + JSON.stringify(raw));
  const games = raw;

  return games.map(g => ({
    id: g.id,
    name: g.name,
    cover: g.cover ? g.cover.url.replace('t_thumb', 't_cover_big').replace('//', 'https://') : null,
    platforms: g.platforms ? g.platforms.map(p => p.abbreviation).filter(Boolean) : [],
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
    metacritic: g.aggregated_rating ? Math.round(g.aggregated_rating) : null,
    timeToBeat: null
  }));
}

// ── Crons ────────────────────────────────────────────────────────

async function syncButtonBoys(env) {
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1PsPTg3wdyT11EZ9SnWPoDf_-BXXb_thBBmrRtSvZwmk/export?format=csv&gid=0';
  const res = await fetch(SHEET_URL);
  const csv = await res.text();
  await env.KV.put('buttonboys:raw', csv);
}

async function checkPrices(env) {
  // TODO: load wishlist, check prices, push alerts if threshold hit
}

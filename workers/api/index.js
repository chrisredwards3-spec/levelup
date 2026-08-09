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

    // API routes
    if (path.startsWith('/api/')) {
      return handleApi(request, env, path);
    }

    // Static assets
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

async function handleApi(request, env, path) {
  const method = request.method;

  // Health check
  if (path === '/api/health') {
    return json({ status: 'ok' });
  }

  // Consoles
  if (path === '/api/consoles') {
    if (method === 'GET') {
      const data = await env.KV.get('consoles', 'json');
      return json(data || []);
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
      const data = await env.KV.get('library', 'json');
      return json(data || []);
    }
    if (method === 'POST') {
      const body = await request.json();
      const library = await env.KV.get('library', 'json') || [];
      const idx = library.findIndex(g => g.id === body.id);
      if (idx >= 0) {
        library[idx] = { ...library[idx], ...body };
      } else {
        library.push({ ...body, addedAt: Date.now() });
      }
      await env.KV.put('library', JSON.stringify(library));
      return json(library);
    }
    if (method === 'DELETE') {
      const body = await request.json();
      let library = await env.KV.get('library', 'json') || [];
      library = library.filter(g => g.id !== body.id);
      await env.KV.put('library', JSON.stringify(library));
      return json(library);
    }
  }

  // Wishlist
  if (path === '/api/wishlist') {
    if (method === 'GET') {
      const data = await env.KV.get('wishlist', 'json');
      return json(data || []);
    }
    if (method === 'POST') {
      const body = await request.json();
      const wishlist = await env.KV.get('wishlist', 'json') || [];
      if (!wishlist.find(g => g.id === body.id)) {
        wishlist.push({ ...body, addedAt: Date.now() });
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

  // Discover (cached AI recommendations)
  if (path === '/api/discover' && method === 'GET') {
    const data = await env.KV.get('discover', 'json');
    return json(data || { picks: [], buttonBoys: [], generatedAt: null });
  }

  // Button Boys data
  if (path === '/api/buttonboys' && method === 'GET') {
    const data = await env.KV.get('buttonboys', 'json');
    return json(data || []);
  }

  return json({ error: 'Not found' }, 404);
}

async function syncButtonBoys(env) {
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1PsPTg3wdyT11EZ9SnWPoDf_-BXXb_thBBmrRtSvZwmk/export?format=csv&gid=0';
  const res = await fetch(SHEET_URL);
  const csv = await res.text();
  // TODO: parse CSV rows into structured data
  await env.KV.put('buttonboys:raw', csv);
}

async function checkPrices(env) {
  // TODO: load wishlist, check prices, push alerts if threshold hit
}

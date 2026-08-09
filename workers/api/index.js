// Level Up — Cloudflare Worker API
// Routes:
//   GET  /api/library          → all library entries
//   POST /api/library          → add/update a game
//   GET  /api/wishlist         → wishlist
//   POST /api/wishlist         → add to wishlist
//   DELETE /api/wishlist/:id   → remove from wishlist
//   GET  /api/consoles         → owned consoles
//   POST /api/consoles         → add console
//   GET  /api/discover         → cached AI recommendations
//   POST /api/sync/buttonboys  → Button Boys CSV sync (cron-triggered)
//   POST /api/sync/prices      → price check cron

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

    if (path === '/api/health') {
      return json({ status: 'ok' });
    }

    return json({ error: 'Not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    // Cron triggers wired up in Cloudflare dashboard:
    //   0 8 * * 6  → Button Boys weekly sync (Saturday 8am)
    //   0 6 * * *  → Daily price check
    if (event.cron === '0 8 * * 6') {
      ctx.waitUntil(syncButtonBoys(env));
    } else {
      ctx.waitUntil(checkPrices(env));
    }
  }
};

async function syncButtonBoys(env) {
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1PsPTg3wdyT11EZ9SnWPoDf_-BXXb_thBBmrRtSvZwmk/export?format=csv&gid=0';
  const res = await fetch(SHEET_URL);
  const csv = await res.text();
  await env.KV.put('buttonboys:raw', csv);
  // TODO: parse CSV, diff against stored, update KV
}

async function checkPrices(env) {
  // TODO: load wishlist from KV, check eBay/CEX/Vinted prices, store results, trigger push if threshold hit
}

const CONSOLE_CATALOG = [
  { id: 'ps5',        name: 'PS5',                  short: 'PS5',  color: '#003087', platform: 'ps5' },
  { id: 'ps4',        name: 'PS4',                  short: 'PS4',  color: '#00439c', platform: 'ps4' },
  { id: 'switch2',    name: 'Nintendo Switch 2',    short: 'NS2',  color: '#e4000f', platform: 'switch' },
  { id: 'switch',     name: 'Nintendo Switch',      short: 'NS',   color: '#e4000f', platform: 'switch' },
  { id: 'xbox-series',name: 'Xbox Series X/S',      short: 'XSX',  color: '#107c10', platform: 'xbox' },
  { id: 'xbox-one',   name: 'Xbox One',             short: 'XB1',  color: '#107c10', platform: 'xbox' },
  { id: 'legion-go',  name: 'Lenovo Legion Go',     short: 'LGo',  color: '#c8102e', platform: 'pc' },
  { id: 'steam-deck', name: 'Steam Deck',           short: 'SD',   color: '#1b2838', platform: 'pc' },
  { id: 'pc',         name: 'Windows PC',           short: 'PC',   color: '#0078d4', platform: 'pc' },
  { id: 'mac',        name: 'Mac',                  short: 'Mac',  color: '#555555', platform: 'mac' },
  { id: 'ps-portal',  name: 'PS Portal',            short: 'PSP',  color: '#0070cc', platform: 'ps5' },
];

let ownedConsoles = [];

// ── Tab navigation ──────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + target).classList.add('active');
  });
});

// Library filter tabs
document.querySelectorAll('.filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Wishlist filter chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// ── Consoles ────────────────────────────────────────────────────
async function loadConsoles() {
  try {
    const res = await fetch('/api/consoles');
    ownedConsoles = await res.json();
  } catch (_) {
    ownedConsoles = [];
  }
  renderConsoles();
}

function renderConsoles() {
  const grid = document.getElementById('consoles-grid');
  const cards = ownedConsoles.map(p => `
    <div class="console-card">
      <div class="console-card-band" style="background:${p.color}">
        <span class="console-card-label">${p.short}</span>
      </div>
      <div class="console-card-name">${p.name}</div>
      <button class="console-card-remove" onclick="removeConsole('${p.id}')">×</button>
    </div>
  `).join('');

  grid.innerHTML = cards + `
    <button class="console-add-card" onclick="openConsoleSheet()">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Add Console
    </button>
  `;
}

function openConsoleSheet() {
  const ownedIds = ownedConsoles.map(p => p.id);
  const available = CONSOLE_CATALOG.filter(p => !ownedIds.includes(p.id));

  document.getElementById('console-catalog').innerHTML = available.length
    ? available.map(p => `
        <div class="catalog-item" onclick="addConsole('${p.id}')">
          <div class="catalog-dot" style="background:${p.color}">${p.short}</div>
          <span class="catalog-name">${p.name}</span>
        </div>
      `).join('')
    : '<p style="color:var(--text-muted);text-align:center;padding:16px">All consoles added</p>';

  document.getElementById('console-sheet').classList.remove('hidden');
  document.getElementById('console-backdrop').classList.remove('hidden');
}

function closeConsoleSheet() {
  document.getElementById('console-sheet').classList.add('hidden');
  document.getElementById('console-backdrop').classList.add('hidden');
}

async function addConsole(id) {
  const def = CONSOLE_CATALOG.find(p => p.id === id);
  if (!def) return;
  closeConsoleSheet();
  await fetch('/api/consoles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(def)
  });
  await loadConsoles();
}

async function removeConsole(id) {
  await fetch('/api/consoles', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  await loadConsoles();
}

// ── Init ────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

loadConsoles();

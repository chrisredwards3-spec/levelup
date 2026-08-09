const CONSOLE_CATALOG = [
  { id: 'ps5',         name: 'PS5',               short: 'PS5',  color: '#003087', platform: 'ps5' },
  { id: 'ps4',         name: 'PS4',               short: 'PS4',  color: '#00439c', platform: 'ps4' },
  { id: 'switch2',     name: 'Nintendo Switch 2', short: 'NS2',  color: '#e4000f', platform: 'switch' },
  { id: 'switch',      name: 'Nintendo Switch',   short: 'NS',   color: '#e4000f', platform: 'switch' },
  { id: 'xbox-series', name: 'Xbox Series X/S',   short: 'XSX',  color: '#107c10', platform: 'xbox' },
  { id: 'xbox-one',    name: 'Xbox One',           short: 'XB1',  color: '#107c10', platform: 'xbox' },
  { id: 'legion-go',   name: 'Lenovo Legion Go',  short: 'LGo',  color: '#c8102e', platform: 'pc' },
  { id: 'steam-deck',  name: 'Steam Deck',         short: 'SD',   color: '#1b2838', platform: 'pc' },
  { id: 'pc',          name: 'Windows PC',         short: 'PC',   color: '#0078d4', platform: 'pc' },
  { id: 'mac',         name: 'Mac',                short: 'Mac',  color: '#555555', platform: 'mac' },
  { id: 'ps-portal',   name: 'PS Portal',          short: 'PSP',  color: '#0070cc', platform: 'ps5' },
  { id: 'ios',         name: 'iPhone / iOS',       short: 'iOS',  color: '#1c1c1e', platform: 'ios' },
  { id: 'ipad',        name: 'iPad',               short: 'iPad', color: '#1c1c1e', platform: 'ios' },
];

// ── State ──────────────────────────────────────────────────────
let ownedConsoles = [];
let libraryGames = [];
let currentLibraryFilter = 'playing';
let searchResultsCache = [];
let pendingGame = null;
let isEditing = false;
let addStatus = 'playing';
let addPlatform = null;
let scoreStr = '';

// ── Tab navigation ─────────────────────────────────────────────
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
    currentLibraryFilter = btn.dataset.filter;
    renderLibrary();
  });
});

// Wishlist filter chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// ── Consoles ───────────────────────────────────────────────────
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
  const cards = ownedConsoles.map(p =>
    '<div class="console-card">' +
      '<div class="console-card-band" style="background:' + p.color + '">' +
        '<span class="console-card-label">' + p.short + '</span>' +
      '</div>' +
      '<div class="console-card-name">' + p.name + '</div>' +
      '<button class="console-card-remove" onclick="removeConsole(\'' + p.id + '\')">×</button>' +
    '</div>'
  ).join('');

  grid.innerHTML = cards +
    '<button class="console-add-card" onclick="openConsoleSheet()">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' +
      '</svg>' +
      'Add Console' +
    '</button>';
}

function openConsoleSheet() {
  const ownedIds = ownedConsoles.map(p => p.id);
  const available = CONSOLE_CATALOG.filter(p => !ownedIds.includes(p.id));
  document.getElementById('console-catalog').innerHTML = available.length
    ? available.map(p =>
        '<div class="catalog-item" onclick="addConsole(\'' + p.id + '\')">' +
          '<div class="catalog-dot" style="background:' + p.color + '">' + p.short + '</div>' +
          '<span class="catalog-name">' + p.name + '</span>' +
        '</div>'
      ).join('')
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

// ── Library ────────────────────────────────────────────────────
async function loadLibrary() {
  try {
    const res = await fetch('/api/library');
    libraryGames = await res.json();
  } catch (_) {
    libraryGames = [];
  }
  renderLibrary();
  updateHomeStats();
}

function renderLibrary() {
  const list = document.getElementById('library-list');
  const filtered = libraryGames.filter(g => g.status === currentLibraryFilter);

  if (!filtered.length) {
    const labels = { playing: 'currently playing', completed: 'completed', dropped: 'dropped' };
    list.innerHTML = '<div class="empty-state">No games ' + labels[currentLibraryFilter] + ' yet</div>';
    return;
  }

  list.innerHTML = filtered.map(g => {
    const coverHtml = g.cover
      ? '<img class="game-card-cover" src="' + g.cover + '" alt="">'
      : '<div class="game-card-cover-placeholder">🎮</div>';

    const scoreHtml = g.score != null
      ? '<div class="game-card-score">' + g.score + '</div>'
      : '<div class="game-card-score unscored">—</div>';

    const timeHtml = g.timeToBeat ? '<span class="pill pill-time">⏱ ' + g.timeToBeat + 'h</span>' : '';
    const metaHtml = g.metacritic ? '<span class="pill">MC ' + g.metacritic + '</span>' : '';
    const platforms = g.platforms && g.platforms.length ? g.platforms.slice(0, 2).join(', ') : '';
    const year = g.year ? ' · ' + g.year : '';

    const playedOn = g.platform ? ' · ' + g.platform : '';
    return '<div class="game-card" onclick="openEditGame(' + g.id + ')">' +
      coverHtml +
      '<div class="game-card-body">' +
        '<div class="game-card-title">' + g.name + '</div>' +
        '<div class="game-card-meta">' + platforms + year + playedOn + '</div>' +
        '<div class="game-card-pills">' +
          '<span class="pill pill-' + g.status + '">' + g.status + '</span>' +
          timeHtml +
          metaHtml +
        '</div>' +
      '</div>' +
      scoreHtml +
    '</div>';
  }).join('');
}

function updateHomeStats() {
  const played = libraryGames.filter(g => g.status !== 'dropped').length;
  const completed = libraryGames.filter(g => g.status === 'completed').length;
  const el = document.getElementById('stat-played');
  const el2 = document.getElementById('stat-completed');
  if (el) el.textContent = played;
  if (el2) el2.textContent = completed;
}

// ── Game Search ────────────────────────────────────────────────
function openGameSearch() {
  document.getElementById('search-sheet').classList.remove('hidden');
  document.getElementById('search-backdrop').classList.remove('hidden');
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').value = '';
  setTimeout(() => document.getElementById('search-input').focus(), 100);
}

function closeGameSearch() {
  document.getElementById('search-sheet').classList.add('hidden');
  document.getElementById('search-backdrop').classList.add('hidden');
  document.getElementById('search-input').blur();
}

let searchTimeout;
document.getElementById('search-input').addEventListener('input', e => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  if (q.length < 2) {
    document.getElementById('search-results').innerHTML = '';
    return;
  }
  document.getElementById('search-results').innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:8px">Searching...</div>';
  searchTimeout = setTimeout(() => runSearch(q), 400);
});

async function runSearch(q) {
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(q));
    const games = await res.json();
    searchResultsCache = games;
    renderSearchResults(games);
  } catch (_) {
    document.getElementById('search-results').innerHTML = '<div class="empty-state">Search failed — try again</div>';
  }
}

function renderSearchResults(games) {
  if (!games.length) {
    document.getElementById('search-results').innerHTML = '<div class="empty-state">No results found</div>';
    return;
  }
  document.getElementById('search-results').innerHTML = games.map((g, i) => {
    const coverHtml = g.cover
      ? '<img class="search-result-cover" src="' + g.cover + '" alt="">'
      : '<div class="search-result-cover-ph">🎮</div>';
    const platforms = g.platforms && g.platforms.length ? g.platforms.slice(0, 3).join(', ') : 'Unknown';
    const year = g.year ? ' · ' + g.year : '';
    const mc = g.metacritic ? ' · MC ' + g.metacritic : '';
    return '<div class="search-result" onclick="selectResult(' + i + ')">' +
      coverHtml +
      '<div>' +
        '<div class="search-result-name">' + g.name + '</div>' +
        '<div class="search-result-meta">' + platforms + year + mc + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function selectResult(idx) {
  pendingGame = searchResultsCache[idx];
  isEditing = false;
  addStatus = 'playing';
  addPlatform = null;
  scoreStr = '';
  closeGameSearch();
  openAddGame();
}

function openEditGame(id) {
  const game = libraryGames.find(g => g.id === id);
  if (!game) return;
  pendingGame = game;
  isEditing = true;
  addStatus = game.status;
  addPlatform = game.platform || null;
  scoreStr = game.score != null ? String(game.score) : '';
  openAddGame();
}

// ── Add/Edit Game Sheet ────────────────────────────────────────
function openAddGame() {
  renderAddSheet();
  document.getElementById('add-sheet').classList.remove('hidden');
  document.getElementById('add-backdrop').classList.remove('hidden');
}

function closeAddGame() {
  document.getElementById('add-sheet').classList.add('hidden');
  document.getElementById('add-backdrop').classList.add('hidden');
  pendingGame = null;
  isEditing = false;
}

function renderAddSheet() {
  if (!pendingGame) return;
  const g = pendingGame;
  const coverHtml = g.cover
    ? '<img class="add-game-cover" src="' + g.cover + '" alt="">'
    : '<div class="add-game-cover-ph">🎮</div>';
  const igdbPlatforms = g.platforms && g.platforms.length ? g.platforms.slice(0, 3).join(', ') : '';
  const year = g.year ? ' · ' + g.year : '';
  const mc = g.metacritic ? ' · MC ' + g.metacritic : '';

  const scoreDisplay = scoreStr
    ? '<div class="score-display">' + scoreStr + ' / 10</div>'
    : '<div class="score-display empty">Tap to score (optional)</div>';

  const sc = function(s) {
    return 'status-pill' + (addStatus === s ? ' active-' + s : '');
  };

  const platformChips = CONSOLE_CATALOG.map(p =>
    '<button class="platform-chip' + (addPlatform === p.id ? ' active' : '') + '" onclick="setPlatform(\'' + p.id + '\')">' + p.short + '</button>'
  ).join('');

  const deleteBtn = isEditing
    ? '<button class="btn-delete" onclick="confirmDelete()">Remove from Library</button>'
    : '';

  document.getElementById('add-game-content').innerHTML =
    '<div class="add-game-header">' +
      coverHtml +
      '<div>' +
        '<div class="add-game-title">' + g.name + '</div>' +
        '<div class="add-game-meta">' + igdbPlatforms + year + mc + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="add-section-label">Played on</div>' +
    '<div class="platform-chips">' + (platformChips || '<span style="color:var(--text-muted);font-size:13px">Add consoles first</span>') + '</div>' +
    '<div class="add-section-label">Status</div>' +
    '<div class="status-pills">' +
      '<button class="' + sc('playing') + '" onclick="setStatus(\'playing\')">Playing</button>' +
      '<button class="' + sc('completed') + '" onclick="setStatus(\'completed\')">Completed</button>' +
      '<button class="' + sc('dropped') + '" onclick="setStatus(\'dropped\')">Dropped</button>' +
    '</div>' +
    '<div class="add-section-label">Your Score</div>' +
    scoreDisplay +
    '<div class="numpad">' +
      [7,8,9,4,5,6,1,2,3].map(n =>
        '<button class="numpad-btn" onclick="numpad(\'' + n + '\')">' + n + '</button>'
      ).join('') +
      '<button class="numpad-btn" onclick="numpad(\'.\')">.</button>' +
      '<button class="numpad-btn" onclick="numpad(\'0\')">0</button>' +
      '<button class="numpad-btn" onclick="numpadDel()">⌫</button>' +
    '</div>' +
    '<button class="btn-primary" onclick="saveGame()">' + (isEditing ? 'Save Changes' : 'Add to Library') + '</button>' +
    deleteBtn;
}

function setStatus(s) {
  addStatus = s;
  renderAddSheet();
}

function setPlatform(id) {
  addPlatform = addPlatform === id ? null : id;
  renderAddSheet();
}

function confirmDelete() {
  if (!pendingGame) return;
  removeFromLibrary(pendingGame.id);
  closeAddGame();
}

function numpad(val) {
  if (val === '.') {
    if (scoreStr.includes('.') || scoreStr === '') return;
  }
  if (val === '0' && scoreStr === '0') return;
  const next = scoreStr + val;
  if (parseFloat(next) > 10) return;
  if (next.includes('.') && next.split('.')[1].length > 1) return;
  if (next.length > 4) return;
  scoreStr = next;
  renderAddSheet();
}

function numpadDel() {
  scoreStr = scoreStr.slice(0, -1);
  renderAddSheet();
}

async function saveGame() {
  if (!pendingGame) return;
  const score = scoreStr ? parseFloat(scoreStr) : null;
  const platform = addPlatform;
  await fetch('/api/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, pendingGame, { status: addStatus, score, platform }))
  });
  closeAddGame();
  await loadLibrary();
  document.querySelector('.nav-item[data-tab="library"]').click();
}

async function removeFromLibrary(id) {
  await fetch('/api/library', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id })
  });
  await loadLibrary();
}

// ── Init ───────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

loadConsoles();
loadLibrary();

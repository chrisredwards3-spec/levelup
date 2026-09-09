(function () {
  const STATUS_META = {
    starting_xi: { label: "Starting today", css: "starting_xi" },
    substitute: { label: "Named among the substitutes", css: "substitute" },
    substitute_played: { label: "Came off the bench", css: "starting_xi" },
    substitute_unused: { label: "Unused substitute", css: "substitute" },
    not_selected: { label: "Not in today's squad", css: "not_selected" },
    not_announced: { label: "Squad not yet announced", css: "not_announced" },
    no_fixture: { label: "No fixture scheduled", css: "not_announced" },
  };

  function calcAge(isoDate) {
    const dob = new Date(isoDate);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
    return age;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function formatDateShort(iso) {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function relativeTime(iso) {
    const diffMs = new Date(iso).getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60000);
    const abs = Math.abs(diffMin);
    if (abs < 60) return diffMin >= 0 ? `in ${abs} min` : `${abs} min ago`;
    const diffHr = Math.round(diffMin / 60);
    if (Math.abs(diffHr) < 48) return diffHr >= 0 ? `in ${diffHr}h` : `${Math.abs(diffHr)}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return diffDay >= 0 ? `in ${diffDay}d` : `${Math.abs(diffDay)}d ago`;
  }

  function renderHero() {
    document.getElementById("hero-club").textContent =
      `${HEDGES.bio.currentClub} · ${HEDGES.bio.currentClubLeague} · Wales`;
  }

  // ── Match day ──────────────────────────────────────────────────

  function matchdayCardHTML(md, opts) {
    opts = opts || {};
    const meta = STATUS_META[md.status] || { label: md.statusLabel || "Status unknown", css: "not_announced" };
    if (md.status === "no_fixture") {
      return `
        <div class="md-status-bar status-not_announced">
          <span class="status-dot"></span><span>No fixture scheduled</span>
        </div>
        <div class="md-body"><p class="md-detail">${md.teamName || HEDGES.bio.currentClub} have no upcoming fixture on record right now.</p></div>
      `;
    }
    const kickoff = formatDate(md.kickoffISO);
    const rel = relativeTime(md.kickoffISO);
    const fixtureLine = md.home === false
      ? `${md.opponent} vs ${md.club || md.teamName}`
      : `${md.club || md.teamName} vs ${md.opponent}`;
    const sourceLine = opts.live
      ? `Live from API-Football · updated ${relativeTime(md.fetchedAt ? new Date(md.fetchedAt).toISOString() : new Date().toISOString())}`
      : `Source: ${md.source || "manual update"} · as of ${md.asOfISO ? formatDate(md.asOfISO) : "—"}`;
    const pill = opts.live
      ? `<span class="confirmed-pill">Live data</span>`
      : (md.confirmed ? `<span class="confirmed-pill">Official teamsheet</span>` : `<span class="unconfirmed-pill">Not yet confirmed</span>`);

    return `
      <div class="md-status-bar status-${meta.css}">
        <span class="status-dot"></span><span>${meta.label}</span>
      </div>
      <div class="md-body">
        <p class="md-fixture">${fixtureLine}</p>
        <p class="md-meta">${md.competition} · ${md.venue || "venue TBC"} · ${kickoff} (${rel})</p>
        <p class="md-detail">${md.detail}</p>
        <div class="md-source">
          <span>${sourceLine}</span>
          ${pill}
        </div>
      </div>
    `;
  }

  function paintStaticMatchday() {
    const el = document.getElementById("matchday-card");
    el.innerHTML = matchdayCardHTML(HEDGES.matchday, { live: false });
  }

  function renderMatchdayFallback(apiConfigured) {
    paintStaticMatchday();
    const note = document.getElementById("matchday-live-note");
    note.textContent = apiConfigured === false
      ? "Live API-Football data isn't connected yet — showing the manually-set status below."
      : "Showing manually-set status — live match data unavailable right now.";
    note.hidden = false;
  }

  async function loadMatchday() {
    try {
      const res = await fetch("/api/hedges/matchday");
      const data = await res.json();
      if (data && data.configured && data.status && data.status !== "no_fixture") {
        document.getElementById("matchday-card").innerHTML = matchdayCardHTML(data, { live: true });
        document.getElementById("matchday-live-note").hidden = true;
        return;
      }
      renderMatchdayFallback(data ? data.configured : false);
    } catch (_) {
      renderMatchdayFallback(false);
    }
  }

  // ── Career stats (static) ─────────────────────────────────────

  function renderStats() {
    const tbody = document.querySelector("#stats-table tbody");
    const tfoot = document.querySelector("#stats-table tfoot");
    let totalApps = 0, totalGoals = 0;

    tbody.innerHTML = HEDGES.careerStats.map((row) => {
      totalApps += row.apps;
      totalGoals += row.goals;
      return `
        <tr>
          <td class="club-cell">${row.club}${row.note ? `<span class="club-note">${row.note}</span>` : ""}</td>
          <td>${row.years}</td>
          <td>${row.apps}</td>
          <td>${row.goals}</td>
        </tr>
      `;
    }).join("");

    tfoot.innerHTML = `<tr><td>Career total</td><td></td><td>${totalApps}</td><td>${totalGoals}</td></tr>`;
  }

  // ── Match-by-match log (live) ─────────────────────────────────

  function renderMatchLogRows(matches) {
    const tbody = document.querySelector("#matchlog-table tbody");
    tbody.innerHTML = matches.map((m) => `
      <tr>
        <td>${formatDateShort(m.date)}</td>
        <td class="club-cell">${m.opponent}<span class="club-note">${m.competition} · ${m.home ? "H" : "A"} · ${m.score}</span></td>
        <td>${m.started ? "Start" : "Sub"}</td>
        <td>${m.minutes}′</td>
        <td>${m.goals}</td>
        <td>${m.assists}</td>
        <td>${m.keyPasses}</td>
        <td>${m.rating || "—"}</td>
      </tr>
    `).join("");
  }

  async function loadMatchLog() {
    const wrap = document.getElementById("matchlog-wrap");
    const emptyState = document.getElementById("matchlog-empty");
    try {
      const res = await fetch("/api/hedges/matches");
      const data = await res.json();
      if (data && data.configured && data.matches && data.matches.length) {
        renderMatchLogRows(data.matches);
        wrap.hidden = false;
        emptyState.hidden = true;
        return;
      }
      emptyState.textContent = data && data.configured === false
        ? "Live match-by-match stats aren't connected yet. Add an API-Football key to see minutes, goals, assists and key passes for every recent appearance."
        : "No recent match data available yet.";
    } catch (_) {
      emptyState.textContent = "Couldn't reach the live stats API right now.";
    }
    wrap.hidden = true;
    emptyState.hidden = false;
  }

  // ── Static sections ──────────────────────────────────────────

  function renderInternational() {
    const intl = HEDGES.international;
    document.getElementById("international-body").innerHTML = `
      <div class="about-row"><span class="about-label">Caps</span><span class="about-value">${intl.caps}</span></div>
      <div class="about-row"><span class="about-label">Goals</span><span class="about-value">${intl.goals}</span></div>
      <div class="about-row"><span class="about-label">Span</span><span class="about-value">${intl.span}</span></div>
      <div class="about-row"><span class="about-label">Debut</span><span class="about-value">${intl.debut}</span></div>
      <p class="highlight-desc" style="margin-top:10px">${intl.note}</p>
    `;
  }

  function renderHonours() {
    document.getElementById("honours-list").innerHTML = HEDGES.honours.map((h) => `
      <li><span class="li-title">${h.title}</span><span class="li-sub">${h.club} · ${h.season}</span></li>
    `).join("");
  }

  function renderHighlights() {
    document.getElementById("highlights-grid").innerHTML = HEDGES.highlights.map((h) => {
      if (h.type === "youtube") {
        return `
          <div class="highlight-card">
            <div class="highlight-video-wrap">
              <iframe src="https://www.youtube.com/embed/${h.youtubeId}" title="${h.title}"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen loading="lazy"></iframe>
            </div>
            <div class="highlight-body">
              <p class="highlight-club">${h.club}</p>
              <p class="highlight-title">${h.title}</p>
            </div>
          </div>
        `;
      }
      return `
        <div class="highlight-card">
          <div class="highlight-body">
            <p class="highlight-club">${h.club}</p>
            <p class="highlight-title">${h.title}</p>
            <p class="highlight-desc">${h.description}</p>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAbout() {
    const b = HEDGES.bio;
    const age = calcAge(b.born);
    document.getElementById("about-card").innerHTML = `
      <div class="about-row"><span class="about-label">Full name</span><span class="about-value">${b.fullName}</span></div>
      <div class="about-row"><span class="about-label">Born</span><span class="about-value">${new Date(b.born).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} (age ${age})</span></div>
      <div class="about-row"><span class="about-label">Birthplace</span><span class="about-value">${b.birthplace}</span></div>
      <div class="about-row"><span class="about-label">Height</span><span class="about-value">${b.height}</span></div>
      <div class="about-row"><span class="about-label">Position</span><span class="about-value">${b.position}</span></div>
      <div class="about-row"><span class="about-label">Nationality</span><span class="about-value">${b.nationality}</span></div>
      <div class="about-row"><span class="about-label">Current club</span><span class="about-value">${b.currentClub}</span></div>
    `;
  }

  function init() {
    renderHero();
    paintStaticMatchday(); // instant paint, then upgrade to live if available
    loadMatchday();
    renderStats();
    loadMatchLog();
    renderInternational();
    renderHonours();
    renderHighlights();
    renderAbout();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

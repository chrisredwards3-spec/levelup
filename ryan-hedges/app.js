(function () {
  const STATUS_LABELS = {
    not_announced: "Squad not yet announced",
    named_squad: "Named in the squad",
    starting_xi: "Starting today",
    substitute: "Named among the substitutes",
    not_selected: "Not in today's squad",
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
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function relativeTime(iso) {
    const diffMs = new Date(iso).getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60000);
    const abs = Math.abs(diffMin);
    if (abs < 60) return `${diffMin >= 0 ? "in" : ""} ${abs} min ${diffMin >= 0 ? "" : "ago"}`.trim();
    const diffHr = Math.round(diffMin / 60);
    if (Math.abs(diffHr) < 48) return diffHr >= 0 ? `in ${diffHr}h` : `${Math.abs(diffHr)}h ago`;
    const diffDay = Math.round(diffHr / 24);
    return diffDay >= 0 ? `in ${diffDay}d` : `${Math.abs(diffDay)}d ago`;
  }

  function renderHero() {
    const club = document.getElementById("hero-club");
    club.textContent = `${HEDGES.bio.currentClub} · ${HEDGES.bio.currentClubLeague} · Wales`;
  }

  function renderMatchday() {
    const md = HEDGES.matchday;
    const el = document.getElementById("matchday-card");
    const statusText = md.statusLabel || STATUS_LABELS[md.status] || "Status unknown";
    const kickoff = formatDate(md.kickoffISO);
    const rel = relativeTime(md.kickoffISO);
    const asOf = formatDate(md.asOfISO);

    el.innerHTML = `
      <div class="md-status-bar status-${md.status}">
        <span class="status-dot"></span>
        <span>${statusText}</span>
      </div>
      <div class="md-body">
        <p class="md-fixture">${md.club} vs ${md.opponent}</p>
        <p class="md-meta">${md.competition} · ${md.venue} · ${kickoff} (${rel})</p>
        <p class="md-detail">${md.detail}</p>
        <div class="md-source">
          <span>Source: ${md.source} · as of ${asOf}</span>
          <span class="${md.confirmed ? "confirmed-pill" : "unconfirmed-pill"}">
            ${md.confirmed ? "Official teamsheet" : "Not yet confirmed"}
          </span>
        </div>
      </div>
    `;
  }

  function renderStats() {
    const tbody = document.querySelector("#stats-table tbody");
    const tfoot = document.querySelector("#stats-table tfoot");
    let totalApps = 0;
    let totalGoals = 0;

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

    tfoot.innerHTML = `
      <tr>
        <td>Career total</td>
        <td></td>
        <td>${totalApps}</td>
        <td>${totalGoals}</td>
      </tr>
    `;

    document.getElementById("stats-footnote").textContent =
      "Senior club career only. Figures combine league and cup competitions.";
  }

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
    const list = document.getElementById("honours-list");
    list.innerHTML = HEDGES.honours.map((h) => `
      <li>
        <span class="li-title">${h.title}</span>
        <span class="li-sub">${h.club} · ${h.season}</span>
      </li>
    `).join("");
  }

  function renderHighlights() {
    const grid = document.getElementById("highlights-grid");
    grid.innerHTML = HEDGES.highlights.map((h) => {
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
    renderMatchday();
    renderStats();
    renderInternational();
    renderHonours();
    renderHighlights();
    renderAbout();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

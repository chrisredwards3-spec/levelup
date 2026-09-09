// Ryan Hedges career app — data file
// Update MATCHDAY by hand on/around each fixture; everything else changes rarely.

const HEDGES = {
  bio: {
    fullName: "Ryan Peter Hedges",
    born: "1995-07-08",
    birthplace: "Northampton, England (raised in Mancot, Wales)",
    height: "5 ft 9 in (175 cm)",
    position: "Winger / Left Wing-Back",
    nationality: "Wales",
    currentClub: "Derby County",
    currentClubLeague: "EFL Championship",
    shirtNumber: null,
  },

  // Club-by-club senior career. Source: club statements + public stats archives, Sept 2026.
  careerStats: [
    { club: "Flint Town United", years: "2012–2013", apps: 24, goals: 2, note: "Welsh Premier League — first senior football" },
    { club: "Swansea City", years: "2013–2017", apps: 0, goals: 0, note: "Academy graduate, out on loan throughout" },
    { club: "Leyton Orient", years: "2015 (loan)", apps: 17, goals: 2, note: "" },
    { club: "Stevenage", years: "2016 (loan)", apps: 6, goals: 0, note: "" },
    { club: "Yeovil Town", years: "2016–2017 (loan)", apps: 21, goals: 4, note: "" },
    { club: "Barnsley", years: "2017–2019", apps: 52, goals: 2, note: "Promoted to the Championship, 2018–19" },
    { club: "Aberdeen", years: "2019–2022", apps: 66, goals: 11, note: "Europa League & Scottish Cup semi-final run" },
    { club: "Blackburn Rovers", years: "2022–2026", apps: 137, goals: 8, note: "Goal of the Season winner vs Watford" },
    { club: "Derby County", years: "2026–present", apps: 3, goals: 0, note: "Signed as a free agent, Aug 2026" },
  ],

  international: {
    team: "Wales",
    caps: 3,
    goals: 0,
    span: "2017–2019",
    debut: "v Panama (friendly), November 2017",
    note: "Also capped at U19 and U21 level for Wales.",
  },

  honours: [
    { title: "EFL League One — Promotion (2nd place)", club: "Barnsley", season: "2018–19" },
    { title: "Scottish Cup semi-finalist", club: "Aberdeen", season: "2019–20" },
    { title: "Goal of the Season", club: "Blackburn Rovers", season: "2023–24" },
  ],

  highlights: [
    {
      title: "Goal of the Season — wonder strike vs Watford",
      club: "Blackburn Rovers",
      type: "youtube",
      youtubeId: "ngHE6Ln0vJ4",
    },
    {
      title: "Welcome to Derby",
      club: "Derby County",
      type: "youtube",
      youtubeId: "o9GQNsp8N14",
    },
    {
      title: "Europa League qualifying hat-trick vs NSÍ Runavik (6–0)",
      club: "Aberdeen",
      type: "text",
      description: "Hedges completed a hat-trick, including a penalty, as Aberdeen cruised through Europa League qualifying.",
    },
    {
      title: "Wales senior debut",
      club: "Wales",
      type: "text",
      description: "Came off the bench to win his first senior cap against Panama in a friendly, November 2017.",
    },
  ],

  // Manually updated around each fixture — this is the single thing that needs
  // refreshing on a match day. status: "not_announced" | "named_squad" |
  // "starting_xi" | "substitute" | "not_selected"
  matchday: {
    club: "Derby County",
    opponent: "West Bromwich Albion",
    competition: "EFL Championship",
    venue: "Pride Park Stadium (H)",
    kickoffISO: "2026-09-09T18:45:00Z",
    status: "substitute",
    statusLabel: "Named among the substitutes",
    detail: "Pre-match team news has Hedges available for impact off the bench, with Szmodics and Clark preferred to start in attack.",
    asOfISO: "2026-09-09T15:00:00Z",
    source: "Pre-match team news preview",
    confirmed: false, // true once an official teamsheet has been published
  },
};

/* ═══════════════════════════════════════════════════════════════
   PFE · Recent Papers — app.js
   ═══════════════════════════════════════════════════════════════ */

/* ─── SITE CONFIG (edit freely) ─────────────────────────────────── */
const SITE_CONFIG = {
  title: "PFE · Recent Papers",
  subtitle: "Curated research for our project",
};

/* ─── DOMAIN COLOR PALETTE ──────────────────────────────────────── */
const DOMAIN_PALETTE = [
  { bg: "#dde4ff", fg: "#3b5bdb" },
  { bg: "#d3f9d8", fg: "#2f9e44" },
  { bg: "#fff3bf", fg: "#e67700" },
  { bg: "#ffe8cc", fg: "#d9480f" },
  { bg: "#f3d9fa", fg: "#9c36b5" },
  { bg: "#d0ebff", fg: "#1971c2" },
  { bg: "#fcc2d7", fg: "#a61e4d" },
  { bg: "#c5f6fa", fg: "#0c8599" },
  { bg: "#e9fac8", fg: "#5c940d" },
  { bg: "#ffe3e3", fg: "#c92a2a" },
];
const DOMAIN_PALETTE_DARK = [
  { bg: "#1a2150", fg: "#748ffc" },
  { bg: "#0c2b18", fg: "#51cf66" },
  { bg: "#2b1f00", fg: "#ffd43b" },
  { bg: "#2b1400", fg: "#ff922b" },
  { bg: "#20103a", fg: "#da77f2" },
  { bg: "#0a1f3d", fg: "#4dabf7" },
  { bg: "#2a0d1e", fg: "#f783ac" },
  { bg: "#001e26", fg: "#22d3ee" },
  { bg: "#162500", fg: "#a9e34b" },
  { bg: "#2a0a0a", fg: "#ff6b6b" },
];

/* ─── STATE ─────────────────────────────────────────────────────── */
let allPapers = []; // raw data from JSON
let filteredPapers = []; // after search+filter+sort
let currentPaper = null; // paper shown in side panel
let domainColorMap = {}; // domain → index
let domainCounter = 0;

const state = {
  search: "",
  year: "",
  domain: "",
  venue: "",
  score: "",
  sortBy: "year-desc",
};

/* ─── DOM REFS ──────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const siteTitle = $("siteTitle");
const siteSubtitle = $("siteSubtitle");
const statTotal = $("statTotal");
const statYears = $("statYears");
const statDomains = $("statDomains");
const statAvgScore = $("statAvgScore");
const searchInput = $("searchInput");
const searchClear = $("searchClear");
const filterYear = $("filterYear");
const filterDomain = $("filterDomain");
const filterVenue = $("filterVenue");
const filterScore = $("filterScore");
const sortBy = $("sortBy");
const activeFilters = $("activeFilters");
const papersList = $("papersList");
const loadingState = $("loadingState");
const emptyState = $("emptyState");
const errorBanner = $("errorBanner");
const panelOverlay = $("panelOverlay");
const detailPanel = $("detailPanel");
const panelTitle = $("panelTitle");
const panelByline = $("panelByline");
const panelBadges = $("panelBadges");
const panelBody = $("panelBody");
const panelClose = $("panelClose");
const themeToggle = $("themeToggle");
const helpBtn = $("helpBtn");
const helpOverlay = $("helpOverlay");
const helpClose = $("helpClose");
const resetFilters = $("resetFiltersBtn");

/* ─── HELPERS ───────────────────────────────────────────────────── */
const safe = (v) => (v !== null && v !== undefined && v !== "" ? v : null);
const safeArr = (v) => (Array.isArray(v) && v.length ? v : null);
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function isDark() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function domainColor(domain) {
  if (!(domain in domainColorMap)) {
    domainColorMap[domain] = domainCounter++ % DOMAIN_PALETTE.length;
  }
  const idx = domainColorMap[domain];
  return isDark() ? DOMAIN_PALETTE_DARK[idx] : DOMAIN_PALETTE[idx];
}

function scoreClass(score) {
  if (score === null || score === undefined) return "ring-none";
  if (score >= 7) return "ring-high";
  if (score >= 4) return "ring-mid";
  return "ring-low";
}

function scoreRingHTML(score) {
  const r = 16,
    cx = 19,
    cy = 19;
  const circ = 2 * Math.PI * r;
  const pct = score !== null && score !== undefined ? score / 10 : 0;
  const dash = circ * pct;
  const cls = scoreClass(score);
  const label = score !== null && score !== undefined ? score : "—";
  return `<svg class="score-ring ${cls}" viewBox="0 0 38 38" aria-label="Relevance score: ${label}/10">
    <circle class="ring-bg"   cx="${cx}" cy="${cy}" r="${r}"/>
    <circle class="ring-fill" cx="${cx}" cy="${cy}" r="${r}"
      stroke-dasharray="${dash} ${circ}" stroke-dashoffset="0"/>
    <text class="ring-text" x="${cx}" y="${cy}">${label}</text>
  </svg>`;
}

function formatAuthors(authors, max = 3) {
  if (!safeArr(authors)) return "Authors not listed";
  const names = authors.map((a) => a.name || a).filter(Boolean);
  if (!names.length) return "Authors not listed";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}

function getYear(paper) {
  return safe(paper?.metadata?.year);
}
function getTitle(paper) {
  return safe(paper?.metadata?.title) || "Untitled Paper";
}
function getDomain(paper) {
  return safe(paper?.problem?.domain) || null;
}
function getVenue(paper) {
  return safe(paper?.metadata?.venue) || null;
}
function getScore(paper) {
  return safe(paper?.your_analysis?.relevance_score);
}

/* ─── DATA LOADING ──────────────────────────────────────────────── */
async function loadData() {
  try {
    const resp = await fetch("./data.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json();
    const data = Array.isArray(raw) ? raw : [raw];

    // Deduplicate by paper_id
    const seen = new Set();
    allPapers = [];
    for (const p of data) {
      const id = p.paper_id || Math.random().toString(36).slice(2);
      if (seen.has(id)) {
        console.warn(`[PFE] Duplicate paper_id: ${id} — last entry wins`);
      }
      seen.add(id);
      allPapers = allPapers.filter((x) => x.paper_id !== id);
      allPapers.push({ ...p, paper_id: id });
    }

    loadingState.classList.add("hidden");
    init();
  } catch (err) {
    console.error(err);
    loadingState.classList.add("hidden");
    errorBanner.classList.remove("hidden");
  }
}

/* ─── INIT ──────────────────────────────────────────────────────── */
function init() {
  siteTitle.textContent = SITE_CONFIG.title;
  siteSubtitle.textContent = SITE_CONFIG.subtitle;
  document.title = SITE_CONFIG.title;

  buildDropdowns();
  updateStats(allPapers);
  applyFilters();
}

function buildDropdowns() {
  const years = [...new Set(allPapers.map(getYear).filter(Boolean))].sort(
    (a, b) => b - a
  );
  const domains = [...new Set(allPapers.map(getDomain).filter(Boolean))].sort();
  const venues = [...new Set(allPapers.map(getVenue).filter(Boolean))].sort();

  years.forEach((y) => {
    const o = document.createElement("option");
    o.value = y;
    o.textContent = y;
    filterYear.appendChild(o);
  });
  domains.forEach((d) => {
    const o = document.createElement("option");
    o.value = d;
    o.textContent = d;
    filterDomain.appendChild(o);
  });
  venues.forEach((v) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    filterVenue.appendChild(o);
  });
}

/* ─── STATS ─────────────────────────────────────────────────────── */
function updateStats(papers) {
  statTotal.textContent = papers.length;

  const years = papers.map(getYear).filter(Boolean).map(Number);
  if (years.length) {
    const mn = Math.min(...years),
      mx = Math.max(...years);
    statYears.textContent = mn === mx ? mn : `${mn}–${mx}`;
  } else {
    statYears.textContent = "—";
  }

  const domains = new Set(papers.map(getDomain).filter(Boolean));
  statDomains.textContent = domains.size || "—";

  const scores = papers
    .map(getScore)
    .filter((s) => s !== null && s !== undefined);
  if (scores.length) {
    statAvgScore.textContent = (
      scores.reduce((a, b) => a + b, 0) / scores.length
    ).toFixed(1);
  } else {
    statAvgScore.textContent = "—";
  }
}

/* ─── FILTER + SORT ─────────────────────────────────────────────── */
function applyFilters() {
  const q = state.search.toLowerCase().trim();

  filteredPapers = allPapers.filter((p) => {
    // Search
    if (q) {
      const haystack = [
        getTitle(p),
        getDomain(p),
        getVenue(p),
        getYear(p),
        ...(p.metadata?.authors || []).map((a) => a.name || a),
        ...(p.metadata?.keywords || []),
        p.problem?.problem_statement || "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (state.year && String(getYear(p)) !== String(state.year)) return false;
    if (state.domain && getDomain(p) !== state.domain) return false;
    if (state.venue && getVenue(p) !== state.venue) return false;
    if (state.score) {
      const s = getScore(p);
      if (s === null || s === undefined || s < Number(state.score))
        return false;
    }
    return true;
  });

  // Sort
  filteredPapers.sort((a, b) => {
    switch (state.sortBy) {
      case "year-asc":
        return (getYear(a) || 0) - (getYear(b) || 0);
      case "year-desc":
        return (getYear(b) || 0) - (getYear(a) || 0);
      case "score-desc":
        return (getScore(b) ?? -1) - (getScore(a) ?? -1);
      case "title-asc":
        return getTitle(a).localeCompare(getTitle(b));
      default:
        return 0;
    }
  });

  renderActiveFilters();
  renderPapers();
  updateStats(filteredPapers);
}

/* ─── ACTIVE FILTER CHIPS ────────────────────────────────────────── */
function renderActiveFilters() {
  activeFilters.innerHTML = "";
  const active = [];
  if (state.search) active.push({ label: `"${state.search}"`, key: "search" });
  if (state.year) active.push({ label: `Year: ${state.year}`, key: "year" });
  if (state.domain)
    active.push({ label: `Domain: ${state.domain}`, key: "domain" });
  if (state.venue)
    active.push({ label: `Venue: ${state.venue}`, key: "venue" });
  if (state.score)
    active.push({ label: `Score ≥ ${state.score}`, key: "score" });

  active.forEach(({ label, key }) => {
    const chip = document.createElement("div");
    chip.className = "filter-chip";
    chip.setAttribute("role", "listitem");
    chip.innerHTML = `<span>${esc(label)}</span>
      <button aria-label="Remove filter ${esc(label)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    chip
      .querySelector("button")
      .addEventListener("click", () => clearFilter(key));
    activeFilters.appendChild(chip);
  });
}

function clearFilter(key) {
  state[key] = "";
  if (key === "search") {
    searchInput.value = "";
    searchClear.classList.add("hidden");
  }
  if (key === "year") filterYear.value = "";
  if (key === "domain") filterDomain.value = "";
  if (key === "venue") filterVenue.value = "";
  if (key === "score") filterScore.value = "";
  applyFilters();
}

function resetAllFilters() {
  state.search = "";
  state.year = "";
  state.domain = "";
  state.venue = "";
  state.score = "";
  searchInput.value = "";
  searchClear.classList.add("hidden");
  filterYear.value = "";
  filterDomain.value = "";
  filterVenue.value = "";
  filterScore.value = "";
  applyFilters();
}

/* ─── RENDER PAPERS ─────────────────────────────────────────────── */
function renderPapers() {
  papersList.innerHTML = "";

  if (!filteredPapers.length) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  // Group by year (null → "Year Unknown" at the bottom)
  const groups = new Map();
  filteredPapers.forEach((p) => {
    const yr = getYear(p) ?? "__unknown__";
    if (!groups.has(yr)) groups.set(yr, []);
    groups.get(yr).push(p);
  });

  // Sort year keys: numeric years desc, then unknown at end
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === "__unknown__") return 1;
    if (b === "__unknown__") return -1;
    // For year-asc sort
    if (state.sortBy === "year-asc") return Number(a) - Number(b);
    return Number(b) - Number(a);
  });

  sortedKeys.forEach((yr) => {
    const papers = groups.get(yr);
    const yearLabel = yr === "__unknown__" ? "Year Unknown" : yr;
    const group = document.createElement("div");
    group.className = "year-group";

    // Year separator
    group.innerHTML = `
      <div class="year-separator">
        <div class="year-label">
          📅 ${esc(String(yearLabel))}
          <span class="year-count">${papers.length}</span>
        </div>
        <div class="year-line"></div>
      </div>
      <div class="cards-grid" id="grid-${esc(String(yr))}"></div>`;

    papersList.appendChild(group);

    const grid = group.querySelector(".cards-grid");
    papers.forEach((p) => grid.appendChild(buildCard(p)));
  });
}

/* ─── BUILD CARD ────────────────────────────────────────────────── */
function buildCard(paper) {
  const card = document.createElement("article");
  card.className = "paper-card";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Open paper: ${getTitle(paper)}`);

  const title = getTitle(paper);
  const authors = formatAuthors(paper.metadata?.authors);
  const venue = getVenue(paper);
  const year = getYear(paper);
  const domain = getDomain(paper);
  const score = getScore(paper);
  const keywords = safeArr(paper.metadata?.keywords) || [];
  const maxKw = 4;

  const color = domain ? domainColor(domain) : null;
  const domainStyle = color
    ? `style="background:${color.bg};color:${color.fg};border-color:${color.fg}33"`
    : "";

  const kwHTML =
    keywords
      .slice(0, maxKw)
      .map((k) => `<span class="kw-chip">${esc(k)}</span>`)
      .join("") +
    (keywords.length > maxKw
      ? `<span class="kw-chip">+${keywords.length - maxKw}</span>`
      : "");

  const badgesHTML = [
    venue ? `<span class="badge badge-venue">${esc(venue)}</span>` : "",
    year ? `<span class="badge badge-year">${esc(String(year))}</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  const avail = paper.outputs || {};
  const availHTML = [
    avail.code_available ? `<span class="avail-badge">💻 Code</span>` : "",
    avail.model_available ? `<span class="avail-badge">🤖 Model</span>` : "",
    avail.demo_available ? `<span class="avail-badge">🎮 Demo</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  card.innerHTML = `
    <div class="card-header">
      <h3 class="card-title" title="${esc(title)}">${esc(title)}</h3>
      <div>${scoreRingHTML(score)}</div>
    </div>
    <div class="card-authors">${esc(authors)}</div>
    ${badgesHTML ? `<div class="card-badges">${badgesHTML}</div>` : ""}
    ${
      domain
        ? `<div><span class="domain-tag" ${domainStyle}>${esc(
            domain
          )}</span></div>`
        : ""
    }
    ${kwHTML ? `<div class="card-keywords">${kwHTML}</div>` : ""}
    ${availHTML ? `<div class="avail-icons">${availHTML}</div>` : ""}
    <div class="card-footer">
      <button class="read-more-btn" tabindex="-1" aria-hidden="true">
        Read more
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="5" y1="12" x2="19" y2="12"/>
          <polyline points="12 5 19 12 12 19"/>
        </svg>
      </button>
    </div>`;

  card.addEventListener("click", () => openPanel(paper));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openPanel(paper);
  });
  return card;
}

/* ─── PANEL ─────────────────────────────────────────────────────── */
function openPanel(paper) {
  currentPaper = paper;

  panelTitle.textContent = getTitle(paper);
  panelByline.textContent = formatAuthors(paper.metadata?.authors, 5);

  // Badges
  const year = getYear(paper);
  const venue = getVenue(paper);
  const score = getScore(paper);
  const domain = getDomain(paper);
  const color = domain ? domainColor(domain) : null;

  panelBadges.innerHTML = [
    year ? `<span class="badge badge-year">${esc(String(year))}</span>` : "",
    venue ? `<span class="badge badge-venue">${esc(venue)}</span>` : "",
    domain
      ? `<span class="domain-tag" ${
          color ? `style="background:${color.bg};color:${color.fg}"` : ""
        }>${esc(domain)}</span>`
      : "",
    score !== null && score !== undefined
      ? `<span class="badge" style="background:${
          scoreClass(score) === "ring-high"
            ? "#d3f9d8"
            : scoreClass(score) === "ring-mid"
            ? "#fff3bf"
            : "#ffe3e3"
        };color:${
          scoreClass(score) === "ring-high"
            ? "#2f9e44"
            : scoreClass(score) === "ring-mid"
            ? "#e67700"
            : "#c92a2a"
        }">${score}/10</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  // Render first tab
  renderTab("overview");
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === "overview");
    b.setAttribute("aria-selected", b.dataset.tab === "overview");
  });

  // Open panel
  detailPanel.classList.add("open");
  detailPanel.setAttribute("aria-hidden", "false");
  panelOverlay.classList.add("visible");
  panelOverlay.setAttribute("aria-hidden", "false");
  panelClose.focus();
  document.body.style.overflow = "hidden";
}

function closePanel() {
  detailPanel.classList.remove("open");
  detailPanel.setAttribute("aria-hidden", "true");
  panelOverlay.classList.remove("visible");
  panelOverlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  currentPaper = null;
}

/* ─── TAB RENDERING ─────────────────────────────────────────────── */
function renderTab(tab) {
  if (!currentPaper) return;
  panelBody.innerHTML = "";
  switch (tab) {
    case "overview":
      panelBody.appendChild(renderOverview(currentPaper));
      break;
    case "experiments":
      panelBody.appendChild(renderExperiments(currentPaper));
      break;
    case "contributions":
      panelBody.appendChild(renderContributions(currentPaper));
      break;
    case "analysis":
      panelBody.appendChild(renderAnalysis(currentPaper));
      break;
    case "metadata":
      panelBody.appendChild(renderMetadata(currentPaper));
      break;
  }
  panelBody.scrollTop = 0;
}

function section(title, contentHTML) {
  if (!contentHTML || contentHTML.trim() === "") return "";
  return `<div class="detail-section">
    <div class="detail-section-title">${esc(title)}</div>
    ${contentHTML}
  </div>`;
}
function textBlock(content) {
  if (!safe(content)) return "";
  return `<p class="detail-text">${esc(String(content))}</p>`;
}
function listBlock(items) {
  if (!safeArr(items)) return "";
  return `<ul>${items
    .map((i) => `<li class="detail-text">${esc(String(i))}</li>`)
    .join("")}</ul>`;
}
function makeDiv(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
}

/* ── Overview Tab ── */
function renderOverview(p) {
  const prob = p.problem || {};
  const meth = p.methodology || {};
  let html = "";
  html += section("Problem Statement", textBlock(prob.problem_statement));
  html += section("Motivation", textBlock(prob.motivation));
  html += section("Research Gap", textBlock(prob.research_gap));
  html += section(
    "Proposed Method",
    meth.model_name
      ? `<p class="detail-text"><strong>${esc(meth.model_name)}</strong>${
          meth.type ? ` — ${esc(meth.type)}` : ""
        }</p>`
      : textBlock(meth.type)
  );
  html += section("Architecture", textBlock(meth.architecture));
  html += section("Key Algorithms", listBlock(meth.algorithms));
  html += section("Workflow Summary", textBlock(meth.workflow_summary));
  html += section("Limitations", listBlock(p.limitations));
  html += section("Future Work", listBlock(p.future_work));
  return makeDiv(
    html ||
      '<p class="detail-text" style="color:var(--text-muted)">No overview data available.</p>'
  );
}

/* ── Experiments Tab ── */
function renderExperiments(p) {
  const data = p.data || {};
  const exp = p.experiments || {};
  const rep = p.reproducibility || {};
  let html = "";

  // Datasets
  if (safeArr(data.datasets_used)) {
    let tbl = `<table class="metrics-table"><thead><tr>
      <th>Name</th><th>Type</th><th>Size</th>
    </tr></thead><tbody>`;
    data.datasets_used.forEach((d) => {
      tbl += `<tr><td>${esc(d.name || "—")}</td><td>${esc(
        d.type || "—"
      )}</td><td>${esc(d.size || "—")}</td></tr>`;
    });
    tbl += "</tbody></table>";
    html += section("Datasets", tbl);
  }
  if (safe(data.preprocessing))
    html += section("Preprocessing", textBlock(data.preprocessing));

  // Metrics + baselines
  if (safeArr(exp.evaluation_metrics)) {
    html += section(
      "Evaluation Metrics",
      `<div class="chips-row">${exp.evaluation_metrics
        .map((m) => `<span class="kw-chip">${esc(m)}</span>`)
        .join("")}</div>`
    );
  }
  if (safeArr(exp.baselines_compared)) {
    html += section("Baselines", listBlock(exp.baselines_compared));
  }

  // Best results table
  if (safeArr(exp.best_results)) {
    let tbl = `<table class="metrics-table"><thead><tr><th>Metric</th><th>Value</th><th>Note</th></tr></thead><tbody>`;
    exp.best_results.forEach((r) => {
      tbl += `<tr><td>${esc(r.metric || "—")}</td><td class="metric-val">${
        r.value !== undefined ? r.value : "—"
      }</td><td>${esc(r.comparison_note || "—")}</td></tr>`;
    });
    tbl += "</tbody></table>";
    html += section("Best Results", tbl);
  }

  if (safe(exp.results_summary))
    html += section("Results Summary", textBlock(exp.results_summary));

  // Reproducibility
  let reproHTML = "";
  if (safe(rep.clear_methodology) !== null) {
    const v = rep.clear_methodology;
    reproHTML += `<span class="repro-flag ${v ? "repro-yes" : "repro-no"}">${
      v ? "✓" : "✗"
    } Clear Methodology</span>`;
  }
  if (safe(rep.public_dataset)) {
    reproHTML += `<span class="repro-flag repro-partial">📦 ${esc(
      String(rep.public_dataset)
    )}</span>`;
  }
  if (safe(rep.hyperparameters_listed)) {
    reproHTML += `<span class="repro-flag repro-partial">⚙️ ${esc(
      String(rep.hyperparameters_listed)
    )}</span>`;
  }
  if (reproHTML)
    html += section(
      "Reproducibility",
      `<div class="repro-flags">${reproHTML}</div>`
    );

  return makeDiv(
    html ||
      '<p class="detail-text" style="color:var(--text-muted)">No experiment data available.</p>'
  );
}

/* ── Contributions Tab ── */
function renderContributions(p) {
  let html = "";
  html += section("Contributions", listBlock(p.contributions));
  if (!safeArr(p.contributions))
    html =
      '<p class="detail-text" style="color:var(--text-muted)">No contributions listed.</p>';
  return makeDiv(html);
}

/* ── Analysis Tab ── */
function renderAnalysis(p) {
  const a = p.your_analysis || {};
  const c = p.complexity || {};
  let html = "";

  // Score
  const score = getScore(p);
  if (score !== null && score !== undefined) {
    html += section(
      "Relevance Score",
      `<div style="display:flex;align-items:center;gap:.8rem">
      ${scoreRingHTML(score)}
      <span class="detail-text">out of 10</span>
    </div>`
    );
  }

  // Strengths
  if (safeArr(a.strengths)) {
    html += section(
      "Strengths",
      `<div class="chips-row">${a.strengths
        .map((s) => `<span class="chip-strength">${esc(s)}</span>`)
        .join("")}</div>`
    );
  }
  // Weaknesses
  if (safeArr(a.weaknesses)) {
    html += section(
      "Weaknesses",
      `<div class="chips-row">${a.weaknesses
        .map((w) => `<span class="chip-weakness">${esc(w)}</span>`)
        .join("")}</div>`
    );
  }

  // Implementation difficulty
  if (safe(a.implementation_difficulty)) {
    const d = String(a.implementation_difficulty).toLowerCase();
    const cls = d.includes("high")
      ? "diff-high"
      : d.includes("low")
      ? "diff-low"
      : "diff-medium";
    html += section(
      "Implementation Difficulty",
      `<span class="difficulty-badge ${cls}">${esc(
        a.implementation_difficulty
      )}</span>`
    );
  }

  // Can we extend
  if (safe(a.can_we_extend_it))
    html += section("Can We Extend It?", textBlock(a.can_we_extend_it));

  // Complexity
  if (
    safe(c.training_time) ||
    safe(c.inference_time) ||
    safe(c.computational_cost)
  ) {
    let cRows = "";
    if (safe(c.training_time))
      cRows += `<tr><td>Training Time</td><td>${esc(
        c.training_time
      )}</td></tr>`;
    if (safe(c.inference_time))
      cRows += `<tr><td>Inference Time</td><td>${esc(
        c.inference_time
      )}</td></tr>`;
    if (safe(c.computational_cost))
      cRows += `<tr><td>Computational Cost</td><td>${esc(
        c.computational_cost
      )}</td></tr>`;
    html += section(
      "Complexity",
      `<table class="metrics-table"><tbody>${cRows}</tbody></table>`
    );
  }

  if (safe(p.notes)) html += section("Notes", textBlock(p.notes));

  return makeDiv(
    html ||
      '<p class="detail-text" style="color:var(--text-muted)">No analysis data available.</p>'
  );
}

/* ── Metadata Tab ── */
function renderMetadata(p) {
  const m = p.metadata || {};
  const o = p.outputs || {};
  let html = "";

  // Authors
  if (safeArr(m.authors)) {
    const authorsHTML = m.authors
      .map((a) => {
        const name = a.name || String(a);
        const affil = a.affiliation || null;
        return `<div class="author-item">
        <span class="author-name">${esc(name)}</span>
        ${affil ? `<span class="author-affil">${esc(affil)}</span>` : ""}
      </div>`;
      })
      .join("");
    html += section(
      "Authors",
      `<div class="authors-list">${authorsHTML}</div>`
    );
  }

  // DOI / URL
  const links = [];
  if (safe(m.doi))
    links.push(`<a href="https://doi.org/${esc(
      m.doi
    )}" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    DOI: ${esc(m.doi)}
  </a>`);
  if (safe(m.url))
    links.push(`<a href="${esc(m.url)}" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    Paper URL
  </a>`);
  if (o.code_available && safe(o.code_url))
    links.push(
      `<a href="${esc(
        o.code_url
      )}"  target="_blank" rel="noopener">💻 Code Repository</a>`
    );
  if (o.model_available && safe(o.model_url))
    links.push(
      `<a href="${esc(
        o.model_url
      )}" target="_blank" rel="noopener">🤖 Model</a>`
    );
  if (o.demo_available && safe(o.demo_url))
    links.push(
      `<a href="${esc(o.demo_url)}"  target="_blank" rel="noopener">🎮 Demo</a>`
    );
  if (links.length)
    html += section(
      "Links",
      `<div class="meta-link-row">${links.join("")}</div>`
    );

  // PDF
  if (safe(p.pdf_path)) {
    html += section(
      "PDF",
      `<div class="meta-link-row"><a href="${esc(
        p.pdf_path
      )}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      View PDF
    </a></div>`
    );
  }

  // Keywords
  if (safeArr(m.keywords)) {
    html += section(
      "Keywords",
      `<div class="chips-row">${m.keywords
        .map((k) => `<span class="kw-chip">${esc(k)}</span>`)
        .join("")}</div>`
    );
  }

  // Citations
  if (safe(m.citations_count) !== null) {
    html += section("Citations", textBlock(m.citations_count));
  }

  // Provenance
  let provRows = "";
  const pid = safe(p.paper_id);
  if (pid)
    provRows += `<tr><td>Paper ID</td><td><code>${esc(pid)}</code></td></tr>`;
  if (safe(p.added_by))
    provRows += `<tr><td>Added by</td><td>${esc(p.added_by)}</td></tr>`;
  if (safe(p.date_added))
    provRows += `<tr><td>Date added</td><td>${esc(p.date_added)}</td></tr>`;
  if (provRows)
    html += section(
      "Provenance",
      `<table class="metrics-table"><tbody>${provRows}</tbody></table>`
    );

  return makeDiv(
    html ||
      '<p class="detail-text" style="color:var(--text-muted)">No metadata available.</p>'
  );
}

/* ─── THEME ─────────────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("pfe-theme", theme);
  // Refresh domain tag colors (they depend on isDark())
  if (allPapers.length) renderPapers();
}

function toggleTheme() {
  applyTheme(isDark() ? "light" : "dark");
  // Re-render open panel badges if open
  if (currentPaper) {
    const activeTab =
      document.querySelector(".tab-btn.active")?.dataset?.tab || "overview";
    openPanel(currentPaper);
    // re-activate the same tab
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === activeTab);
      b.setAttribute("aria-selected", b.dataset.tab === activeTab);
    });
    renderTab(activeTab);
  }
}

/* ─── EVENT LISTENERS ───────────────────────────────────────────── */

// Theme toggle
themeToggle.addEventListener("click", toggleTheme);

// Search
let searchDebounce;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const val = searchInput.value;
  searchClear.classList.toggle("hidden", !val);
  searchDebounce = setTimeout(() => {
    state.search = val;
    applyFilters();
  }, 200);
});
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  state.search = "";
  searchClear.classList.add("hidden");
  searchInput.focus();
  applyFilters();
});

// Filter selects
filterYear.addEventListener("change", () => {
  state.year = filterYear.value;
  applyFilters();
});
filterDomain.addEventListener("change", () => {
  state.domain = filterDomain.value;
  applyFilters();
});
filterVenue.addEventListener("change", () => {
  state.venue = filterVenue.value;
  applyFilters();
});
filterScore.addEventListener("change", () => {
  state.score = filterScore.value;
  applyFilters();
});
sortBy.addEventListener("change", () => {
  state.sortBy = sortBy.value;
  applyFilters();
});

// Reset filters button (empty state)
resetFilters.addEventListener("click", resetAllFilters);

// Panel
panelClose.addEventListener("click", closePanel);
panelOverlay.addEventListener("click", closePanel);
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    renderTab(btn.dataset.tab);
  });
});

// Help modal
helpBtn.addEventListener("click", () => helpOverlay.classList.remove("hidden"));
helpClose.addEventListener("click", () => helpOverlay.classList.add("hidden"));
helpOverlay.addEventListener("click", (e) => {
  if (e.target === helpOverlay) helpOverlay.classList.add("hidden");
});

// Keyboard
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!helpOverlay.classList.contains("hidden")) {
      helpOverlay.classList.add("hidden");
      return;
    }
    if (currentPaper) {
      closePanel();
      return;
    }
  }
});

/* ─── BOOTSTRAP ─────────────────────────────────────────────────── */
(function bootstrap() {
  // Restore theme
  const saved =
    localStorage.getItem("pfe-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  document.documentElement.setAttribute("data-theme", saved);

  loadData();
})();

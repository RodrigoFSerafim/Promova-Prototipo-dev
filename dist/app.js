const LEVELS = ["L1", "L2", "L3", "L4", "L5"];
const SESSION_STORAGE_KEY = "promova.session-evidences";
const AUTH_USERS_KEY = "promova.accounts-v1";
const AUTH_SESSION_KEY = "promova.session-user-v1";
const PROMOVA_API_BASE_KEY = "promova.promova-backend-url-v1";

function loadPersistedPromovaApiBase() {
  if (typeof sessionStorage === "undefined") {
    return "http://localhost:3100";
  }

  try {
    const raw = sessionStorage.getItem(PROMOVA_API_BASE_KEY);
    if (raw && String(raw).trim()) {
      return String(raw).trim().replace(/\/+$/, "");
    }
  } catch {
    //
  }

  return "http://localhost:3100";
}

function persistPromovaApiBase(url) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  try {
    const normalized = String(url).trim().replace(/\/+$/, "");
    sessionStorage.setItem(PROMOVA_API_BASE_KEY, normalized || "http://localhost:3100");
  } catch {
    //
  }
}

/** @returns {{ owner: string, repo: string } | null} */
function parseGithubRepoSlug(raw) {
  let s = String(raw || "").trim();
  if (!s) {
    return null;
  }

  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (u.hostname.toLowerCase() === "github.com") {
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length >= 2) {
          return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") };
        }
      }
    }
  } catch {
    //
  }

  s = s.replace(/^git@github\.com:/i, "").replace(/\.git$/i, "");

  const cut = s.split(/[?\#]/)[0];
  const chunks = cut.split("/").filter(Boolean);

  if (chunks.length >= 2) {
    return { owner: chunks[0], repo: chunks[1] };
  }

  const singleSlash = /^([^/]+)\/([^/]+)$/i.exec(cut);
  if (singleSlash) {
    return { owner: singleSlash[1], repo: singleSlash[2] };
  }

  return null;
}

function truncateForCard(text, max = 132) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) {
    return t;
  }

  return `${t.slice(0, max)}…`;
}

async function githubApiJson(apiBaseRaw, pathnameWithSlash) {
  const base =
    apiBaseRaw && String(apiBaseRaw).trim()
      ? String(apiBaseRaw).trim().replace(/\/+$/, "")
      : "http://localhost:3100";
  const path = pathnameWithSlash.startsWith("/") ? pathnameWithSlash : `/${pathnameWithSlash}`;
  const url = `${base}${path}`;

  /** @type {Response} */
  const response =
    typeof fetch === "function" ?
      await fetch(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" })
    : null;

  if (!response) {
    throw new Error("Este navegador não suporta fetch — use um ambiente atual.");
  }

  const body = /** @type {Record<string, unknown>} */ (await response.json().catch(() => ({})));

  if (!response.ok) {
    const msg =
      typeof body?.error === "string" ?
        body.error
      : typeof body.message === "string" ?
        body.message
      : `Falha na API (${response.status})`;

    /** @type {Error & { status?: number }} */
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }

  return body;
}

function buildEvidenceMarkdownFromGithubBundle(bundle, repoSlug, usernameHint) {
  const hintTrim = typeof usernameHint === "string" ? usernameHint.trim() : "";
  const pr =
    bundle && typeof bundle === "object" && bundle.pull_request && typeof bundle.pull_request === "object" ?
      /** @type {Record<string, unknown>} */ (bundle.pull_request)
    : {};

  const num = typeof pr.number === "number" ? pr.number : "—";
  const titleStr = typeof pr.title === "string" ? pr.title : "";
  const bodyFull =
    typeof pr.body_full === "string" && pr.body_full.trim() ?
      pr.body_full.trim()
    : typeof pr.body_preview === "string" ?
      String(pr.body_preview).trim()
    : "";

  const bodyShort = truncateForCard(bodyFull, 780);
  const login =
    hintTrim ?
      hintTrim
    : typeof pr.author_login === "string" && pr.author_login ?
      `@${pr.author_login} (autor do PR)`
    : "";

  const add = typeof pr.additions === "number" ? pr.additions : 0;
  const del = typeof pr.deletions === "number" ? pr.deletions : 0;
  const files = typeof pr.changed_files_count === "number" ? pr.changed_files_count : 0;
  const link = typeof pr.html_url === "string" ? pr.html_url : "";

  return [
    `GitHub • repositório ${repoSlug} • PR #${num}`,
    login ? `Contexto/perfil relacionado à leitura: ${login}` : "",
    "",
    `Título: ${titleStr}`,
    "",
    `Volume coletado via API (+${add} −${del} linhas, ${files} arquivo(s)).`,
    "",
    bodyShort ? `Descrição/resumo:` : "",
    bodyShort ? bodyShort : "",
    "",
    link ? `Link público do PR: ${link}` : "",
    "",
    "Posso revisar/editar esse texto antes de clicar em “Analisar evidência”.",
  ]
    .filter((line, index, lines) =>
      !(line === "" && (lines[index + 1] === "" || index === lines.length - 1)) ? true : line !== "",
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeEmail(value) {
  return String(value).trim().toLowerCase();
}

function loadAuthAccounts() {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(AUTH_USERS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistAuthAccounts(accounts) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(accounts));
}

function loadAuthSession() {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.email === "string" &&
      typeof parsed.name === "string"
    ) {
      return { email: normalizeEmail(parsed.email), name: String(parsed.name).trim() };
    }

    return null;
  } catch {
    return null;
  }
}

function persistAuthSession(user) {
  if (typeof localStorage === "undefined") {
    return;
  }

  if (!user) {
    localStorage.removeItem(AUTH_SESSION_KEY);
    return;
  }

  localStorage.setItem(
    AUTH_SESSION_KEY,
    JSON.stringify({ email: normalizeEmail(user.email), name: String(user.name).trim() }),
  );
}


const INITIAL_FORM = {
  evidence: "",
  currentLevel: "L3",
  targetLevel: "L4",
  githubRepo: "",
  githubPullNumber: "",
  githubUsernameHint: "",
};

const state = {
  view: "home",
  form: { ...INITIAL_FORM },
  result: null,
  evidences: loadSessionEvidences(),
  authSession: loadAuthSession(),
  loginError: "",
  registerError: "",
  promovaApiBase: loadPersistedPromovaApiBase(),
  githubImport: {
    loading: false,
    error: "",
    pulls: /** @type {Array<Record<string, unknown>>} */ ([]),
  },
  pendingGithubEvidence: /** @type {null | Record<string, unknown>} */ (null),
};

function isAuthenticated() {
  return Boolean(state.authSession);
}

const app = document.querySelector("#app");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDisplayName(name) {
  const n = String(name).trim();
  if (!n) {
    return "Usuário";
  }

  const first = n.split(/\s+/)[0];
  return first.length > 24 ? `${first.slice(0, 22)}…` : first;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function loadSessionEvidences() {
  if (typeof sessionStorage === "undefined") {
    return [];
  }

  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSessionEvidences() {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.evidences));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `evidence-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function levelIndex(level) {
  return LEVELS.indexOf(level);
}

function analyzeEvidence(evidence, currentLevel, targetLevel) {
  const text = evidence.trim();
  const normalized = text.toLowerCase();
  const includesAny = (words) => words.some((word) => normalized.includes(word));
  const hasMetrics =
    /\b(\d+%|\d+x|\d+\+|\$?\d+(?:\.\d+)?[km]?|cobertura|latency|latência|bugs?|incidents?|incidentes?|revenue|receita|users?|usuários?|customers?|clientes?|adoption|adoção|efficiency|eficiência)\b/i.test(
      text,
    );

  let impactLevel = "L2";
  let justification =
    "A evidência está clara, mas ainda precisa de um sinal mais forte de escopo ou impacto mensurável.";
  let competencies = ["Confiabilidade na entrega"];
  let suggestions = [
    "Adicione um resultado mensurável, como cobertura, latência, adoção ou eficiência.",
  ];

  if (
    includesAny([
      "refactor",
      "refatorei",
      "refator",
      "improve",
      "melhor",
      "increased",
      "increase",
      "aumentei",
      "aumentar",
      "optimize",
      "optimized",
      "otimizei",
      "migration",
      "migração",
      "migrar",
      "reduced",
      "reduce",
      "reduzi",
    ])
  ) {
    impactLevel = "L4";
    justification = "Demonstra protagonismo e uma melhora mensurável na qualidade do sistema.";
    competencies = ["Qualidade de código", "Protagonismo"];
    suggestions = hasMetrics
      ? ["Destaque de forma mais explícita o resultado antes e depois."]
      : ["Inclua métricas de impacto no negócio."];
  } else if (
    includesAny([
      "help",
      "ajudei",
      "support",
      "suporte",
      "assist",
      "apoiei",
      "collaborate",
      "colaborei",
      "collaboration",
      "mentoria",
      "mentor",
    ])
  ) {
    impactLevel = "L3";
    justification = "Mostra colaboração e apoio confiável ao time.";
    competencies = ["Colaboração", "Apoio ao time"];
    suggestions = ["Adicione o resultado concreto do apoio que você prestou."];
  }

  if (levelIndex(impactLevel) < levelIndex(targetLevel)) {
    suggestions.push(`Adicione evidências que sustentem um impacto de ${targetLevel}.`);
  }

  const readiness =
    levelIndex(impactLevel) >= levelIndex(targetLevel)
      ? `Esta evidência está alinhada com o seu alvo atual de ${targetLevel}.`
      : `Esta evidência ainda está abaixo do seu alvo de ${targetLevel}, então pode ser fortalecida com resultados mensuráveis.`;

  return {
    id: createId(),
    impactLevel,
    justification,
    competencies,
    suggestions,
    readiness,
    currentLevel,
    targetLevel,
    evidence: text,
    createdAt: new Date().toISOString(),
  };
}

function formatTimestamp(isoDate) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

function badgeClass(level) {
  if (level === "L4" || level === "L5") {
    return "badge success";
  }

  if (level === "L3") {
    return "badge info";
  }

  return "badge neutral";
}

function levelOptions(selectedLevel) {
  return LEVELS.map(
    (level) => `<option value="${level}"${level === selectedLevel ? " selected" : ""}>${level}</option>`,
  ).join("");
}

function resetForm() {
  state.form = { ...INITIAL_FORM };
  state.githubImport.loading = false;
  state.githubImport.error = "";
  state.githubImport.pulls = [];
  state.pendingGithubEvidence = null;
}

function saveEvidence(result) {
  state.evidences = [result, ...state.evidences];
  persistSessionEvidences();
}

function getEvidenceSourceLabel(item) {
  if (item && typeof item === "object" && item.source === "github") {
    const repo = typeof item.githubRepo === "string" ? item.githubRepo : "";
    const pr = Number.isFinite(item.githubPullNumber) ? `PR #${item.githubPullNumber}` : "PR";
    return repo ? `GitHub • ${repo} • ${pr}` : `GitHub • ${pr}`;
  }

  return "Manual";
}

async function searchGithubPullsForForm() {
  const slug = parseGithubRepoSlug(state.form.githubRepo);
  if (!slug) {
    throw new Error("Informe o repositório no formato owner/repo (ou URL do GitHub).");
  }

  const query = state.form.githubUsernameHint.trim()
    ? `author:${state.form.githubUsernameHint.trim()}`
    : "is:open is:closed";

  const payload = await githubApiJson(
    state.promovaApiBase,
    `/api/github/repos/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.repo)}/pulls/search?q=${encodeURIComponent(query)}&per_page=12`,
  );

  const pulls = Array.isArray(payload?.pulls) ? payload.pulls : [];
  state.githubImport.pulls = pulls;
  if (!pulls.length) {
    throw new Error("Nenhum PR encontrado para os filtros informados.");
  }
}

async function importGithubEvidenceIntoForm() {
  const slug = parseGithubRepoSlug(state.form.githubRepo);
  if (!slug) {
    throw new Error("Informe o repositório no formato owner/repo (ou URL do GitHub).");
  }

  const pullNumber = Number.parseInt(String(state.form.githubPullNumber || "").trim(), 10);
  if (!Number.isFinite(pullNumber) || pullNumber < 1) {
    throw new Error("Informe um número de PR válido para importar.");
  }

  const payload = await githubApiJson(
    state.promovaApiBase,
    `/api/github/repos/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.repo)}/pulls/${pullNumber}`,
  );

  const repoSlug = `${slug.owner}/${slug.repo}`;
  state.form.evidence = buildEvidenceMarkdownFromGithubBundle(
    payload,
    repoSlug,
    state.form.githubUsernameHint,
  );
  state.pendingGithubEvidence = {
    repo: repoSlug,
    pullNumber,
    importedAt: new Date().toISOString(),
    payload,
  };
}

function iconSvg(name) {
  const base =
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"';

  switch (name) {
    case "doc":
      return `<svg ${base}><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>`;
    case "shield":
      return `<svg ${base}><path d="M12 3 19 6v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>`;
    case "users":
      return `<svg ${base}><path d="M17 20v-1c0-1.7-1.3-3-3-3H7c-1.7 0-3 1.3-3 3v1"/><path d="M13 16h4c1.7 0 3 1.3 3 3v1"/><circle cx="9" cy="8" r="3"/><path d="M17 6a3 3 0 1 1 0 6"/></svg>`;
    case "chart":
      return `<svg ${base}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-7"/></svg>`;
    case "flow":
      return `<svg ${base}><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 16c3-3 5-5 8-8"/><path d="M12 6H6v6"/></svg>`;
    case "plug":
      return `<svg ${base}><path d="M9 3v5"/><path d="M15 3v5"/><path d="M8 8h8v4a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4z"/><path d="M12 16v5"/></svg>`;
    case "trend":
      return `<svg ${base}><path d="M4 16 9 11l4 4 7-7"/><path d="M14 8h6v6"/></svg>`;
    case "calendar":
      return `<svg ${base}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 11h18"/></svg>`;
    case "message":
      return `<svg ${base}><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/></svg>`;
    case "network":
      return `<svg ${base}><circle cx="5" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 11 10 8"/><path d="M14 8 17 11"/><path d="M7 13 10 16"/><path d="M14 16 17 13"/></svg>`;
    case "github":
      return `<svg ${base}><path d="M9 19c-4 1.2-4-2-5-2"/><path d="M15 19v-3.2c0-1 .4-1.8 1-2.4"/><path d="M7 8c0 4 2 6 5 6s5-2 5-6c0-1-.3-2-.9-2.8.1-.4.2-.9.2-1.4 0-1.2-.5-2.1-1.3-2.8-1.2 0-2.2.4-3 1.2A8.1 8.1 0 0 0 9 2c-.8.7-1.3 1.6-1.3 2.8 0 .5.1 1 .2 1.4C7.3 6 7 7 7 8z"/></svg>`;
    case "jira":
      return `<svg ${base}><path d="M10 4a4 4 0 0 0 0 8"/><path d="M14 20a4 4 0 0 0 0-8"/><path d="M10 12h4"/><path d="M8 12v4"/><path d="M16 12v4"/></svg>`;
    case "slack":
      return `<svg ${base}><path d="M8 3v6a2 2 0 1 1-4 0V7"/><path d="M3 8h6a2 2 0 1 1 0 4H7"/><path d="M16 3v6a2 2 0 1 0 4 0V7"/><path d="M21 8h-6a2 2 0 1 0 0 4h2"/><path d="M8 21v-6a2 2 0 1 1 4 0v2"/><path d="M13 16v-6a2 2 0 1 1 4 0v2"/></svg>`;
    case "lock":
      return `<svg ${base}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/><circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/></svg>`;
    default:
      return `<svg ${base}><circle cx="12" cy="12" r="9"/></svg>`;
  }
}

function authShellHeader() {
  return `
    <header class="site-header">
      <a class="brand" href="#" data-action="back-home" aria-label="Ir para a página inicial">
        <span class="brand-mark">PV</span>
        <span class="brand-copy">
          <span class="brand-name">Promova</span>
          <span class="brand-tagline">Evolução de carreira com evidências</span>
        </span>
      </a>
      <button class="button secondary button-cta" type="button" data-action="back-home">Voltar ao início</button>
    </header>
  `;
}

function siteHeader(mode) {
  const landingLinks = [
    ["#product", "Produto"],
    ["#how-it-works", "Como funciona"],
    ["#benefits", "Benefícios"],
  ];

  const appLinks = [
    { label: "Início", action: "back-home" },
    { label: "Painel", action: "open-dashboard" },
    { label: "Nova evidência", action: "open-form" },
    { label: "Sair", action: "logout" },
  ];

  const nav =
    mode === "landing"
      ? landingLinks
          .map(
            ([href, label]) =>
              `<a class="nav-link" href="${href}">${escapeHtml(label)}</a>`,
          )
          .join("")
      : appLinks
          .map(
            ({ label, action }) =>
              `<button class="nav-link button-reset" type="button" data-action="${action}">${escapeHtml(label)}</button>`,
          )
          .join("");

  const ctaAction = mode === "landing" ? "open-login" : "open-form";
  const ctaLabel = mode === "landing" ? "Começar agora" : "Nova evidência";

  const session = state.authSession;
  const userChip =
    mode === "app" && session
      ? `<span class="user-pill is-visible" title="${escapeHtml(session.email)}"><span>${escapeHtml(formatDisplayName(session.name))}</span></span>`
      : "";

  return `
    <header class="site-header">
      <a class="brand" href="#" data-action="back-home" aria-label="Ir para a página inicial">
        <span class="brand-mark">PV</span>
        <span class="brand-copy">
          <span class="brand-name">Promova</span>
          <span class="brand-tagline">Evolução de carreira com evidências</span>
        </span>
      </a>
      <nav class="site-nav" aria-label="Principal">
        ${nav}
      </nav>
      ${userChip}
      <button class="button primary button-cta" type="button" data-action="${ctaAction}">${escapeHtml(ctaLabel)}</button>
    </header>
  `;
}

function footerLinks() {
  return `
    <footer class="site-footer">
      <div class="container footer-row">
        <a class="brand footer-brand" href="#" data-action="back-home">
          <span class="brand-mark">PV</span>
          <span class="brand-copy">
            <span class="brand-name">Promova</span>
            <span class="brand-tagline">Evolução de carreira com evidências</span>
          </span>
        </a>
        <nav class="footer-links" aria-label="Rodapé">
          <a href="#product">Produto</a>
          <a href="#how-it-works">Como funciona</a>
          <a href="#benefits">Benefícios</a>
        </nav>
        <p class="footer-copy">© 2026 Promova. Todos os direitos reservados.</p>
      </div>
    </footer>
  `;
}

function sectionHeading(title, copy) {
  return `
    <div class="section-heading">
      <h2 class="section-title">${escapeHtml(title)}</h2>
      <p class="section-lead">${escapeHtml(copy)}</p>
    </div>
  `;
}

function cardGrid(items, columns = "three") {
  return `
    <div class="card-grid ${columns}">
      ${items.join("")}
    </div>
  `;
}

function problemCard(icon, title, copy) {
  return `
    <article class="info-card problem-card">
      <div class="card-icon">${iconSvg(icon)}</div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
      <p class="card-copy">${escapeHtml(copy)}</p>
    </article>
  `;
}

function solutionCard(icon, title, copy) {
  return `
    <article class="info-card solution-card">
      <div class="card-icon">${iconSvg(icon)}</div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
      <p class="card-copy">${escapeHtml(copy)}</p>
    </article>
  `;
}

function featureCard(icon, title, copy) {
  return `
    <article class="info-card feature-card">
      <div class="card-icon">${iconSvg(icon)}</div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
      <p class="card-copy">${escapeHtml(copy)}</p>
    </article>
  `;
}

function stepCard(number, title, copy) {
  return `
    <article class="step-card">
      <div class="step-number">${number}</div>
      <h3 class="card-title">${escapeHtml(title)}</h3>
      <p class="card-copy">${escapeHtml(copy)}</p>
    </article>
  `;
}

function previewFeedItem(dotClass, title, copy, level) {
  return `
    <div class="preview-item">
      <span class="preview-dot ${dotClass}"></span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(copy)}</p>
      </div>
      <span class="tag-pill ${dotClass}">${escapeHtml(level)}</span>
    </div>
  `;
}

function landingDashboardPreview() {
  return `
    <div class="dashboard-shell">
      <div class="dashboard-metrics">
        <div class="metric-card blue">
          <span class="metric-label">Evidências coletadas</span>
          <strong class="metric-value">142</strong>
          <span class="metric-sub">+18 neste mês</span>
        </div>
        <div class="metric-card green">
          <span class="metric-label">Nível atual</span>
          <strong class="metric-value">Pleno</strong>
          <span class="metric-sub">75% para Sênior</span>
        </div>
        <div class="metric-card purple">
          <span class="metric-label">Impacto</span>
          <strong class="metric-value">Excelente</strong>
          <span class="metric-sub">Acima da média</span>
        </div>
      </div>
      <div class="dashboard-feed">
        ${previewFeedItem("blue", "Arquitetura de sistema", "Design de microsserviços - GitHub", "Sênior")}
        ${previewFeedItem("green", "Planejamento de sprint", "Liderança técnica - Jira", "Pleno")}
        ${previewFeedItem("purple", "Code review", "15 PRs revisados - GitHub", "Pleno")}
      </div>
    </div>
  `;
}

function landingPage() {
  const problemCards = [
    problemCard(
      "doc",
      "Processos manuais",
      "A coleta de evidências é manual e demorada, desperdiçando tempo valioso de gestores.",
    ),
    problemCard(
      "shield",
      "Falta de transparência",
      "As pessoas não sabem o que precisam fazer para evoluir de nível.",
    ),
    problemCard(
      "users",
      "Decisões enviesadas",
      "Muitas decisões ainda se baseiam em opinião e memória, não em evidências do trabalho ao longo do tempo.",
    ),
  ];

  const solutionCards = [
    solutionCard(
      "chart",
      "Registro contínuo",
      "Evidências organizadas ao longo do tempo para evitar perda de contexto.",
    ),
    solutionCard(
      "plug",
      "Integração com o fluxo",
      "Uma experiência simples para centralizar sinais do trabalho já realizado.",
    ),
    solutionCard(
      "flow",
      "Framework de carreira",
      "Estrutura clara de níveis para comparar impacto e evolução de forma consistente.",
    ),
    solutionCard(
      "trend",
      "Visão para lideranças",
      "Resumo visual do progresso para apoiar conversas mais justas e objetivas.",
    ),
  ];

  const benefitCards = [
    featureCard("shield", "Redução de viés", "Decisões baseadas em métricas objetivas."),
    featureCard("chart", "Baseado em dados", "Evidências concretas de performance."),
    featureCard("doc", "Transparência", "Critérios claros para todas as pessoas."),
    featureCard("trend", "Evolução clara", "Visibilidade do progresso contínuo."),
  ];

  const audienceCards = [
    `
      <article class="info-card">
        <div class="card-icon">${iconSvg("users")}</div>
        <h3 class="card-title">Para engenheiros</h3>
        <ul class="check-list">
          <li>Visualize todas as suas evidências de trabalho em um só lugar.</li>
          <li>Acompanhe sua evolução de carreira em tempo real.</li>
          <li>Entenda claramente o que precisa para evoluir.</li>
          <li>Tenha transparência total no processo.</li>
        </ul>
      </article>
    `,
    `
      <article class="info-card">
        <div class="card-icon">${iconSvg("shield")}</div>
        <h3 class="card-title">Para gestores</h3>
        <ul class="check-list">
          <li>Veja o progresso de todo o time em tempo real.</li>
          <li>Tome decisões de evolução baseadas em dados concretos.</li>
          <li>Reduza o tempo gasto com coleta manual de evidências.</li>
          <li>Justifique decisões com evidências objetivas.</li>
        </ul>
      </article>
    `,
  ];

  const integrationCards = [
    `
      <article class="integration-card">
        <div class="card-icon">${iconSvg("github")}</div>
        <div>
          <h3>GitHub</h3>
          <p>PRs, commits, revisões</p>
        </div>
      </article>
    `,
    `
      <article class="integration-card">
        <div class="card-icon">${iconSvg("calendar")}</div>
        <div>
          <h3>Jira</h3>
          <p>Tarefas, sprints, entregas</p>
        </div>
      </article>
    `,
    `
      <article class="integration-card">
        <div class="card-icon">${iconSvg("message")}</div>
        <div>
          <h3>Slack</h3>
          <p>Comunicação, colaboração</p>
        </div>
      </article>
    `,
  ];

  const steps = [
    stepCard(1, "Trabalho diário", "A pessoa realiza suas tarefas normalmente."),
    stepCard(2, "Coleta automática", "O sistema captura dados das ferramentas."),
    stepCard(3, "Análise com IA", "A IA analisa com base no framework de carreira."),
    stepCard(4, "Evidências", "Registros organizados e categorizados."),
    stepCard(5, "Decisão", "A liderança decide com base em dados."),
  ];

  return `
    <div class="site-page">
      <section class="surface-light hero" id="product">
        <div class="container">
          ${siteHeader("landing")}
          <div class="hero-grid">
            <div class="hero-copy">
              <span class="eyebrow">Promoções justas baseadas em evidências reais</span>
              <h1>Promova sua carreira com evidências</h1>
              <p>Registre suas evidências, acompanhe seu impacto e simplifique conversas de carreira com uma experiência clara e direta.</p>
              <div class="hero-actions">
                <button class="button primary" type="button" data-action="open-login">Começar agora</button>
                <a class="button secondary" href="#how-it-works">Ver como funciona</a>
              </div>
            </div>
            <div class="preview-shell">
              <div class="preview-card">
                <div class="preview-head">
                  <span>Painel</span>
                  <strong>1º tri 2026</strong>
                </div>
                ${previewFeedItem("green", "Solicitação de merge aprovada", "Arquitetura do novo módulo", "Sênior")}
                ${previewFeedItem("blue", "Funcionalidade entregue", "Sistema de autenticação", "Pleno")}
                ${previewFeedItem("purple", "Mentoria realizada", "Onboarding de 3 desenvolvedores", "Sênior")}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="surface-muted section">
        <div class="container">
          ${sectionHeading(
            "O problema atual",
            "Processos tradicionais de evolução ainda dependem de memória, opinião e pouca visibilidade.",
          )}
          ${cardGrid(problemCards, "three")}
        </div>
      </section>

      <section class="surface-light section">
        <div class="container">
          ${sectionHeading(
            "A solução",
            "Decisões mais claras com evidências concretas e um fluxo simples para quem usa.",
          )}
          ${cardGrid(solutionCards, "four")}
        </div>
      </section>

      <section class="dark-band section" id="how-it-works">
        <div class="container">
          ${sectionHeading(
            "Como funciona",
            "Um processo simples, guiado e fácil de explicar para qualquer pessoa do time.",
          )}
          ${cardGrid(steps, "five")}
        </div>
      </section>

      <section class="surface-light section" id="dashboard-preview">
        <div class="container">
          ${sectionHeading(
            "Painel intuitivo",
            "Visualize o progresso de forma clara e organizada.",
          )}
          ${landingDashboardPreview()}
        </div>
      </section>

      <section class="surface-muted section" id="audience">
        <div class="container">
          ${sectionHeading("Para quem é", "")}
          ${cardGrid(audienceCards, "two")}
        </div>
      </section>

      <section class="surface-light section" id="benefits">
        <div class="container">
          ${sectionHeading("Benefícios", "Transforme seu processo de carreira em algo claro e confiável.")}
          ${cardGrid(benefitCards, "four")}
        </div>
      </section>

      <section class="surface-muted section" id="integrations">
        <div class="container">
          ${sectionHeading("Integrações", "Conecte com as ferramentas que você já usa.")}
          <div class="integration-grid">
            ${integrationCards.join("")}
          </div>
        </div>
      </section>

      <section class="footer-cta section">
        <div class="container cta-inner">
          <h2>Comece a usar o Promova hoje</h2>
          <p>Transforme seu processo de carreira em algo justo, transparente e baseado em dados.</p>
          <button class="button primary" type="button" data-action="open-login">Começar agora grátis</button>
        </div>
      </section>

      ${footerLinks()}
    </div>
  `;
}

function loginPage() {
  const errorBlock = state.loginError
    ? `<p class="form-error" role="alert">${escapeHtml(state.loginError)}</p>`
    : "";

  return `
    <div class="site-page">
      <section class="surface-light section">
        <div class="container">
          ${authShellHeader()}
          <div class="page-hero compact auth-layout">
            <span class="eyebrow">Conta Promova</span>
            <h1 class="page-title">Entrar</h1>
            <p class="page-copy">Acesse o painel do projeto e o registro de evidências. Primeira vez aqui? Crie sua conta em instantes.</p>
          </div>
          <div class="auth-layout auth-card">
            <form id="login-form" class="form-card" autocomplete="on" novalidate>
              <div class="auth-form-head">
                <div class="card-icon">${iconSvg("lock")}</div>
              </div>
              ${errorBlock}
              <div class="field">
                <label for="login-email">E-mail</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autocomplete="username"
                  inputmode="email"
                  placeholder="nome@email.com"
                  maxlength="254"
                  required
                />
              </div>
              <div class="field">
                <label for="login-password">Senha</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autocomplete="current-password"
                  placeholder="Digite sua senha"
                  required
                />
              </div>
              <div class="form-actions">
                <button class="button primary" type="submit">Entrar</button>
              </div>
              <div class="auth-footer">
                Ainda não tem conta?
                <button type="button" data-action="open-register">Criar conta</button>
              </div>
            </form>
          </div>
        </div>
      </section>
      ${footerLinks()}
    </div>
  `;
}

function registerPage() {
  const errorBlock = state.registerError
    ? `<p class="form-error" role="alert">${escapeHtml(state.registerError)}</p>`
    : "";

  return `
    <div class="site-page">
      <section class="surface-light section">
        <div class="container">
          ${authShellHeader()}
          <div class="page-hero compact auth-layout">
            <span class="eyebrow">Novo usuário</span>
            <h1 class="page-title">Criar conta</h1>
            <p class="page-copy">Após criar sua conta você entra direto no painel de evidências, com dados da sessão e análises prontos para usar.</p>
          </div>
          <div class="auth-layout auth-card">
            <form id="register-form" class="form-card" autocomplete="on" novalidate>
              <div class="auth-form-head">
                <div class="card-icon">${iconSvg("shield")}</div>
              </div>
              ${errorBlock}
              <div class="field">
                <label for="register-name">Nome completo</label>
                <input id="register-name" name="name" type="text" autocomplete="name" placeholder="Nome e sobrenome" maxlength="120" required />
              </div>
              <div class="field">
                <label for="register-email">E-mail</label>
                <input id="register-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="nome@email.com" maxlength="254" required />
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="register-password">Senha</label>
                  <input id="register-password" name="password" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" minlength="8" required />
                </div>
                <div class="field">
                  <label for="register-password-confirm">Confirmar senha</label>
                  <input id="register-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" placeholder="Digite novamente" minlength="8" required />
                </div>
              </div>
              <p class="helper register-password-hint">Use pelo menos 8 caracteres. As duas senhas precisam ser iguais.</p>
              <div class="form-actions">
                <button class="button primary" type="submit">Criar conta e entrar</button>
                <button class="button ghost" type="button" data-action="open-login">Já tenho conta</button>
              </div>
            </form>
          </div>
        </div>
      </section>
      ${footerLinks()}
    </div>
  `;
}

function liveDashboardPreview() {
  const counts = LEVELS.reduce((accumulator, level) => {
    accumulator[level] = state.evidences.filter((item) => item.impactLevel === level).length;
    return accumulator;
  }, {});
  const latest = state.evidences[0];

  return `
    <div class="dashboard-shell live-dashboard">
      <div class="dashboard-metrics">
        <div class="metric-card blue">
          <span class="metric-label">Evidências salvas</span>
          <strong class="metric-value">${state.evidences.length}</strong>
          <span class="metric-sub">Nesta sessão</span>
        </div>
        <div class="metric-card green">
          <span class="metric-label">Última classificação</span>
          <strong class="metric-value">${latest ? escapeHtml(latest.impactLevel) : "—"}</strong>
          <span class="metric-sub">${latest ? escapeHtml(formatTimestamp(latest.createdAt)) : "Nenhuma ainda"}</span>
        </div>
        <div class="metric-card purple">
          <span class="metric-label">Níveis L4+</span>
          <strong class="metric-value">${counts.L4 + counts.L5}</strong>
          <span class="metric-sub">Impacto mais forte</span>
        </div>
      </div>
      ${
        state.evidences.length
          ? `
            <div class="dashboard-feed">
              ${state.evidences
                .map(
                  (item) => `
                    <article class="feed-item">
                      <span class="${badgeClass(item.impactLevel)}">${escapeHtml(item.impactLevel)}</span>
                      <div>
                        <strong class="feed-title">${escapeHtml(item.evidence)}</strong>
                        <p class="feed-sub">Atual: ${escapeHtml(item.currentLevel)} • Alvo: ${escapeHtml(item.targetLevel)} • Fonte: ${escapeHtml(getEvidenceSourceLabel(item))}</p>
                      </div>
                      <span class="feed-time">${escapeHtml(formatTimestamp(item.createdAt))}</span>
                    </article>
                  `,
                )
                .join("")}
            </div>
          `
          : `
            <div class="empty-state dashboard-empty">
              <p>Nenhuma evidência salva nesta sessão ainda.</p>
              <button class="button primary" type="button" data-action="open-form">Adicionar evidência</button>
            </div>
          `
      }
    </div>
  `;
}

function DashboardPage() {
  return `
    <div class="site-page">
      <section class="surface-light section">
        <div class="container">
          ${siteHeader("app")}
          <div class="page-hero compact">
            <span class="eyebrow">Painel da sessão</span>
            <h1 class="page-title">Evidências salvas</h1>
            <p class="page-copy">Acompanhe as evidências registradas nesta sessão e abra o fluxo de análise quando quiser adicionar uma nova.</p>
          </div>
          ${liveDashboardPreview()}
        </div>
      </section>
      ${footerLinks()}
    </div>
  `;
}

function EvidenceForm() {
  return `
    <div class="site-page">
      <section class="surface-light section">
        <div class="container">
          ${siteHeader("app")}
          <div class="page-hero compact">
            <span class="eyebrow">Nova evidência</span>
            <h1 class="page-title">Registro de evidência</h1>
            <p class="page-copy">Descreva a evidência, escolha o nível atual e o alvo, e gere uma análise estruturada para a sessão.</p>
          </div>

          <div class="content-grid">
            <form id="evidence-form" class="form-card">
              <div class="info-card soft-panel github-import-card">
                <h3>Importar do GitHub</h3>
                <p class="helper">Defina qual conta/repositório analisar e traga um PR para preencher a evidência automaticamente.</p>

                <div class="field">
                  <label for="promova-api-base">URL da API de extração</label>
                  <input id="promova-api-base" name="promovaApiBase" data-field="promovaApiBase" type="url" placeholder="http://localhost:3100" value="${escapeHtml(state.promovaApiBase)}" />
                  <p class="helper">Se a API subir em outra porta, ajuste aqui.</p>
                </div>

                <div class="field">
                  <label for="github-repo">Repositório GitHub</label>
                  <input id="github-repo" name="githubRepo" data-field="githubRepo" type="text" placeholder="owner/repo ou https://github.com/owner/repo" value="${escapeHtml(state.form.githubRepo)}" />
                </div>

                <div class="field-grid">
                  <div class="field">
                    <label for="github-username-hint">Conta GitHub para análise (opcional)</label>
                    <input id="github-username-hint" name="githubUsernameHint" data-field="githubUsernameHint" type="text" placeholder="ex.: digod (sem @)" value="${escapeHtml(state.form.githubUsernameHint)}" />
                  </div>
                  <div class="field">
                    <label for="github-pull-number">Número do PR</label>
                    <input id="github-pull-number" name="githubPullNumber" data-field="githubPullNumber" type="number" min="1" step="1" placeholder="ex.: 1234" value="${escapeHtml(state.form.githubPullNumber)}" />
                  </div>
                </div>

                ${
                  state.githubImport.error
                    ? `<p class="form-error" role="alert">${escapeHtml(state.githubImport.error)}</p>`
                    : ""
                }

                ${
                  state.githubImport.pulls.length
                    ? `<div class="dashboard-feed github-pull-list">
                        ${state.githubImport.pulls
                          .slice(0, 8)
                          .map(
                            (pull) => `
                              <article class="feed-item">
                                <span class="badge info">PR #${escapeHtml(pull.number)}</span>
                                <div>
                                  <strong class="feed-title">${escapeHtml(pull.title || "Sem título")}</strong>
                                  <p class="feed-sub">@${escapeHtml(pull.author_login || "desconhecido")} • ${escapeHtml(pull.state || "desconhecido")}</p>
                                </div>
                                <button class="button ghost" type="button" data-action="use-github-pr" data-pr-number="${escapeHtml(pull.number)}">Usar</button>
                              </article>
                            `,
                          )
                          .join("")}
                      </div>`
                    : ""
                }

                <div class="form-actions">
                  <button class="button secondary" type="button" data-action="search-github-prs" ${state.githubImport.loading ? "disabled" : ""}>
                    ${state.githubImport.loading ? "Carregando..." : "Buscar PRs"}
                  </button>
                  <button class="button primary" type="button" data-action="import-github-pr" ${state.githubImport.loading ? "disabled" : ""}>
                    ${state.githubImport.loading ? "Aguarde..." : "Importar PR para evidência"}
                  </button>
                </div>
              </div>

              <div class="field">
                <label for="evidence">Evidência</label>
                <textarea
                  id="evidence"
                  name="evidence"
                  data-field="evidence"
                  placeholder="Descreva a evidência"
                  required
                >${escapeHtml(state.form.evidence)}</textarea>
                <p class="helper">Exemplo: "Refatorei o módulo de pagamentos e aumentei a cobertura de testes".</p>
              </div>

              <div class="field-grid">
                <div class="field">
                  <label for="currentLevel">Nível atual</label>
                  <select id="currentLevel" name="currentLevel" data-field="currentLevel">
                    ${levelOptions(state.form.currentLevel)}
                  </select>
                </div>
                <div class="field">
                  <label for="targetLevel">Nível alvo</label>
                  <select id="targetLevel" name="targetLevel" data-field="targetLevel">
                    ${levelOptions(state.form.targetLevel)}
                  </select>
                </div>
              </div>

              <div class="form-actions">
                <button class="button primary" type="submit">Analisar evidência</button>
                <button class="button secondary" type="button" data-action="prefill-example">Usar exemplo</button>
                <button class="button ghost" type="button" data-action="back-dashboard">Voltar ao painel</button>
              </div>
            </form>

            <aside class="analysis-side">
              <div class="info-card soft-panel">
                <h3>Regras de análise</h3>
                <ul class="mini-list">
                  <li><span class="mini-dot blue"></span><span>Se o texto contiver <strong>refator</strong>, <strong>melhor</strong>, <strong>aument</strong> ou <strong>otimiz</strong>, o nível de impacto sobe para <strong>L4</strong>.</span></li>
                  <li><span class="mini-dot green"></span><span>Se o texto contiver <strong>ajudei</strong>, <strong>suporte</strong> ou <strong>colaborei</strong>, o nível de impacto sobe para <strong>L3</strong>.</span></li>
                  <li><span class="mini-dot purple"></span><span>Nos demais casos, o sistema permanece conservador e sugere fortalecer o resultado.</span></li>
                </ul>
              </div>

              <div class="info-card soft-panel">
                <h3>Resumo da sessão</h3>
                <p class="card-copy">Esta sessão já inclui <strong>${state.evidences.length}</strong> evidência${state.evidences.length === 1 ? "" : "s"} salva${state.evidences.length === 1 ? "" : "s"}.</p>
              </div>
            </aside>
          </div>
        </div>
      </section>
      ${footerLinks()}
    </div>
  `;
}

function ResultView() {
  const result = state.result;
  const competencies = result.competencies
    .map((item) => `<li class="tag">${escapeHtml(item)}</li>`)
    .join("");
  const suggestions = result.suggestions
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `
    <div class="site-page">
      <section class="surface-light section">
        <div class="container">
          ${siteHeader("app")}
          <div class="page-hero compact">
            <span class="eyebrow">Resultado da análise</span>
            <h1 class="page-title">Visão do resultado</h1>
            <p class="page-copy">Veja a classificação simulada, a justificativa e os próximos passos recomendados para a evidência enviada.</p>
          </div>

          <div class="result-grid">
            <div class="analysis-card emphasis">
              <span class="score-label">Nível de impacto</span>
              <strong class="score-value">${escapeHtml(result.impactLevel)}</strong>
              <p class="score-note">${escapeHtml(result.readiness)}</p>
            </div>

            <div class="analysis-card">
              <h3>Justificativa</h3>
              <p>${escapeHtml(result.justification)}</p>
            </div>

            <div class="analysis-card">
              <h3>Competências identificadas</h3>
              <ul class="tag-list">${competencies}</ul>
            </div>

            <div class="analysis-card">
              <h3>Sugestões</h3>
              <ul class="suggestion-list">${suggestions}</ul>
            </div>

            <div class="analysis-card">
              <h3>Resumo da evidência</h3>
              <p class="subtle">Nível atual: <strong>${escapeHtml(result.currentLevel)}</strong></p>
              <p class="subtle">Nível alvo: <strong>${escapeHtml(result.targetLevel)}</strong></p>
              <p class="subtle">Fonte: <strong>${escapeHtml(getEvidenceSourceLabel(result))}</strong></p>
              <div class="evidence-preview">${escapeHtml(result.evidence)}</div>
            </div>

            <div class="analysis-side">
              <div class="info-card soft-panel">
                <h3>Próximas ações</h3>
                <ul class="mini-list">
                  <li><span class="mini-dot blue"></span><span>Fortaleça a evidência com resultados mensuráveis.</span></li>
                  <li><span class="mini-dot green"></span><span>Salve a próxima evidência para manter o painel da sessão atualizado.</span></li>
                  <li><span class="mini-dot purple"></span><span>Use o painel para comparar múltiplos envios na mesma sessão.</span></li>
                </ul>
              </div>

              <div class="form-actions">
                <button class="button primary" type="button" data-action="back-form">Analisar outra</button>
                <button class="button secondary" type="button" data-action="back-dashboard">Voltar ao painel</button>
              </div>
            </div>
          </div>
        </div>
      </section>
      ${footerLinks()}
    </div>
  `;
}

function render() {
  const guarded = ["dashboard", "form", "result"];
  if (guarded.includes(state.view) && !state.authSession) {
    state.view = "login";
    state.loginError = "";
    state.registerError = "";
  }

  if (state.view === "home") {
    app.innerHTML = landingPage();
  } else if (state.view === "login") {
    app.innerHTML = loginPage();
  } else if (state.view === "register") {
    app.innerHTML = registerPage();
  } else if (state.view === "dashboard") {
    app.innerHTML = DashboardPage();
  } else if (state.view === "form") {
    app.innerHTML = EvidenceForm();
  } else {
    app.innerHTML = ResultView();
  }

  window.scrollTo(0, 0);
}

app.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) {
    return;
  }

  const action = trigger.dataset.action;

  if (action === "open-login") {
    state.loginError = "";
    state.registerError = "";
    state.view = isAuthenticated() ? "dashboard" : "login";
    render();
    return;
  }

  if (action === "open-register") {
    state.loginError = "";
    state.registerError = "";
    state.view = "register";
    render();
    return;
  }

  if (action === "logout") {
    event.preventDefault();
    state.authSession = null;
    persistAuthSession(null);
    state.loginError = "";
    state.registerError = "";
    state.view = "home";
    render();
    return;
  }

  if (action === "open-dashboard") {
    if (!isAuthenticated()) {
      state.loginError = "";
      state.view = "login";
    } else {
      state.view = "dashboard";
    }

    render();
    return;
  }

  if (action === "open-form") {
    if (!isAuthenticated()) {
      state.loginError = "Entre ou crie uma conta para registrar evidências.";
      state.view = "login";
    } else {
      resetForm();
      state.view = "form";
    }

    render();
    return;
  }

  if (action === "back-home") {
    event.preventDefault();
    state.loginError = "";
    state.registerError = "";
    state.view = "home";
    render();
    return;
  }

  if (action === "back-dashboard") {
    if (!isAuthenticated()) {
      state.loginError = "";
      state.view = "login";
    } else {
      state.view = "dashboard";
    }

    render();
    return;
  }

  if (action === "back-form") {
    if (!isAuthenticated()) {
      state.loginError = "";
      state.view = "login";
    } else {
      resetForm();
      state.view = "form";
    }

    render();
    return;
  }

  if (action === "use-github-pr") {
    const prNumber = trigger.dataset.prNumber;
    if (prNumber) {
      state.form.githubPullNumber = String(prNumber);
      state.githubImport.error = "";
      render();
    }
    return;
  }

  if (action === "search-github-prs") {
    if (!isAuthenticated()) {
      state.loginError = "Faça login para importar evidências do GitHub.";
      state.view = "login";
      render();
      return;
    }

    state.githubImport.loading = true;
    state.githubImport.error = "";
    persistPromovaApiBase(state.promovaApiBase);
    render();

    searchGithubPullsForForm()
      .catch((error) => {
        state.githubImport.error =
          typeof error?.message === "string" ? error.message : "Erro ao buscar PRs na API GitHub.";
      })
      .finally(() => {
        state.githubImport.loading = false;
        render();
      });

    return;
  }

  if (action === "import-github-pr") {
    if (!isAuthenticated()) {
      state.loginError = "Faça login para importar evidências do GitHub.";
      state.view = "login";
      render();
      return;
    }

    state.githubImport.loading = true;
    state.githubImport.error = "";
    persistPromovaApiBase(state.promovaApiBase);
    render();

    importGithubEvidenceIntoForm()
      .catch((error) => {
        state.githubImport.error =
          typeof error?.message === "string" ? error.message : "Erro ao importar PR via API GitHub.";
      })
      .finally(() => {
        state.githubImport.loading = false;
        render();
      });

    return;
  }

  if (action === "prefill-example") {
    state.pendingGithubEvidence = null;
    state.form.evidence = "Refatorei o módulo de pagamentos e aumentei a cobertura de testes";
    state.form.currentLevel = "L3";
    state.form.targetLevel = "L4";
    render();
  }
});

app.addEventListener("input", (event) => {
  const field = event.target.closest("[data-field]");
  if (!field) {
    return;
  }

  if (field.dataset.field === "evidence") {
    state.form.evidence = field.value;
    return;
  }

  if (field.dataset.field === "githubRepo") {
    state.form.githubRepo = field.value;
    state.githubImport.error = "";
    state.pendingGithubEvidence = null;
    return;
  }

  if (field.dataset.field === "githubPullNumber") {
    state.form.githubPullNumber = field.value;
    state.githubImport.error = "";
    state.pendingGithubEvidence = null;
    return;
  }

  if (field.dataset.field === "githubUsernameHint") {
    state.form.githubUsernameHint = field.value;
    state.githubImport.error = "";
    return;
  }

  if (field.dataset.field === "promovaApiBase") {
    state.promovaApiBase = String(field.value || "").trim();
  }
});

app.addEventListener("change", (event) => {
  const field = event.target.closest("[data-field]");
  if (!field) {
    return;
  }

  if (field.dataset.field === "currentLevel") {
    state.form.currentLevel = field.value;
  }

  if (field.dataset.field === "targetLevel") {
    state.form.targetLevel = field.value;
    return;
  }

  if (field.dataset.field === "promovaApiBase") {
    state.promovaApiBase = String(field.value || "").trim();
    persistPromovaApiBase(state.promovaApiBase);
  }
});

app.addEventListener("submit", (event) => {
  const targetForm = event.target;

  if (targetForm.matches("#login-form")) {
    event.preventDefault();
    state.registerError = "";
    const form = targetForm;
    const emailInput = /** @type {HTMLInputElement} */ (form.elements.namedItem("email"));
    const passwordInput = /** @type {HTMLInputElement} */ (form.elements.namedItem("password"));
    const email = normalizeEmail(emailInput.value);
    const password = passwordInput.value;

    if (!email || !password) {
      state.loginError = "Informe e-mail e senha.";
      render();
      return;
    }

    if (!isValidEmail(email)) {
      state.loginError = "Digite um e-mail válido.";
      render();
      return;
    }

    const accounts = loadAuthAccounts();
    const found = accounts.find((account) => normalizeEmail(account.email) === email);

    if (!found || found.password !== password) {
      state.loginError = "E-mail ou senha incorretos.";
      render();
      return;
    }

    const sessionUser = { email: normalizeEmail(found.email), name: found.name.trim() };
    state.authSession = sessionUser;
    persistAuthSession(sessionUser);
    state.loginError = "";
    state.view = "dashboard";
    render();
    return;
  }

  if (targetForm.matches("#register-form")) {
    event.preventDefault();
    state.loginError = "";
    const form = targetForm;
    const nameInput = /** @type {HTMLInputElement} */ (form.elements.namedItem("name"));
    const emailInput = /** @type {HTMLInputElement} */ (form.elements.namedItem("email"));
    const passwordInput = /** @type {HTMLInputElement} */ (form.elements.namedItem("password"));
    const confirmInput = /** @type {HTMLInputElement} */ (form.elements.namedItem("passwordConfirm"));
    const name = String(nameInput.value).trim();
    const email = normalizeEmail(emailInput.value);
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (!name || name.length < 2) {
      state.registerError = "Informe seu nome completo (ao menos 2 caracteres).";
      render();
      return;
    }

    if (!isValidEmail(email)) {
      state.registerError = "Digite um e-mail válido.";
      render();
      return;
    }

    if (password.length < 8) {
      state.registerError = "A senha deve ter pelo menos 8 caracteres.";
      render();
      return;
    }

    if (password !== confirm) {
      state.registerError = "As senhas não coincidem.";
      render();
      return;
    }

    const accounts = loadAuthAccounts();

    if (accounts.some((account) => normalizeEmail(account.email) === email)) {
      state.registerError = "Já existe uma conta com esse e-mail. Entre ou use outro endereço.";
      render();
      return;
    }

    accounts.push({
      email,
      password,
      name,
    });
    persistAuthAccounts(accounts);
    state.authSession = { email, name };
    persistAuthSession(state.authSession);
    state.registerError = "";
    state.view = "dashboard";
    render();
    return;
  }

  if (!targetForm.matches("#evidence-form")) {
    return;
  }

  event.preventDefault();

  if (!isAuthenticated()) {
    state.loginError = "Faça login para registrar evidências.";
    state.view = "login";
    render();
    return;
  }

  state.result = analyzeEvidence(
    state.form.evidence,
    state.form.currentLevel,
    state.form.targetLevel,
  );
  if (state.pendingGithubEvidence) {
    state.result.source = "github";
    state.result.githubRepo = state.pendingGithubEvidence.repo;
    state.result.githubPullNumber = state.pendingGithubEvidence.pullNumber;
    state.result.githubImportedAt = state.pendingGithubEvidence.importedAt;
  } else {
    state.result.source = "manual";
  }
  saveEvidence(state.result);
  state.view = "result";
  render();
});

render();

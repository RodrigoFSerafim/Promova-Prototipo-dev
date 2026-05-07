const { ghFetch } = require("./github-api.js");

function truncateBody(text, max = 280) {
  if (typeof text !== "string" || !text) {
    return null;
  }

  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) {
    return t;
  }

  return `${t.slice(0, max)}…`;
}

function normalizePullSummary(pr) {
  if (!pr || typeof pr.number !== "number") {
    return null;
  }

  return {
    number: pr.number,
    title: pr.title ?? "",
    state: pr.state ?? "",
    draft: Boolean(pr.draft),
    locked: Boolean(pr.locked),
    merged_at: pr.merged_at ?? null,
    closed_at: pr.closed_at ?? null,
    html_url: pr.html_url ?? "",
    author_login: pr.user?.login ?? null,
    head_ref: pr.head?.ref ?? null,
    base_ref: pr.base?.ref ?? null,
    created_at: pr.created_at ?? null,
    updated_at: pr.updated_at ?? null,
    labels:
      Array.isArray(pr.labels) ?
        pr.labels
          .map((label) =>
            typeof label === "object" && label && typeof label.name === "string" ? label.name : null,
          )
          .filter(Boolean)
      : [],
    body_preview: truncateBody(pr.body ?? ""),
  };
}

async function extractPullRequestsList(owner, repo, query) {
  const stateRaw = typeof query.state === "string" ? query.state.trim() : "all";
  const state = ["all", "open", "closed"].includes(stateRaw) ? stateRaw : "all";
  const perPage = Math.min(Math.max(Number(query.per_page) || 20, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);

  const params = new URLSearchParams({
    state,
    sort: "updated",
    direction: "desc",
    per_page: String(perPage),
    page: String(page),
  });

  /** @type {unknown} */
  const rows = await ghFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${params}`);

  const list = Array.isArray(rows) ? rows.map(normalizePullSummary).filter(Boolean) : [];

  return {
    extracted_at: new Date().toISOString(),
    repo: `${owner}/${repo}`,
    pagination: {
      requested_page: page,
      requested_per_page: perPage,
    },
    pulls: list,
  };
}

function normalizeFilePatch(fileRow) {
  return {
    filename: fileRow.filename ?? "",
    status: fileRow.status ?? "",
    additions: Number(fileRow.additions) || 0,
    deletions: Number(fileRow.deletions) || 0,
    changes: Number(fileRow.changes) || 0,
    patch_preview: truncateBody(fileRow.patch ?? "", 320),
    blob_url: fileRow.blob_url ?? null,
    raw_url: fileRow.raw_url ?? null,
  };
}

async function extractPullRequestBundle(owner, repo, pullNumber) {
  const n = Number.parseInt(String(pullNumber), 10);
  if (!Number.isFinite(n) || n < 1) {
    /** @type {Error & { status?: number }} */
    const err = new Error("Número de pull request inválido.");
    err.status = 400;
    throw err;
  }

  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${n}`;

  /** @type {unknown} */
  const pr = await ghFetch(base);

  /** @type {unknown} */
  let filesRaw;
  try {
    filesRaw = await ghFetch(`${base}/files`);
  } catch {
    filesRaw = [];
  }

  const files = Array.isArray(filesRaw) ? filesRaw : [];
  let additions = 0;
  let deletions = 0;
  let changes = 0;

  for (const fileRow of files) {
    additions += Number(fileRow.additions) || 0;
    deletions += Number(fileRow.deletions) || 0;
    changes += Number(fileRow.changes) || 0;
  }

  const prObj = typeof pr === "object" && pr !== null ? pr : {};

  return {
    extracted_at: new Date().toISOString(),
    repo: `${owner}/${repo}`,
    pull_request: {
      ...normalizePullSummary(prObj),
      merged: Boolean(prObj.merged_at),
      merge_commit_sha: prObj.merge_commit_sha ?? null,
      body_full: typeof prObj.body === "string" ? prObj.body : "",
      additions,
      deletions,
      changed_files_count: files.length,
    },
    files: files.map(normalizeFilePatch),
    totals: {
      files_changed: files.length,
      additions,
      deletions,
      changes,
    },
  };
}

async function searchPullRequestsInRepo(owner, repo, query) {
  const rawQ =
    typeof query.q === "string" && query.q.trim() ?
      query.q.trim()
    : "";

  if (!rawQ) {
    /** @type {Error & { status?: number }} */
    const err = new Error("Parâmetro de busca obrigatório: ?q=");
    err.status = 400;
    throw err;
  }

  const perPage = Math.min(Math.max(Number(query.per_page) || 20, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);

  /** Repositório com hífen (ex.: Spoon-Knife) deve ir entre aspas na busca GitHub */
  const repoScope = `repo:"${owner}/${repo}"`;

  /** @see https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests */
  const searchQueryParts = [`is:pr`, `${repoScope}`, rawQ.replace(/\bis:pr\b/gi, "").trim()].filter(Boolean);
  const fullQ = searchQueryParts.join(" ");
  /** sort/order foram omitidos — a GitHub pode responder 422 "Validation Failed" com combinações inválidas. */
  const params = new URLSearchParams({
    q: fullQ,
    per_page: String(perPage),
    page: String(page),
  });

  /** @type {{ items?: unknown[]; total_count?: number } | unknown} */
  const result = await ghFetch(`/search/issues?${params}`);

  const items = typeof result === "object" && result !== null && Array.isArray(result.items) ?
    result.items
  : [];

  const pullsMin = [];

  for (const item of items) {
    if (typeof item !== "object" || item === null || typeof item.number !== "number") {
      continue;
    }

    pullsMin.push({
      number: item.number,
      title: item.title ?? "",
      state: item.state ?? "",
      html_url: item.html_url ?? "",
      author_login: item.user?.login ?? null,
      updated_at: item.updated_at ?? null,
      locked: Boolean(item.locked),
      body_preview: truncateBody(item.body ?? ""),
    });
  }

  return {
    extracted_at: new Date().toISOString(),
    repo: `${owner}/${repo}`,
    search: {
      q: fullQ,
      total_count:
        typeof result === "object" && result !== null && typeof result.total_count === "number" ?
          result.total_count
        : pullsMin.length,
      page_requested: page,
      per_page_requested: perPage,
    },
    pulls: pullsMin,
  };
}

module.exports = {
  extractPullRequestsList,
  extractPullRequestBundle,
  searchPullRequestsInRepo,
};

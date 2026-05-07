/**
 * Chamadas REST à GitHub API (https://docs.github.com/en/rest).
 * Autenticação opcional via GITHUB_TOKEN (recomendado: PAT com escopo repo para repositórios privados).
 */
const GH_API_ORIGIN = "https://api.github.com";

function getGithubToken() {
  return typeof process.env.GITHUB_TOKEN === "string" ? process.env.GITHUB_TOKEN.trim() : "";
}

async function ghFetch(apiPathAndQuery, { method = "GET" } = {}) {
  const url = `${GH_API_ORIGIN}${apiPathAndQuery}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "promova-github-extract/1",
  };

  const token = getGithubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { method, headers });
  const text = await response.text();

  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    let message =
      (body && typeof body.message === "string" && body.message) ||
      (typeof body?.raw === "string" ? body.raw : "") ||
      `GitHub pedido falhou (${response.status})`;

    if (body && typeof body === "object" && Array.isArray(body.errors) && body.errors.length) {
      const parts = body.errors
        .map((entry) => {
          if (typeof entry === "object" && entry !== null && typeof entry.message === "string") {
            return entry.message;
          }

          try {
            return JSON.stringify(entry);
          } catch {
            return "";
          }
        })
        .filter(Boolean);

      if (parts.length) {
        message = `${message}${message.endsWith(":") ? " " : ": "}${parts.join("; ")}`;
      }
    }

    /** @type {Error & { status?: number; github?: unknown }} */
    const err = new Error(message);
    err.status = response.status;
    err.github = body;
    throw err;
  }

  return body;
}

module.exports = {
  GH_API_ORIGIN,
  ghFetch,
  getGithubToken,
};

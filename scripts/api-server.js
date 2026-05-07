/**
 * Serviço REST de extração de dados do GitHub para o pipeline Promova (sem UI).
 *
 * Env:
 *   GITHUB_TOKEN  — opcional mas recomendado (aumenta limite da API & acesso a repos privados)
 *   PORT          — porta inicial (padrão 3100); se estiver ocupada, tenta 3101, 3102… até +20)
 *
 * Exemplos:
 *   GET  http://localhost:3100/health
 *   GET  http://localhost:3100/api/github/repos/facebook/react/pulls?per_page=5
 *   GET  http://localhost:3100/api/github/repos/facebook/react/pulls/26190
 *   GET  http://localhost:3100/api/github/repos/facebook/react/pulls/search?q=GD-0001
 */
const http = require("node:http");
const {
  extractPullRequestsList,
  extractPullRequestBundle,
  searchPullRequestsInRepo,
} = require("../lib/github-extract.js");
const { getGithubToken } = require("../lib/github-api.js");

const basePort = Number.parseInt(process.env.PORT || "3100", 10);
const maxPort = basePort + 20;

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function sendJson(response, status, body, extraHeaders = {}) {
  const payload = `${JSON.stringify(body)}\n`;

  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(),
    ...extraHeaders,
  });
  response.end(payload);
}

async function dispatch(request, response, urlObj) {
  const { pathname } = urlObj;

  if (pathname === "/" && request.method === "GET") {
    return sendJson(response, 200, {
      service: "promova-github-extract",
      docs:
        [
          "/health — status",
          "/api/github/repos/{owner}/{repo}/pulls — lista PRs (query: state, per_page, page)",
          "/api/github/repos/{owner}/{repo}/pulls/{number} — um PR + arquivos e totais",
          "/api/github/repos/{owner}/{repo}/pulls/search — buscar PRs (?q=&per_page=&page=)",
        ].join(" | "),
      auth_configured: Boolean(getGithubToken()),
    });
  }

  if (pathname === "/health" && request.method === "GET") {
    return sendJson(response, 200, {
      ok: true,
      auth_configured: Boolean(getGithubToken()),
    });
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.method !== "GET") {
    return sendJson(response, 405, { error: "Método não permitido. Use GET ou OPTIONS." });
  }

  const searchMatch = pathname.match(
    /^\/api\/github\/repos\/([^/]+)\/([^/]+)\/pulls\/search\/?$/,
  );

  const detailMatch = pathname.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/?$/);

  const listMatch = pathname.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/pulls\/?$/);

  const queryObj = Object.fromEntries(urlObj.searchParams.entries());

  try {
    if (searchMatch) {
      const [, owner, repo] = searchMatch;
      const payload = await searchPullRequestsInRepo(owner, repo, queryObj);
      return sendJson(response, 200, payload);
    }

    if (detailMatch) {
      const [, owner, repo, pullId] = detailMatch;
      const payload = await extractPullRequestBundle(owner, repo, pullId);
      return sendJson(response, 200, payload);
    }

    if (listMatch) {
      const [, owner, repo] = listMatch;
      const payload = await extractPullRequestsList(owner, repo, queryObj);
      return sendJson(response, 200, payload);
    }
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ?
        /** @type {number} */ (error.status)
      : 502;

    const gh =
      typeof error === "object" && error !== null && "github" in error ?
        /** @type {unknown} */ (error.github)
      : undefined;

    return sendJson(response, status, {
      error: typeof error.message === "string" ? error.message : "Erro desconhecido.",
      ...(gh && typeof gh === "object" && gh !== null ? { github_response: gh } : {}),
    });
  }

  return sendJson(response, 404, {
    error: "Rota não encontrada.",
  });
}

function createHttpServer(listenPort) {
  return http.createServer(async (request, response) => {
    const host = request.headers.host ?? `localhost:${listenPort}`;

    try {
      const urlObj = new URL(request.url || "/", `http://${host}`);
      await dispatch(request, response, urlObj);
    } catch (error) {
      sendJson(response, 500, {
        error: typeof error.message === "string" ? error.message : "Erro interno ao processar a requisição.",
      });
    }
  });
}

function listen(serverInstance, currentPort) {
  serverInstance.once("error", (error) => {
    if (error.code === "EADDRINUSE" && currentPort < maxPort) {
      serverInstance.close(() => {
        listen(createHttpServer(currentPort + 1), currentPort + 1);
      });
      return;
    }

    console.error("");
    console.error(`Porta ocupada (${error.code}). Não há porta livre entre ${basePort} e ${maxPort - 1}.`);
    console.error("Soluções: feche o processo que usa a porta, ou rode com outra porta, ex.:");
    console.error("  $env:PORT=\"3200\"; npm run api");
    console.error("");
    process.exitCode = 1;
  });

  serverInstance.listen(currentPort, () => {
    if (currentPort !== basePort) {
      console.log(`Porta ${basePort} ocupada — usando ${currentPort}.`);
    }

    console.log(`API GitHub (extração): http://localhost:${currentPort}`);
    console.log(`Token GitHub configurado: ${getGithubToken() ? "sim" : "não (limite menor da API)"}`);
  });
}

listen(createHttpServer(basePort), basePort);

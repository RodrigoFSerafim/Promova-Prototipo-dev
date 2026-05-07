const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const maxPort = port + 20;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function sendFile(response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const data = fs.readFileSync(filePath);

  response.writeHead(200, { "Content-Type": contentType });
  response.end(data);
}

function createServer() {
  return http.createServer((request, response) => {
    const urlPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
    const filePath = path.join(root, urlPath);

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(response, filePath);
      return;
    }

    sendFile(response, path.join(root, "index.html"));
  });
}

function listen(server, currentPort) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && currentPort < maxPort) {
      server.close(() => {
        listen(createServer(), currentPort + 1);
      });
      return;
    }

    throw error;
  });

  server.listen(currentPort, () => {
    console.log(`Development server running at http://localhost:${currentPort}`);
  });
}

listen(createServer(), port);

const http = require("http");
const fs = require("fs");
const path = require("path");
const { analyzeGrowthRecord } = require("./server/ai-analysis.cjs");

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = __dirname;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        aiConfigured: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      const body = await readJsonBody(request);
      const result = await analyzeGrowthRecord(body);
      sendJson(response, 200, result);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: { code: "method_not_allowed", message: "Use GET or POST." } });
      return;
    }

    serveStatic(url.pathname, response, request.method === "HEAD");
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: {
        code: error.code || "server_error",
        message: error.message || "Server error.",
      },
    });
  }
});

server.listen(PORT, () => {
  console.log(`LifeBook server running at http://localhost:${PORT}`);
  console.log(process.env.OPENAI_API_KEY ? "AI analysis enabled." : "AI analysis disabled: set OPENAI_API_KEY to enable it.");
});

function serveStatic(pathname, response, headOnly = false) {
  if (pathname !== "/" && pathname !== "/index.html" && !pathname.startsWith("/app/")) {
    sendJson(response, 404, { error: { code: "not_found", message: "Not found." } });
    return;
  }

  const decodedPath = decodeURIComponent(pathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(PUBLIC_DIR, normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: { code: "forbidden", message: "Forbidden." } });
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    sendJson(response, 404, { error: { code: "not_found", message: "Not found." } });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
  });

  if (headOnly) {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        error.code = "body_too_large";
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error("Request body must be valid JSON.");
        error.statusCode = 400;
        error.code = "invalid_json";
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  response.end(JSON.stringify(body));
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

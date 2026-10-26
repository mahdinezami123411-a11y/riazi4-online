const http = require("node:http");

const PORT = Number(process.env.PORT || 10000);
const SUPABASE_ORIGIN = "https://wcntoueuhgsfkunannpx.supabase.co";
const ALLOWED_ORIGINS = new Set([
  "https://mahdinezami123411-a11y.github.io"
]);
const ALLOWED_PREFIXES = [
  "/auth/v1/",
  "/rest/v1/",
  "/functions/v1/",
  "/storage/v1/",
  "/realtime/v1/"
];

function corsHeaders(origin) {
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, range, accept, accept-profile, content-profile, x-upsert",
    "Access-Control-Expose-Headers": "content-range, range, x-total-count, x-supabase-api-version",
    "Access-Control-Max-Age": "600"
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const cors = corsHeaders(origin);

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors });
    return res.end(JSON.stringify({ ok: true, service: "fourami-api-proxy" }));
  }

  if (req.method === "OPTIONS") {
    if (!ALLOWED_ORIGINS.has(origin)) {
      res.writeHead(403, { "content-type": "application/json; charset=utf-8", ...cors });
      return res.end(JSON.stringify({ error: "origin_not_allowed" }));
    }
    res.writeHead(204, cors);
    return res.end();
  }

  if (!ALLOWED_ORIGINS.has(origin)) {
    res.writeHead(403, { "content-type": "application/json; charset=utf-8", ...cors });
    return res.end(JSON.stringify({ error: "origin_not_allowed" }));
  }

  let parsed;
  try {
    parsed = new URL(req.url, "http://proxy.local");
  } catch {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8", ...cors });
    return res.end(JSON.stringify({ error: "invalid_path" }));
  }

  if (!ALLOWED_PREFIXES.some(prefix => parsed.pathname.startsWith(prefix)) || parsed.pathname.includes("..")) {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8", ...cors });
    return res.end(JSON.stringify({ error: "path_not_allowed" }));
  }

  const headers = new Headers();
  for (const name of ["authorization", "apikey", "content-type", "accept", "prefer", "range", "x-client-info", "x-supabase-api-version", "accept-profile", "content-profile", "x-upsert"]) {
    const value = req.headers[name];
    if (value) headers.set(name, value);
  }

  try {
    const upstream = await fetch(SUPABASE_ORIGIN + parsed.pathname + parsed.search, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
      duplex: ["GET", "HEAD"].includes(req.method) ? undefined : "half",
      redirect: "manual",
      signal: AbortSignal.timeout(25000)
    });

    const responseHeaders = { ...cors, "cache-control": "no-store" };
    for (const name of ["content-type", "content-range", "accept-ranges", "etag", "location", "retry-after", "x-total-count", "content-disposition"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders[name] = value;
    }

    res.writeHead(upstream.status, responseHeaders);
    if (req.method === "HEAD" || !upstream.body) return res.end();
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors });
      res.end(JSON.stringify({ error: "upstream_unavailable" }));
    } else {
      res.destroy();
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Fourami API proxy listening on port " + PORT);
});

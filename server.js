"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT) || 3016;
const host = process.env.HOST || "127.0.0.1";
const root = path.resolve(__dirname);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function resolveSafePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || "/").split("?")[0]);
  if (pathname.includes("\0")) return null;
  let rel = pathname.replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  const segments = rel.split("/").filter(Boolean);
  for (const s of segments) {
    if (s === ".." || s === ".") return null;
  }
  const joined = path.join(root, ...segments);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (joined !== root && !joined.startsWith(rootWithSep)) return null;
  return joined;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(filePath).on("error", () => {
    if (!res.headersSent) {
      res.writeHead(500);
    }
    res.end("Internal Server Error");
  }).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }

  let filePath = resolveSafePath(req.url);
  if (!filePath) {
    res.writeHead(400);
    res.end("Bad path");
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    fs.stat(filePath, (err2, st2) => {
      if (err2 || !st2.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      if (req.method === "HEAD") {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end();
        return;
      }
      sendFile(res, filePath);
    });
  });
});

server.listen(port, host, () => {
  console.log("freelansee static: http://%s:%s/", host, port);
});

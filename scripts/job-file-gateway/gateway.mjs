import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const TICKET_MS = 30_000;
const SESSION_MS = 15 * 60_000;
const RECHECK_MS = 60_000;
const PAGE_SIZE = 100;
const COOKIE_PREFIX = "pw_job_files_";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function validJobNumber(value) {
  return typeof value === "string" &&
    /^[1-9]\d{0,9}$/.test(value) &&
    Number(value) <= 2147483647;
}

export function pathParts(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new HttpError(400, "Invalid folder path.");
  }
  if (!value) return [];
  const parts = value.split("/");
  if (parts.some((part) =>
    !part || part === "." || part === ".." ||
    /[\\:*?"<>|\x00-\x1f]/.test(part) || /[. ]$/.test(part)
  )) {
    throw new HttpError(400, "Invalid folder path.");
  }
  return parts;
}

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" ||
    (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

async function safeTarget(root, jobNumber, relative) {
  const parts = pathParts(relative);
  let rootReal;
  try {
    rootReal = await realpath(root);
  } catch {
    throw new HttpError(503, "Job files are unavailable. Connect to the company network and try again.");
  }
  const jobReal = await realpath(path.join(rootReal, jobNumber));
  if (path.dirname(jobReal).toLowerCase() !== rootReal.toLowerCase() ||
      path.basename(jobReal) !== jobNumber) {
    throw new HttpError(403, "This job folder cannot be opened.");
  }
  const target = path.join(jobReal, ...parts);
  const targetReal = await realpath(target);
  if (!within(jobReal, targetReal)) {
    throw new HttpError(403, "This item cannot be opened.");
  }
  return { target: targetReal, parts };
}

function isPrivilegedKey(key) {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role === "service_role";
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}

function randomToken() {
  return randomBytes(32).toString("hex");
}

function json(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(JSON.stringify(data));
}

function html(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  });
  res.end(body);
}

function page(title, body) {
  return '<!doctype html><html lang="en"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + escapeHtml(title) + ' · Pro West Portal</title>' +
    '<style>body{font:16px system-ui,sans-serif;margin:0;background:#f5f5f5;color:#243447}' +
    'header{background:#c62828;color:white;padding:16px 20px}header h1{font-size:21px;margin:0}' +
    'main{max-width:900px;margin:auto;padding:18px}article{background:white;border:1px solid #eadada;border-radius:14px;padding:16px}' +
    'a{color:#b71c1c}nav{margin:0 0 14px;overflow-wrap:anywhere}nav a{margin-right:8px}' +
    'ul{list-style:none;padding:0;margin:12px 0}li{border-top:1px solid #eee;padding:12px 4px;overflow-wrap:anywhere}' +
    'li a{display:block;min-height:24px;text-decoration:none;font-weight:600}' +
    '.muted{color:#607080;font-size:14px}.pager{display:flex;gap:16px;margin-top:18px}' +
    '</style><header><h1>Pro West Job Files</h1></header><main><article>' +
    body + '</article></main></html>';
}

function itemUrl(jobNumber, parts, file = false, pageNumber = 1) {
  const route = "/jobs/" + jobNumber + (file ? "/file" : "/");
  const query = new URLSearchParams();
  if (parts.length) query.set("path", parts.join("/"));
  if (!file && pageNumber > 1) query.set("page", String(pageNumber));
  const encoded = query.toString();
  return route + (encoded ? "?" + encoded : "");
}

function mimeType(name) {
  const extension = path.extname(name).toLowerCase();
  return ({
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  })[extension] || "application/octet-stream";
}

function fileDisposition(name, inline) {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return (inline ? "inline" : "attachment") +
    '; filename="' + fallback + '"; filename*=UTF-8\'\'' + encodeURIComponent(name);
}

function readRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) {
    throw new HttpError(416, "Requested file range is unavailable.");
  }
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[2] && match[1] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || start >= size || end < start) {
    throw new HttpError(416, "Requested file range is unavailable.");
  }
  end = Math.min(end, size - 1);
  return { start, end };
}

async function readSmallJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024) throw new HttpError(413, "Request is too large.");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

export function createGateway(config, { fetchImpl = fetch, now = Date.now } = {}) {
  const { rootPath, supabaseUrl, supabaseAnonKey, publicUrl, portalOrigins } = config;
  if (typeof rootPath !== "string" || !path.isAbsolute(rootPath) ||
      !supabaseUrl || !supabaseAnonKey || !publicUrl ||
      !Array.isArray(portalOrigins) || !portalOrigins.length) {
    throw new Error("Gateway configuration is incomplete.");
  }
  if (isPrivilegedKey(supabaseAnonKey)) {
    throw new Error("Use the public Supabase publishable/anon key, not a privileged key.");
  }
  const publicBase = new URL(publicUrl);
  const authUrl = new URL(supabaseUrl);
  if (authUrl.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }
  if (publicBase.protocol !== "https:" && !config.allowInsecureHttp) {
    throw new Error("GATEWAY_PUBLIC_URL must use HTTPS.");
  }
  if (publicBase.pathname !== "/" || publicBase.search || publicBase.hash) {
    throw new Error("GATEWAY_PUBLIC_URL must be an origin without a path.");
  }
  const authBase = supabaseUrl.replace(/\/+$/, "");
  const tickets = new Map();
  const sessions = new Map();
  function pruneExpired() {
    for (const [key, ticket] of tickets) {
      if (now() >= ticket.expiresAt) tickets.delete(key);
    }
    for (const [key, session] of sessions) {
      if (now() >= session.expiresAt) sessions.delete(key);
    }
  }

  async function supabaseJson(route, token) {
    let response;
    try {
      response = await fetchImpl(authBase + route, {
        headers: { apikey: supabaseAnonKey, Authorization: "Bearer " + token },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new HttpError(503, "Job files are temporarily unavailable. Try again.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(401, "Your portal session has expired. Return to the portal and try again.");
    }
    if (!response.ok) {
      throw new HttpError(503, "Job files are temporarily unavailable. Try again.");
    }
    return response.json();
  }

  async function verifyAccess(token, jobNumber) {
    const user = await supabaseJson("/auth/v1/user", token);
    if (!user?.id) throw new HttpError(401, "Sign in to the portal and try again.");
    const profiles = await supabaseJson(
      "/rest/v1/profiles?select=id%2Crole%2Cis_active&id=eq." + encodeURIComponent(user.id), token
    );
    const profile = profiles?.[0];
    if (profile?.is_active !== true ||
        !["admin", "basic"].includes(String(profile.role).toLowerCase())) {
      throw new HttpError(403, "Your account cannot access job files.");
    }
    const jobs = await supabaseJson(
      "/rest/v1/jobs?select=id%2Cjob_number&job_number=eq." + jobNumber + "&limit=1", token
    );
    if (!jobs?.length) throw new HttpError(404, "This job was not found in the portal.");
    return user.id;
  }

  async function sessionFor(req, jobNumber) {
    const match = new RegExp("(?:^|;\\s*)" + COOKIE_PREFIX + jobNumber + "=([a-f0-9]{64})(?:;|$)")
      .exec(req.headers.cookie || "");
    const key = match?.[1];
    const session = key && sessions.get(key);
    if (!session || now() >= session.expiresAt) {
      if (key) sessions.delete(key);
      throw new HttpError(401, "This file session has expired. Return to the portal and open the job again.");
    }
    if (session.jobNumber !== jobNumber) {
      throw new HttpError(403, "This file session cannot open another job.");
    }
    if (now() - session.checkedAt >= RECHECK_MS) {
      try {
        const userId = await verifyAccess(session.token, jobNumber);
        if (userId !== session.userId) throw new HttpError(403, "Your account cannot access job files.");
        session.checkedAt = now();
      } catch (error) {
        if (!(error instanceof HttpError) || error.status < 500) sessions.delete(key);
        throw error;
      }
    }
    return session;
  }

  async function listFolder(res, jobNumber, url) {
    const relative = url.searchParams.get("path") || "";
    const { target, parts } = await safeTarget(rootPath, jobNumber, relative);
    if (!(await stat(target)).isDirectory()) throw new HttpError(404, "Folder not found.");
    const entries = (await readdir(target, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }));
    const requestedPage = Number(url.searchParams.get("page") || "1");
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
      throw new HttpError(400, "Invalid page.");
    }
    const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    const pageNumber = Math.min(requestedPage, pageCount);
    const visible = entries.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
    const breadcrumbs = ['<a href="' + itemUrl(jobNumber, []) + '">Job #' + jobNumber + "</a>"];
    for (let index = 0; index < parts.length; index += 1) {
      breadcrumbs.push('<a href="' + escapeHtml(itemUrl(jobNumber, parts.slice(0, index + 1))) +
        '">' + escapeHtml(parts[index]) + "</a>");
    }
    const rows = visible.map((entry) => {
      const href = itemUrl(jobNumber, [...parts, entry.name], entry.isFile());
      return '<li><a href="' + escapeHtml(href) + '">' +
        (entry.isDirectory() ? "📁 " : "📄 ") + escapeHtml(entry.name) + "</a></li>";
    }).join("");
    const pager = '<div class="pager">' +
      (pageNumber > 1 ? '<a href="' + escapeHtml(itemUrl(jobNumber, parts, false, pageNumber - 1)) + '">Previous</a>' : "") +
      (pageNumber < pageCount ? '<a href="' + escapeHtml(itemUrl(jobNumber, parts, false, pageNumber + 1)) + '">Next</a>' : "") +
      "</div>";
    html(res, 200, page("Job #" + jobNumber,
      '<nav>' + breadcrumbs.join(" › ") + '</nav><p class="muted">' +
      entries.length + " items · page " + pageNumber + " of " + pageCount + "</p>" +
      (rows ? "<ul>" + rows + "</ul>" : "<p>This folder is empty.</p>") + pager +
      '<p><a href="' + escapeHtml(portalOrigins[0] + "/jobs") + '">Back to portal</a></p>'
    ));
  }

  async function sendFile(req, res, jobNumber, url) {
    const relative = url.searchParams.get("path") || "";
    if (!relative) throw new HttpError(400, "Choose a file.");
    const { target } = await safeTarget(rootPath, jobNumber, relative);
    const info = await stat(target);
    if (!info.isFile()) throw new HttpError(404, "File not found.");
    const name = path.basename(target);
    const type = mimeType(name);
    const range = readRange(req.headers.range, info.size);
    const start = range?.start ?? 0;
    const end = range?.end ?? Math.max(0, info.size - 1);
    const headers = {
      "Content-Type": type,
      "Content-Length": range ? end - start + 1 : info.size,
      "Content-Disposition": fileDisposition(name, type !== "application/octet-stream"),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    };
    if (range) headers["Content-Range"] = "bytes " + start + "-" + end + "/" + info.size;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === "HEAD") return res.end();
    if (info.size === 0) return res.end();
    await pipeline(createReadStream(target, { start, end }), res);
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/health" && req.method === "GET") {
        try {
          const root = await realpath(rootPath);
          if ((await stat(root)).isDirectory()) return json(res, 200, { ok: true });
        } catch {
          // Report an unavailable share as unready, even while the process is running.
        }
        throw new HttpError(503, "Job files are unavailable. Connect to the company network and try again.");
      }
      if (url.pathname === "/api/launch") {
        const origin = req.headers.origin;
        if (origin && !portalOrigins.includes(origin)) {
          throw new HttpError(403, "This portal origin is not allowed.");
        }
        const cors = origin ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Vary": "Origin",
        } : {};
        if (req.method === "OPTIONS") {
          res.writeHead(204, cors);
          return res.end();
        }
        if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
        const token = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
        if (!token) throw new HttpError(401, "Sign in to the portal and try again.");
        const { jobNumber } = await readSmallJson(req);
        if (!validJobNumber(jobNumber)) throw new HttpError(400, "Invalid job number.");
        const userId = await verifyAccess(token, jobNumber);
        const jobFolder = await safeTarget(rootPath, jobNumber, "");
        if (!(await stat(jobFolder.target)).isDirectory()) {
          throw new HttpError(404, "This job folder was not found.");
        }
        pruneExpired();
        const ticket = randomToken();
        tickets.set(ticket, { jobNumber, userId, token, expiresAt: now() + TICKET_MS });
        const launchUrl = new URL("/launch/" + ticket, publicBase);
        return json(res, 200, { url: launchUrl.href }, cors);
      }
      const launchMatch = /^\/launch\/([a-f0-9]{64})$/.exec(url.pathname);
      if (launchMatch && req.method === "GET") {
        const ticket = tickets.get(launchMatch[1]);
        tickets.delete(launchMatch[1]);
        if (!ticket || now() >= ticket.expiresAt) {
          throw new HttpError(401, "This job link has expired. Return to the portal and try again.");
        }
        const sessionKey = randomToken();
        sessions.set(sessionKey, { ...ticket, checkedAt: now(), expiresAt: now() + SESSION_MS });
        res.writeHead(303, {
          Location: itemUrl(ticket.jobNumber, []),
          "Set-Cookie": COOKIE_PREFIX + ticket.jobNumber + "=" + sessionKey +
            "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + SESSION_MS / 1000,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        });
        return res.end();
      }
      const jobMatch = /^\/jobs\/([1-9]\d{0,9})(\/file|\/)$/.exec(url.pathname);
      if (jobMatch && validJobNumber(jobMatch[1])) {
        if (req.method !== "GET" && !(req.method === "HEAD" && jobMatch[2] === "/file")) {
          throw new HttpError(405, "Method not allowed.");
        }
        await sessionFor(req, jobMatch[1]);
        if (jobMatch[2] === "/file") return await sendFile(req, res, jobMatch[1], url);
        return await listFolder(res, jobMatch[1], url);
      }
      throw new HttpError(404, "Page not found.");
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = error instanceof HttpError ? error.status :
        error?.code === "ENOENT" ? 404 :
        error?.code === "EACCES" ? 403 : 500;
      const message = error instanceof HttpError ? error.message :
        status === 404 ? "This job folder or file was not found." :
        status === 403 ? "This folder cannot be accessed." :
        "Job files are unavailable. Connect to the company network and try again.";
      if (status === 500) console.error("Job file gateway error:", error?.message || error);
      if (req.url?.startsWith("/api/")) {
        const origin = req.headers.origin;
        const cors = origin && portalOrigins.includes(origin) ?
          { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
        return json(res, status, { error: message }, cors);
      }
      return html(res, status, page("Job files", '<p>' + escapeHtml(message) + '</p>' +
        '<p><a href="' + escapeHtml(portalOrigins[0] + "/jobs") + '">Back to portal</a></p>'));
    }
  });
  return server;
}

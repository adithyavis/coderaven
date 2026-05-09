import { IncomingMessage, ServerResponse } from "http";
import * as fs from "fs";
import * as path from "path";
import {
  listReviewFiles,
  readReviewFile,
  findReviewById,
  updateReview,
  newReply,
} from "../review/storage";
import { gitUser } from "../git";
import { SseHub } from "./sse";

const UI_DIR = path.resolve(__dirname, "..", "..", "ui");

const STATIC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function send(res: ServerResponse, status: number, body: string | Buffer, contentType: string): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

async function readBody(req: IncomingMessage, limit = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeJoin(base: string, sub: string): string | undefined {
  const target = path.normalize(path.join(base, sub));
  if (!target.startsWith(base)) return undefined;
  return target;
}

function serveStatic(res: ServerResponse, urlPath: string): boolean {
  const sub = urlPath === "/" ? "/index.html" : urlPath;
  const file = safeJoin(UI_DIR, sub);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const ct = STATIC_TYPES[ext] ?? "application/octet-stream";
  send(res, 200, fs.readFileSync(file), ct);
  return true;
}

export interface RouteContext {
  repoRoot: string;
  hub: SseHub;
}

export async function handle(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && p === "/api/events") {
    ctx.hub.attach(res);
    return;
  }

  if (method === "GET" && p === "/api/reviews") {
    const files = listReviewFiles(ctx.repoRoot);
    const reviews = files
      .map((f) => {
        try {
          return readReviewFile(f);
        } catch {
          return undefined;
        }
      })
      .filter(Boolean)
      .sort((a, b) => Number(b!.id) - Number(a!.id));
    sendJSON(res, 200, { reviews });
    return;
  }

  const reviewMatch = p.match(/^\/api\/reviews\/([^/]+)$/);
  if (method === "GET" && reviewMatch) {
    const found = findReviewById(ctx.repoRoot, reviewMatch[1]);
    if (!found) {
      sendJSON(res, 404, { error: "review not found" });
      return;
    }
    sendJSON(res, 200, found.review);
    return;
  }

  const resolveMatch = p.match(/^\/api\/reviews\/([^/]+)\/comments\/([^/]+)\/resolve$/);
  if (method === "POST" && resolveMatch) {
    const found = findReviewById(ctx.repoRoot, resolveMatch[1]);
    if (!found) {
      sendJSON(res, 404, { error: "review not found" });
      return;
    }
    const body = await readBody(req).catch(() => "");
    const desired = body ? (JSON.parse(body) as { resolved?: boolean }) : {};
    const updated = updateReview(found.file, (r) => {
      const c = r.comments.find((x) => x.id === resolveMatch[2]);
      if (!c) throw new Error("comment not found");
      c.resolved = desired.resolved ?? !c.resolved;
    });
    sendJSON(res, 200, updated);
    return;
  }

  const replyMatch = p.match(/^\/api\/reviews\/([^/]+)\/comments\/([^/]+)\/replies$/);
  if (method === "POST" && replyMatch) {
    const found = findReviewById(ctx.repoRoot, replyMatch[1]);
    if (!found) {
      sendJSON(res, 404, { error: "review not found" });
      return;
    }
    const body = await readBody(req).catch(() => "");
    const parsed = body ? (JSON.parse(body) as { body?: string; author?: string }) : {};
    const text = (parsed.body ?? "").trim();
    if (!text) {
      sendJSON(res, 400, { error: "empty reply" });
      return;
    }
    const u = gitUser();
    const author = parsed.author?.trim() || `${u.name} <${u.email}>`;
    const updated = updateReview(found.file, (r) => {
      const c = r.comments.find((x) => x.id === replyMatch[2]);
      if (!c) throw new Error("comment not found");
      c.replies.push(newReply(author, text));
    });
    sendJSON(res, 200, updated);
    return;
  }

  if (method === "GET" && p === "/api/me") {
    sendJSON(res, 200, gitUser());
    return;
  }

  if (method === "GET") {
    if (p.startsWith("/review/")) {
      if (serveStatic(res, "/review.html")) return;
    } else if (serveStatic(res, p)) {
      return;
    }
  }

  sendJSON(res, 404, { error: "not found", path: p });
}

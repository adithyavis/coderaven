import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { RawReviewOutput, StoredReview, StoredComment, Reply } from "./schema";
import { sanitizeBranchForFilename } from "../git";
import { parseUnifiedDiff, extractContextHunk } from "./diffparse";

export function coderavenDir(repoRoot: string): string {
  return path.join(repoRoot, ".coderaven");
}

export function reviewsDir(repoRoot: string): string {
  return path.join(coderavenDir(repoRoot), "reviews");
}

export function ensureDirs(repoRoot: string): void {
  fs.mkdirSync(reviewsDir(repoRoot), { recursive: true });
}

function shortId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

export function reviewFilename(branch: string, unix: number): string {
  return `${sanitizeBranchForFilename(branch)}-${unix}.json`;
}

export function reviewPath(repoRoot: string, branch: string, unix: number): string {
  return path.join(reviewsDir(repoRoot), reviewFilename(branch, unix));
}

export function buildStoredReview(
  raw: RawReviewOutput,
  meta: { branch: string; baseBranch: string; commit: string; diff?: string },
): StoredReview {
  const unix = Math.floor(Date.now() / 1000);
  const createdAt = new Date(unix * 1000).toISOString();

  const parsedDiff = meta.diff ? parseUnifiedDiff(meta.diff) : [];

  const comments: StoredComment[] = raw.comments.map((c) => {
    const hunk = parsedDiff.length
      ? extractContextHunk(parsedDiff, {
          filepath: c.filepath,
          newLineStart: c.lineStart,
          newLineEnd: c.lineEnd,
          context: 3,
        })
      : undefined;

    const originalLines = hunk
      ? hunk
          .filter(
            (l) =>
              l.type !== "remove" &&
              l.newLine !== undefined &&
              l.newLine >= c.lineStart &&
              l.newLine <= c.lineEnd,
          )
          .map((l) => l.text)
      : undefined;

    return {
      ...c,
      id: shortId("c"),
      resolved: false,
      replies: [],
      contextHunk: hunk,
      originalLines: originalLines && originalLines.length ? originalLines : undefined,
    };
  });

  return {
    id: String(unix),
    branch: meta.branch,
    baseBranch: meta.baseBranch,
    commit: meta.commit,
    createdAt,
    comments,
  };
}

export function writeReview(repoRoot: string, review: StoredReview): string {
  ensureDirs(repoRoot);
  const file = reviewPath(repoRoot, review.branch, Number(review.id));
  fs.writeFileSync(file, JSON.stringify(review, null, 2) + "\n", "utf8");
  return file;
}

export function listReviewFiles(repoRoot: string): string[] {
  const dir = reviewsDir(repoRoot);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

export function readReviewFile(file: string): StoredReview {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as StoredReview;
}

export function findReviewById(
  repoRoot: string,
  id: string,
): { review: StoredReview; file: string } | undefined {
  for (const f of listReviewFiles(repoRoot)) {
    try {
      const r = readReviewFile(f);
      if (r.id === id) return { review: r, file: f };
    } catch {
      continue;
    }
  }
  return undefined;
}

export function updateReview(file: string, mutator: (r: StoredReview) => void): StoredReview {
  const review = readReviewFile(file);
  mutator(review);
  fs.writeFileSync(file, JSON.stringify(review, null, 2) + "\n", "utf8");
  return review;
}

export function newReply(author: string, body: string): Reply {
  return {
    author,
    body,
    createdAt: new Date().toISOString(),
  };
}

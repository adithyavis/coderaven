export interface HunkLine {
  type: "context" | "add" | "remove";
  oldLine?: number;
  newLine?: number;
  text: string;
}

interface ParsedHunk {
  oldStart: number;
  newStart: number;
  lines: HunkLine[];
}

interface FileDiff {
  oldPath: string;
  newPath: string;
  hunks: ParsedHunk[];
}

const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+?)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiff(diff: string): FileDiff[] {
  const lines = diff.split("\n");
  const files: FileDiff[] = [];
  let current: FileDiff | undefined;
  let hunk: ParsedHunk | undefined;
  let oldLine = 0;
  let newLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];

    const fh = ln.match(FILE_HEADER);
    if (fh) {
      current = { oldPath: fh[1], newPath: fh[2], hunks: [] };
      files.push(current);
      hunk = undefined;
      continue;
    }

    if (!current) continue;
    if (
      ln.startsWith("--- ") ||
      ln.startsWith("+++ ") ||
      ln.startsWith("index ") ||
      ln.startsWith("new file") ||
      ln.startsWith("deleted file") ||
      ln.startsWith("similarity ") ||
      ln.startsWith("rename ")
    ) {
      continue;
    }

    const hh = ln.match(HUNK_HEADER);
    if (hh) {
      hunk = { oldStart: Number(hh[1]), newStart: Number(hh[3]), lines: [] };
      current.hunks.push(hunk);
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      continue;
    }

    if (!hunk) continue;

    if (ln.startsWith("\\ No newline")) {
      continue;
    }

    const tag = ln[0];
    const text = ln.slice(1);
    if (tag === "+") {
      hunk.lines.push({ type: "add", newLine, text });
      newLine++;
    } else if (tag === "-") {
      hunk.lines.push({ type: "remove", oldLine, text });
      oldLine++;
    } else if (tag === " ") {
      hunk.lines.push({ type: "context", oldLine, newLine, text });
      oldLine++;
      newLine++;
    } else if (ln === "") {
      // blank line inside a hunk is treated as context with empty text
      hunk.lines.push({ type: "context", oldLine, newLine, text: "" });
      oldLine++;
      newLine++;
    }
  }

  return files;
}

function newRangeOfHunk(h: ParsedHunk): { start: number; end: number } {
  let last = h.newStart - 1;
  for (const l of h.lines) {
    if (l.type !== "remove" && l.newLine !== undefined) last = l.newLine;
  }
  return { start: h.newStart, end: last };
}

export interface ExtractContextOptions {
  filepath: string;
  newLineStart: number;
  newLineEnd: number;
  context?: number;
}

function normalizePath(p: string): string {
  return p.replace(/^\.?\/+/, "");
}

function findFileDiff(parsed: FileDiff[], filepath: string): FileDiff | undefined {
  const target = normalizePath(filepath);
  const exact = parsed.find(
    (f) => normalizePath(f.newPath) === target || normalizePath(f.oldPath) === target,
  );
  if (exact) return exact;
  const suffix = "/" + target;
  const bySuffix = parsed.find(
    (f) => normalizePath(f.newPath).endsWith(suffix) || normalizePath(f.oldPath).endsWith(suffix),
  );
  if (bySuffix) return bySuffix;
  const base = target.split("/").pop() ?? target;
  const matches = parsed.filter(
    (f) =>
      normalizePath(f.newPath).split("/").pop() === base ||
      normalizePath(f.oldPath).split("/").pop() === base,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function extractContextHunk(
  parsed: FileDiff[],
  opts: ExtractContextOptions,
): HunkLine[] | undefined {
  const { filepath, newLineStart, newLineEnd } = opts;
  const ctx = opts.context ?? 3;

  const file = findFileDiff(parsed, filepath);
  if (!file) {
    if (process.env["CODERAVEN_DEBUG"] === "1") {
      process.stderr.write(
        `coderaven debug: no diff entry matched filepath="${filepath}" — diff has: ${parsed
          .map((f) => f.newPath)
          .join(", ")}\n`,
      );
    }
    return undefined;
  }

  let bestHunk: ParsedHunk | undefined;
  for (const h of file.hunks) {
    const r = newRangeOfHunk(h);
    if (newLineEnd >= r.start && newLineStart <= r.end) {
      bestHunk = h;
      break;
    }
  }
  if (!bestHunk) bestHunk = file.hunks[0];
  if (!bestHunk) return undefined;

  const all = bestHunk.lines;
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < all.length; i++) {
    const l = all[i];
    const ref = l.newLine ?? l.oldLine;
    if (ref === undefined) continue;
    if (l.newLine !== undefined && l.newLine >= newLineStart && l.newLine <= newLineEnd) {
      if (firstIdx === -1) firstIdx = i;
      lastIdx = i;
    }
  }

  if (firstIdx === -1) {
    return all.slice(0, Math.min(all.length, 12));
  }

  const sliceStart = Math.max(0, firstIdx - ctx);
  const sliceEnd = Math.min(all.length, lastIdx + ctx + 1);
  return all.slice(sliceStart, sliceEnd);
}

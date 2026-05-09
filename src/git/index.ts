import { execFileSync } from "child_process";

function git(args: string[], opts: { cwd?: string; allowFail?: boolean } = {}): string {
  try {
    return execFileSync("git", args, {
      cwd: opts.cwd ?? process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (err) {
    if (opts.allowFail) return "";
    throw err;
  }
}

export function repoRoot(): string {
  return git(["rev-parse", "--show-toplevel"]);
}

export function isInsideGitRepo(): boolean {
  try {
    return git(["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return false;
  }
}

export function currentBranch(): string {
  const name = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (name === "HEAD") return git(["rev-parse", "--short", "HEAD"]);
  return name;
}

export function currentCommit(): string {
  return git(["rev-parse", "--short", "HEAD"]);
}

export function detectBaseBranch(): string {
  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const c of candidates) {
    const out = git(["rev-parse", "--verify", "--quiet", c], { allowFail: true });
    if (out) return c;
  }
  return "HEAD~1";
}

export function diffAgainst(base: string): string {
  return git(["diff", `${base}...HEAD`]);
}

export function gitUser(): { name: string; email: string } {
  const name = git(["config", "user.name"], { allowFail: true }) || "unknown";
  const email = git(["config", "user.email"], { allowFail: true }) || "unknown@local";
  return { name, email };
}

export function sanitizeBranchForFilename(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9._-]/g, "_");
}

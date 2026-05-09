import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import open from "open";
import {
  isInsideGitRepo,
  repoRoot,
  currentBranch,
  currentCommit,
  detectBaseBranch,
  diffAgainst,
} from "../../git";
import { buildPrompt } from "../../review/prompt";
import { runClaudeReview } from "../../review/runner";
import { buildStoredReview, writeReview, ensureDirs, coderavenDir } from "../../review/storage";
import { ensureServer } from "../../server/pid";

export interface ReviewOptions {
  base?: string;
  openBrowser: boolean;
  port?: number;
}

const DEFAULT_PORT = 6677;

export async function runReview(opts: ReviewOptions): Promise<void> {
  if (!isInsideGitRepo()) {
    throw new Error("Not inside a git repository. Run `git init` first.");
  }
  const root = repoRoot();
  ensureDirs(root);

  const branch = currentBranch();
  const commit = currentCommit();
  const baseBranch = opts.base ?? detectBaseBranch();
  const diff = diffAgainst(baseBranch);

  if (!diff.trim()) {
    process.stdout.write(`No diff between ${baseBranch} and HEAD — nothing to review.\n`);
    return;
  }

  process.stdout.write(`coderaven: reviewing ${branch} vs ${baseBranch} (${commit})\n`);
  process.stdout.write(`           diff: ${diff.split("\n").length} lines\n`);

  const prompt = buildPrompt({ branch, baseBranch, diff, repoRoot: root });

  const port = opts.port ?? DEFAULT_PORT;
  const serverInfo = await ensureServer({ repoRoot: root, port, cliPath: process.argv[1] });
  process.stdout.write(`           server: http://localhost:${serverInfo.port}\n`);

  process.stdout.write(`           calling claude...\n`);
  let output;
  try {
    fs.writeFileSync(path.join(coderavenDir(root), ".last-prompt.txt"), prompt, "utf8");
    const r = await runClaudeReview(prompt);
    output = r.output;
    fs.writeFileSync(
      path.join(coderavenDir(root), ".last-claude-response.json"),
      JSON.stringify(r.rawClaudeJson, null, 2),
      "utf8",
    );
  } catch (err) {
    const debugPath = path.join(coderavenDir(root), ".last-claude-error.txt");
    fs.writeFileSync(debugPath, err instanceof Error ? err.message : String(err), "utf8");
    process.stderr.write(
      `coderaven: review failed. Debug info written to ${path.relative(root, debugPath)}\n`,
    );
    throw err;
  }
  process.stdout.write(`           got ${output.comments.length} comment(s)\n`);

  const review = buildStoredReview(output, { branch, baseBranch, commit, diff });
  const file = writeReview(root, review);
  process.stdout.write(`           wrote ${path.relative(root, file)}\n`);

  const url = `http://localhost:${serverInfo.port}/review/${review.id}`;
  process.stdout.write(`           open: ${url}\n`);
  if (opts.openBrowser) {
    try {
      await open(url);
    } catch {
      // browser launch is best-effort
    }
  }
}

export { spawn };

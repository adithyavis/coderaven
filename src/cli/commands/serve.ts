import { isInsideGitRepo, repoRoot } from "../../git";
import { startServer } from "../../server/server";
import { writePid } from "../../server/pid";

const DEFAULT_PORT = 6677;

export async function runServe(opts: { port?: number }): Promise<void> {
  if (!isInsideGitRepo()) {
    throw new Error("Not inside a git repository.");
  }
  const root = repoRoot();
  const port = opts.port ?? DEFAULT_PORT;

  await startServer({ repoRoot: root, port });
  writePid(root, { pid: process.pid, port });

  process.stdout.write(`coderaven server listening on http://localhost:${port}\n`);
  process.stdout.write(`watching ${root}/.coderaven/reviews/\n`);
}

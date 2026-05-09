import { isInsideGitRepo, repoRoot } from "../../git";
import { readPid, clearPid } from "../../server/pid";

export async function runStop(): Promise<void> {
  if (!isInsideGitRepo()) {
    throw new Error("Not inside a git repository.");
  }
  const root = repoRoot();
  const info = readPid(root);
  if (!info) {
    process.stdout.write("No coderaven server running.\n");
    return;
  }
  try {
    process.kill(info.pid, "SIGTERM");
    process.stdout.write(`Stopped server (pid ${info.pid}, port ${info.port}).\n`);
  } catch (err) {
    process.stdout.write(`Server pid ${info.pid} was not running.\n`);
  }
  clearPid(root);
}

import { isInsideGitRepo, repoRoot } from "../../git";
import { readPid, clearPid, isProcessAlive } from "../../server/pid";

const SIGTERM_GRACE_MS = 1500;
const SIGKILL_GRACE_MS = 1000;
const POLL_INTERVAL_MS = 50;

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return !isProcessAlive(pid);
}

function signal(pid: number, sig: "SIGTERM" | "SIGKILL"): void {
  try {
    process.kill(pid, sig);
  } catch {
    // process already gone
  }
}

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

  if (!isProcessAlive(info.pid)) {
    clearPid(root);
    process.stdout.write(`Server pid ${info.pid} was not running.\n`);
    return;
  }

  signal(info.pid, "SIGTERM");
  if (await waitForExit(info.pid, SIGTERM_GRACE_MS)) {
    clearPid(root);
    process.stdout.write(`Stopped server (pid ${info.pid}, port ${info.port}).\n`);
    return;
  }

  process.stdout.write(`pid ${info.pid} ignored SIGTERM, sending SIGKILL.\n`);
  signal(info.pid, "SIGKILL");
  if (await waitForExit(info.pid, SIGKILL_GRACE_MS)) {
    clearPid(root);
    process.stdout.write(`Killed server (pid ${info.pid}, port ${info.port}).\n`);
    return;
  }
  process.stdout.write(`Could not stop pid ${info.pid}; please kill manually.\n`);
}

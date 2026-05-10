import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import { spawn } from "child_process";
import { coderavenDir } from "../review/storage";

const PID_FILENAME = ".server.pid";
const LOG_FILENAME = ".server.log";

export interface ServerInfo {
  pid: number;
  port: number;
}

function pidFile(repoRoot: string): string {
  return path.join(coderavenDir(repoRoot), PID_FILENAME);
}

function logFile(repoRoot: string): string {
  return path.join(coderavenDir(repoRoot), LOG_FILENAME);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readPid(repoRoot: string): ServerInfo | undefined {
  const f = pidFile(repoRoot);
  if (!fs.existsSync(f)) return undefined;
  try {
    const raw = fs.readFileSync(f, "utf8").trim();
    const parsed = JSON.parse(raw) as ServerInfo;
    if (!isProcessAlive(parsed.pid)) {
      fs.unlinkSync(f);
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function writePid(repoRoot: string, info: ServerInfo): void {
  fs.mkdirSync(coderavenDir(repoRoot), { recursive: true });
  fs.writeFileSync(pidFile(repoRoot), JSON.stringify(info), "utf8");
}

export function clearPid(repoRoot: string): void {
  const f = pidFile(repoRoot);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

function probePort(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
    setTimeout(() => finish(false), timeoutMs);
  });
}

async function waitForServer(port: number, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probePort(port)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for server on port ${port}`);
}

export interface EnsureServerOptions {
  repoRoot: string;
  port: number;
  cliPath: string;
}

export async function ensureServer(opts: EnsureServerOptions): Promise<ServerInfo> {
  const existing = readPid(opts.repoRoot);
  if (existing) {
    const alive = await probePort(existing.port);
    if (alive) return existing;
    clearPid(opts.repoRoot);
  }

  fs.mkdirSync(coderavenDir(opts.repoRoot), { recursive: true });
  const out = fs.openSync(logFile(opts.repoRoot), "a");
  const err = fs.openSync(logFile(opts.repoRoot), "a");

  const child = spawn(process.execPath, [opts.cliPath, "serve", "--port", String(opts.port)], {
    detached: true,
    stdio: ["ignore", out, err],
    cwd: opts.repoRoot,
    env: { ...process.env, CODERAVEN_DAEMON: "1" },
  });
  child.unref();

  await waitForServer(opts.port);

  const info: ServerInfo = { pid: child.pid ?? 0, port: opts.port };
  writePid(opts.repoRoot, info);
  return info;
}

#!/usr/bin/env node
import { runReview } from "./commands/review";
import { runServe } from "./commands/serve";
import { runStop } from "./commands/stop";

const VERSION = "0.1.0";

function printHelp(): void {
  process.stdout.write(`coderaven ${VERSION}

Usage:
  coderaven review [--base <branch>] [--no-open]   Run a review of the current branch
  coderaven serve [--port <port>]                  Start the review viewer (foreground)
  coderaven stop                                   Stop the running viewer
  coderaven --version                              Print version
  coderaven --help                                 This help

Reviews are stored under .coderaven/reviews/<branch>-<unix>.json and viewable
at http://localhost:6677 once the server is running.
`);
}

interface Flags {
  positional: string[];
  named: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Flags {
  const positional: string[] = [];
  const named: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        named[key] = next;
        i++;
      } else {
        named[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, named };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = parseArgs(argv);

  if (flags.named["version"] || flags.named["v"]) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (flags.named["help"] || flags.named["h"] || flags.positional.length === 0) {
    printHelp();
    return;
  }

  const cmd = flags.positional[0];
  switch (cmd) {
    case "review":
      await runReview({
        base: typeof flags.named["base"] === "string" ? (flags.named["base"] as string) : undefined,
        openBrowser: flags.named["no-open"] !== true,
      });
      return;
    case "serve":
      await runServe({
        port: typeof flags.named["port"] === "string" ? Number(flags.named["port"]) : undefined,
      });
      return;
    case "stop":
      await runStop();
      return;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n`);
      printHelp();
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`coderaven: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

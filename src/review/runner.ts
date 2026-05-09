import { spawn } from "child_process";
import { reviewSchema, RawReviewOutput } from "./schema";

export interface RunResult {
  output: RawReviewOutput;
  rawClaudeJson: unknown;
}

function tryParseJSON(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function extractStructuredOutput(claudeResult: unknown): RawReviewOutput {
  if (typeof claudeResult !== "object" || claudeResult === null) {
    throw new Error("Unexpected claude output: not an object");
  }
  const obj = claudeResult as Record<string, unknown>;

  if (obj["is_error"] === true || obj["subtype"] === "error_during_execution") {
    const errs = obj["errors"] ?? obj["result"] ?? obj;
    throw new Error(`claude reported an error: ${JSON.stringify(errs).slice(0, 2000)}`);
  }

  let parsed: unknown;
  if (obj["structured_output"] && typeof obj["structured_output"] === "object") {
    parsed = obj["structured_output"];
  } else {
    const result = obj["result"];
    if (typeof result === "string") {
      const direct = tryParseJSON(result);
      if (direct !== undefined) {
        parsed = direct;
      } else {
        const match = result.match(/\{[\s\S]*\}/);
        if (match) parsed = tryParseJSON(match[0]);
      }
    } else if (result && typeof result === "object") {
      parsed = result;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    const dump = JSON.stringify(claudeResult, null, 2) ?? String(claudeResult);
    throw new Error(
      `Could not parse structured review from claude output.\nFull claude response:\n${dump.slice(0, 4000)}`,
    );
  }

  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p["comments"])) {
    if (Array.isArray(p) || ("filepath" in p && "lineStart" in p)) {
      throw new Error("Model returned a comment list directly; expected { comments: [...] }");
    }
    throw new Error(
      `Parsed object missing 'comments' array. Got keys: ${Object.keys(p).join(", ")}`,
    );
  }

  return parsed as RawReviewOutput;
}

export async function runClaudeReview(prompt: string): Promise<RunResult> {
  // claude 2.0.76 has a startup crash (`T.effortLevel is null`) on certain
  // setting combos when --json-schema is used. We default to prompt-only JSON
  // (more portable). Set CODERAVEN_USE_SCHEMA=1 to opt into --json-schema.
  const model = process.env["CODERAVEN_MODEL"] ?? "sonnet";
  const useSchema = process.env["CODERAVEN_USE_SCHEMA"] === "1";
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    model,
    "--tools",
    "",
    "--setting-sources",
    process.env["CODERAVEN_SETTING_SOURCES"] ?? "user",
  ];
  if (useSchema) {
    args.push("--json-schema", JSON.stringify(reviewSchema));
  }

  if (process.env["CODERAVEN_DEBUG"] === "1") {
    process.stderr.write(
      `\ncoderaven debug: claude ${args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}\n`,
    );
    process.stderr.write(`coderaven debug: prompt length = ${prompt.length} chars\n`);
  }

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "`claude` CLI not found on PATH. Install Claude Code first: https://claude.ai/code",
          ),
        );
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}\nstderr:\n${stderr}`));
        return;
      }
      const top = tryParseJSON(stdout);
      if (top === undefined) {
        reject(new Error(`Could not parse claude JSON output:\n${stdout.slice(0, 1000)}`));
        return;
      }
      try {
        const output = extractStructuredOutput(top);
        resolve({ output, rawClaudeJson: top });
      } catch (e) {
        reject(e);
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

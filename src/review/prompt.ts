import * as fs from "fs";
import * as path from "path";

export interface PromptInput {
  branch: string;
  baseBranch: string;
  diff: string;
  repoRoot: string;
}

const BASE_INSTRUCTIONS = `You are an expert code reviewer. Review the provided git diff and produce a structured list of comments.

Rules:
- Only flag real, actionable issues. Skip nits and stylistic preferences unless they reflect a project rule below.
- Prefer fewer, higher-signal comments over many low-value ones.
- Each comment must reference a real file path (relative to repo root) and the line numbers in the *new* version of the file (the "+" side of the diff).
- For "suggestedCode", emit the replacement text for lines lineStart..lineEnd inclusive. Omit if no concrete fix.
- "severity" must be one of: info, warning, critical.
- "category" is a short tag like "bug", "security", "performance", "logic", "style", "docs", "test".
- If there are no real issues, return { "comments": [] }.

Output format — return ONLY a single JSON object with this exact shape, no prose, no markdown fences:
{
  "comments": [
    {
      "filepath":      "<string, relative to repo root>",
      "lineStart":     <integer, 1-based, in the new file>,
      "lineEnd":       <integer, 1-based, in the new file>,
      "severity":      "info" | "warning" | "critical",
      "category":      "<short tag>",
      "message":       "<the review comment>",
      "suggestedCode": "<optional replacement text>"
    }
  ]
}`;

export function loadUserConfig(repoRoot: string): { extraRules?: string } {
  const cfgPath = path.join(repoRoot, ".coderaven", "config.json");
  if (!fs.existsSync(cfgPath)) return {};
  try {
    const raw = fs.readFileSync(cfgPath, "utf8");
    const parsed = JSON.parse(raw);
    return { extraRules: typeof parsed.extraRules === "string" ? parsed.extraRules : undefined };
  } catch {
    return {};
  }
}

export function buildPrompt(input: PromptInput): string {
  const { branch, baseBranch, diff, repoRoot } = input;
  const userCfg = loadUserConfig(repoRoot);
  const extra = userCfg.extraRules
    ? `\n\nProject-specific rules (from .coderaven/config.json):\n${userCfg.extraRules}\n`
    : "";

  return `${BASE_INSTRUCTIONS}${extra}

Branch: ${branch}
Base:   ${baseBranch}

Diff (git diff ${baseBranch}...HEAD):
\`\`\`diff
${diff}
\`\`\`
`;
}

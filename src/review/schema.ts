export const reviewSchema = {
  type: "object",
  required: ["comments"],
  additionalProperties: false,
  properties: {
    comments: {
      type: "array",
      items: {
        type: "object",
        required: ["filepath", "lineStart", "lineEnd", "severity", "message"],
        additionalProperties: false,
        properties: {
          filepath: { type: "string" },
          lineStart: { type: "integer", minimum: 1 },
          lineEnd: { type: "integer", minimum: 1 },
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          category: { type: "string" },
          message: { type: "string" },
          suggestedCode: { type: "string" },
        },
      },
    },
  },
} as const;

export interface RawComment {
  filepath: string;
  lineStart: number;
  lineEnd: number;
  severity: "info" | "warning" | "critical";
  category?: string;
  message: string;
  suggestedCode?: string;
}

export interface RawReviewOutput {
  comments: RawComment[];
}

export interface Reply {
  author: string;
  body: string;
  createdAt: string;
}

export interface HunkLineStored {
  type: "context" | "add" | "remove";
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface StoredComment extends RawComment {
  id: string;
  resolved: boolean;
  replies: Reply[];
  contextHunk?: HunkLineStored[];
  originalLines?: string[];
  commentsCollapsed?: boolean;
}

export interface StoredReview {
  id: string;
  branch: string;
  baseBranch: string;
  commit: string;
  createdAt: string;
  comments: StoredComment[];
}

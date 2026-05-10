(function () {
  const api = {
    async listReviews() {
      const r = await fetch("/api/reviews");
      return (await r.json()).reviews;
    },
    async getReview(id) {
      const r = await fetch("/api/reviews/" + encodeURIComponent(id));
      if (!r.ok) throw new Error("not found");
      return await r.json();
    },
    async toggleResolve(reviewId, commentId, resolved) {
      const r = await fetch(
        `/api/reviews/${encodeURIComponent(reviewId)}/comments/${encodeURIComponent(commentId)}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolved }),
        },
      );
      return await r.json();
    },
    async toggleCommentsCollapsed(reviewId, commentId, collapsed) {
      const r = await fetch(
        `/api/reviews/${encodeURIComponent(reviewId)}/comments/${encodeURIComponent(commentId)}/collapse-comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collapsed }),
        },
      );
      return await r.json();
    },
    async reply(reviewId, commentId, body) {
      const r = await fetch(
        `/api/reviews/${encodeURIComponent(reviewId)}/comments/${encodeURIComponent(commentId)}/replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!r.ok) throw new Error((await r.json()).error || "reply failed");
      return await r.json();
    },
  };

  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const fmtTime = (iso) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const reviewIdFromPath = () => {
    const m = location.pathname.match(/\/review\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : undefined;
  };

  const COPY_ICON_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  // Use role="button" span (not <button>) so the copy control can sit safely
  // inside an <a class="review-row"> on the index page without nesting violations.
  function copyButtonHtml(text) {
    const safe = escapeHtml(text);
    return `<span class="copy-btn" role="button" tabindex="0" data-copy="${safe}" aria-label="Copy ${safe}" title="Copy">${COPY_ICON_SVG}</span>`;
  }

  async function handleCopyActivation(e) {
    const btn = e.target.closest(".copy-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const text = btn.dataset.copy;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add("copied");
      setTimeout(() => btn.classList.remove("copied"), 1200);
    } catch {
      // clipboard API unavailable — silent fail
    }
  }
  document.addEventListener("click", handleCopyActivation);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (!e.target.closest(".copy-btn")) return;
    handleCopyActivation(e);
  });

  const EXT_TO_LANGUAGE = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    hh: "cpp",
    md: "markdown",
    markdown: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    html: "xml",
    htm: "xml",
    xml: "xml",
    svg: "xml",
    css: "css",
    scss: "scss",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    toml: "ini",
    ini: "ini",
    diff: "diff",
    dockerfile: "dockerfile",
    makefile: "makefile",
  };

  function languageFromFilepath(filepath) {
    const m = String(filepath || "").match(/\.([a-zA-Z0-9]+)$/);
    if (!m) return undefined;
    return EXT_TO_LANGUAGE[m[1].toLowerCase()];
  }

  // Per-line syntax highlight. Multi-line constructs (template strings, block
  // comments) won't carry state across rows — accepted trade-off since each
  // hunk row renders independently.
  function highlightCode(text, language) {
    if (!language || !window.hljs || !window.hljs.getLanguage(language)) {
      return escapeHtml(text);
    }
    try {
      return window.hljs.highlight(text, { language, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(text);
    }
  }

  const initials = (str) => {
    const m = String(str || "").match(/^([^\s<]+)/);
    if (!m) return "?";
    const name = m[1];
    const parts = name.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  async function renderIndex() {
    const list = document.getElementById("review-list");
    const empty = document.getElementById("empty");

    async function refresh() {
      const reviews = await api.listReviews();
      list.innerHTML = "";
      if (!reviews.length) {
        empty.classList.remove("hidden");
        return;
      }
      empty.classList.add("hidden");
      for (const r of reviews) {
        const open = r.comments.filter((c) => !c.resolved).length;
        const li = document.createElement("li");
        li.innerHTML = `
          <a class="review-row" href="/review/${encodeURIComponent(r.id)}">
            <div>
              <div class="branch">
                <span class="branch-pill">${escapeHtml(r.branch)}</span>
                ${copyButtonHtml(r.branch)}
                <svg class="branch-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
                <span class="branch-pill">${escapeHtml(r.baseBranch)}</span>
              </div>
              <div class="meta-line">${escapeHtml(r.commit)} · ${fmtTime(r.createdAt)}</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <span class="count">
                <svg class="count-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                ${open} open / ${r.comments.length} total
              </span>
            </div>
          </a>
        `;
        list.appendChild(li);
      }
    }

    await refresh();
    const es = new EventSource("/api/events");
    es.addEventListener("review.added", refresh);
    es.addEventListener("review.changed", refresh);
    es.addEventListener("review.removed", refresh);
  }

  function renderHunkRows(hunkLines, language) {
    let html = "";
    for (const l of hunkLines) {
      const oldNum = l.oldLine != null ? l.oldLine : "";
      const newNum = l.newLine != null ? l.newLine : "";
      const prefix = l.type === "add" ? "+" : l.type === "remove" ? "-" : " ";
      html += `<div class="hunk-row ${l.type}">`;
      html += `<div class="lineno mono">${oldNum}</div>`;
      html += `<div class="lineno mono">${newNum}</div>`;
      html += `<div class="code mono">${escapeHtml(prefix)}${highlightCode(l.text, language)}</div>`;
      html += `</div>`;
    }
    return html;
  }

  function renderSuggestionDiff(originalLines, suggestedCode, startLineno, language) {
    const oldLines = (originalLines || []).map((t) => t);
    const newLines = String(suggestedCode || "").split("\n");
    let html = `<div class="suggestion-diff hunk">`;
    let n = startLineno || 1;
    for (const t of oldLines) {
      html += `<div class="hunk-row remove">`;
      html += `<div class="lineno mono">${n}</div>`;
      html += `<div class="code mono">${escapeHtml("-")}${highlightCode(t, language)}</div>`;
      html += `</div>`;
      n++;
    }
    let m = startLineno || 1;
    for (const t of newLines) {
      html += `<div class="hunk-row add">`;
      html += `<div class="lineno mono">${m}</div>`;
      html += `<div class="code mono">${escapeHtml("+")}${highlightCode(t, language)}</div>`;
      html += `</div>`;
      m++;
    }
    html += `</div>`;
    return html;
  }

  function renderThread(review, c) {
    const div = document.createElement("div");
    div.className = "thread" + (c.resolved ? " resolved" : "");
    div.dataset.commentId = c.id;
    const lineRange = c.lineStart === c.lineEnd ? `${c.lineStart}` : `${c.lineStart}-${c.lineEnd}`;
    const absPath = review.repoRoot ? `${review.repoRoot}/${c.filepath}` : c.filepath;
    const vscodeUrl = `vscode://file/${encodeURI(absPath)}:${c.lineStart}`;
    const sev = (c.severity || "info").toLowerCase();
    const author = "coderaven";
    const language = languageFromFilepath(c.filepath);

    const hunkHtml =
      c.contextHunk && c.contextHunk.length
        ? `<div class="hunk">${renderHunkRows(c.contextHunk, language)}</div>`
        : `<div class="hunk-empty">No diff context available for ${escapeHtml(c.filepath)}:${lineRange}</div>`;

    const suggestionHtml =
      c.suggestedCode && c.originalLines && c.originalLines.length
        ? `<div class="suggestion">
             <div class="suggestion-header"><span>Suggested change</span><span class="muted">${escapeHtml(c.filepath)}:${lineRange}</span></div>
             ${renderSuggestionDiff(c.originalLines, c.suggestedCode, c.lineStart, language)}
           </div>`
        : c.suggestedCode
          ? `<div class="suggestion">
             <div class="suggestion-header"><span>Suggested change</span></div>
             <div class="suggestion-diff hunk">${String(c.suggestedCode)
               .split("\n")
               .map(
                 (t, i) =>
                   `<div class="hunk-row add"><div class="lineno mono">${(c.lineStart || 1) + i}</div><div class="code mono">${escapeHtml("+")}${highlightCode(t, language)}</div></div>`,
               )
               .join("")}</div>
           </div>`
          : "";

    if (c.commentsCollapsed) div.classList.add("collapsed");
    const totalCount = 1 + (c.replies || []).length;
    const uniqueReplyAuthors = [...new Set((c.replies || []).map((r) => r.author))].slice(0, 2);
    const avatarStackHtml = `
      <span class="reply-avatars">
        <span class="mini-avatar mini-avatar-bot"><img src="/logo.png" alt="" /></span>
        ${uniqueReplyAuthors.map((a) => `<span class="mini-avatar">${escapeHtml(initials(a))}</span>`).join("")}
      </span>
    `;
    const collapsedLabelHtml = `
      ${avatarStackHtml}
      <span>${totalCount} ${totalCount === 1 ? "comment" : "comments"}</span>
    `;
    const expandedLabelHtml = `<span>Collapse comments</span>`;
    const chevronSvg = `<svg class="chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
    const severityRowHtml = `
      <div class="severity-row">
        ${c.category ? `<span class="category">${escapeHtml(c.category)}</span>` : ""}
        <span class="severity ${sev}">${escapeHtml(sev)}</span>
      </div>
    `;

    div.innerHTML = `
      <div class="thread-toolbar">
        <button type="button" class="js-collapse-toggle">
          ${chevronSvg}
          <span class="js-toolbar-label">${c.commentsCollapsed ? collapsedLabelHtml : expandedLabelHtml}</span>
        </button>
        ${severityRowHtml}
      </div>
      <div class="thread-content">
        <div class="file-header">
          <div class="path"><a href="${vscodeUrl}">${escapeHtml(c.filepath)}:${lineRange}</a></div>
        </div>
        ${hunkHtml}
        <div class="comment-block">
          <div class="comment-head">
            <span class="avatar avatar-bot"><img src="/logo.png" alt="coderaven" /></span>
            <span class="author">${escapeHtml(author)}</span>
          </div>
          <p class="comment-message">${escapeHtml(c.message)}</p>
          ${suggestionHtml}
        </div>
        <div class="replies"></div>
        <div class="actions">
          <button class="btn js-resolve">${c.resolved ? "Reopen thread" : "Resolve thread"}</button>
        </div>
        <div class="reply-form open">
          <textarea placeholder="Reply…"></textarea>
          <div class="row">
            <button class="btn ghost js-reply-cancel">Cancel</button>
            <button class="btn primary js-reply-submit">Send</button>
          </div>
        </div>
      </div>
    `;

    const repliesEl = div.querySelector(".replies");
    for (const reply of c.replies || []) {
      const r = document.createElement("div");
      r.className = "reply";
      r.innerHTML = `
        <div class="reply-head">
          <span class="avatar">${escapeHtml(initials(reply.author))}</span>
          <span class="author">${escapeHtml(reply.author)}</span>
          <span class="when">${fmtTime(reply.createdAt)}</span>
        </div>
        <div class="body">${escapeHtml(reply.body)}</div>
      `;
      repliesEl.appendChild(r);
    }

    div.querySelector(".js-resolve").addEventListener("click", async () => {
      try {
        await api.toggleResolve(review.id, c.id, !c.resolved);
      } catch (e) {
        alert("Failed: " + e.message);
      }
    });
    div.querySelector(".js-collapse-toggle").addEventListener("click", async () => {
      try {
        await api.toggleCommentsCollapsed(review.id, c.id, !c.commentsCollapsed);
      } catch (e) {
        alert("Failed: " + e.message);
      }
    });
    const form = div.querySelector(".reply-form");
    div.querySelector(".js-reply-cancel").addEventListener("click", () => {
      form.classList.remove("open");
    });
    div.querySelector(".js-reply-submit").addEventListener("click", async () => {
      const ta = form.querySelector("textarea");
      const text = ta.value.trim();
      if (!text) return;
      try {
        await api.reply(review.id, c.id, text);
        ta.value = "";
        form.classList.remove("open");
      } catch (e) {
        alert("Failed: " + e.message);
      }
    });
    return div;
  }

  async function renderReview() {
    const id = reviewIdFromPath();
    const meta = document.getElementById("meta");
    const loading = document.getElementById("loading");
    const root = document.getElementById("comments");

    async function refresh() {
      try {
        const r = await api.getReview(id);
        loading.classList.add("hidden");
        const open = r.comments.filter((c) => !c.resolved).length;
        meta.innerHTML = `
          <div class="meta-content">
            <div>
              <div class="branch">
                <span class="branch-pill">${escapeHtml(r.branch)}</span>
                ${copyButtonHtml(r.branch)}
                <svg class="branch-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
                <span class="branch-pill">${escapeHtml(r.baseBranch)}</span>
              </div>
              <div class="meta-line"><span class="mono">${escapeHtml(r.commit)}</span> · ${fmtTime(r.createdAt)}</div>
            </div>
            <span class="count">
              <svg class="count-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              ${open} open / ${r.comments.length} total
            </span>
          </div>
        `;
        root.innerHTML = "";
        for (const c of r.comments) root.appendChild(renderThread(r, c));
      } catch (e) {
        loading.textContent = "Could not load review: " + e.message;
      }
    }

    await refresh();
    const es = new EventSource("/api/events");
    es.addEventListener("review.changed", () => refresh());
    es.addEventListener("review.added", () => refresh());
  }

  window.coderaven = { renderIndex, renderReview };
})();

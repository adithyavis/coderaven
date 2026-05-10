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
              <div class="branch">${escapeHtml(r.branch)} <span class="muted">vs ${escapeHtml(r.baseBranch)}</span></div>
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

  function renderHunkRows(hunkLines, opts) {
    const targetStart = opts && opts.targetStart;
    const targetEnd = opts && opts.targetEnd;
    let html = "";
    for (const l of hunkLines) {
      const cls = l.type;
      const isTarget =
        l.type !== "remove" &&
        l.newLine !== undefined &&
        targetStart !== undefined &&
        l.newLine >= targetStart &&
        l.newLine <= targetEnd;
      const oldNum = l.oldLine != null ? l.oldLine : "";
      const newNum = l.newLine != null ? l.newLine : "";
      const prefix = l.type === "add" ? "+" : l.type === "remove" ? "-" : " ";
      html += `<div class="hunk-row ${cls}${isTarget ? " target" : ""}">`;
      html += `<div class="lineno mono">${oldNum}</div>`;
      html += `<div class="lineno mono">${newNum}</div>`;
      html += `<div class="code mono">${escapeHtml(prefix + l.text)}</div>`;
      html += `</div>`;
    }
    return html;
  }

  function renderSuggestionDiff(originalLines, suggestedCode, startLineno) {
    const oldLines = (originalLines || []).map((t) => t);
    const newLines = String(suggestedCode || "").split("\n");
    let html = `<div class="suggestion-diff hunk">`;
    let n = startLineno || 1;
    for (const t of oldLines) {
      html += `<div class="hunk-row remove">`;
      html += `<div class="lineno mono">${n}</div>`;
      html += `<div class="code mono">${escapeHtml("-" + t)}</div>`;
      html += `</div>`;
      n++;
    }
    let m = startLineno || 1;
    for (const t of newLines) {
      html += `<div class="hunk-row add">`;
      html += `<div class="lineno mono">${m}</div>`;
      html += `<div class="code mono">${escapeHtml("+" + t)}</div>`;
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
    const author = "claude (raven)";

    const hunkHtml =
      c.contextHunk && c.contextHunk.length
        ? `<div class="hunk">${renderHunkRows(c.contextHunk, { targetStart: c.lineStart, targetEnd: c.lineEnd })}</div>`
        : `<div class="hunk-empty">No diff context available for ${escapeHtml(c.filepath)}:${lineRange}</div>`;

    const suggestionHtml =
      c.suggestedCode && c.originalLines && c.originalLines.length
        ? `<div class="suggestion">
             <div class="suggestion-header"><span>Suggested change</span><span class="muted">${escapeHtml(c.filepath)}:${lineRange}</span></div>
             ${renderSuggestionDiff(c.originalLines, c.suggestedCode, c.lineStart)}
           </div>`
        : c.suggestedCode
          ? `<div class="suggestion">
             <div class="suggestion-header"><span>Suggested change</span></div>
             <div class="suggestion-diff hunk">${String(c.suggestedCode)
               .split("\n")
               .map(
                 (t, i) =>
                   `<div class="hunk-row add"><div class="lineno mono">${(c.lineStart || 1) + i}</div><div class="code mono">${escapeHtml("+" + t)}</div></div>`,
               )
               .join("")}</div>
           </div>`
          : "";

    div.innerHTML = `
      <div class="file-header">
        <div class="path"><a href="${vscodeUrl}">${escapeHtml(c.filepath)}:${lineRange}</a></div>
        <div class="severity-row">
          ${c.category ? `<span class="category">${escapeHtml(c.category)}</span>` : ""}
          <span class="severity ${sev}">${escapeHtml(sev)}</span>
        </div>
      </div>
      ${hunkHtml}
      <div class="comment-block">
        <div class="comment-head">
          <span class="avatar">${escapeHtml(initials(author))}</span>
          <span class="author">${escapeHtml(author)}</span>
          <span class="handle">${escapeHtml(c.id)}</span>
        </div>
        <p class="comment-message">${escapeHtml(c.message)}</p>
        ${suggestionHtml}
      </div>
      <div class="replies"></div>
      <div class="actions">
        <button class="btn js-resolve">${c.resolved ? "Reopen thread" : "Resolve thread"}</button>
        <button class="btn ghost js-reply-toggle">Reply</button>
      </div>
      <div class="reply-form">
        <textarea placeholder="Reply…"></textarea>
        <div class="row">
          <button class="btn ghost js-reply-cancel">Cancel</button>
          <button class="btn primary js-reply-submit">Send</button>
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
    const form = div.querySelector(".reply-form");
    div.querySelector(".js-reply-toggle").addEventListener("click", () => {
      form.classList.toggle("open");
      if (form.classList.contains("open")) form.querySelector("textarea").focus();
    });
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
          <div class="row">
            <div><span class="k">branch</span><strong>${escapeHtml(r.branch)}</strong></div>
            <div><span class="k">base</span>${escapeHtml(r.baseBranch)}</div>
            <div><span class="k">commit</span><span class="mono">${escapeHtml(r.commit)}</span></div>
            <div><span class="k">created</span>${fmtTime(r.createdAt)}</div>
            <div><span class="k">comments</span>${open} open / ${r.comments.length} total</div>
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

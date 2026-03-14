function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyInline(text: string): string {
  // Split on inline code spans first to protect their content.
  const parts: string[] = [];
  const codeRe = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) parts.push(processInlineText(text.slice(last, m.index)));
    parts.push(`<code>${escapeHtml(m[1])}</code>`);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(processInlineText(text.slice(last)));

  return parts.join("");
}

function processInlineText(text: string): string {
  let t = escapeHtml(text);
  // Bold + italic
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  t = t.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  // Links
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

function parseTableRow(row: string): string[] {
  return row.split("|").slice(1, -1).map((cell) => applyInline(cell.trim()));
}

function isSeparatorRow(row: string): boolean {
  return /^\|[\s:|:-]+\|/.test(row);
}

export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];

  let inCode = false;
  let codeLang = "";
  const codeAccum: string[] = [];

  let listType: "ul" | "ol" | null = null;
  let listDepth = 0;
  const listItems: string[] = [];

  function flushList() {
    if (!listType || listItems.length === 0) return;
    const tag = listType === "ul" ? "ul" : "ol";
    html.push(
      `<${tag}>${listItems.map((li) => `<li>${li}</li>`).join("")}</${tag}>`,
    );
    listType = null;
    listDepth = 0;
    listItems.length = 0;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Inside a fenced code block ──────────────────────────────────────────
    if (inCode) {
      if (line.startsWith("```")) {
        html.push(
          `<pre><code class="lang-${escapeHtml(codeLang)}">${codeAccum.join("\n")}</code></pre>`,
        );
        inCode = false;
        codeAccum.length = 0;
        codeLang = "";
      } else {
        codeAccum.push(escapeHtml(line));
      }
      continue;
    }

    // ── Fenced code block open ──────────────────────────────────────────────
    if (line.startsWith("```")) {
      flushList();
      codeLang = line.slice(3).trim();
      inCode = true;
      continue;
    }

    // ── Heading ─────────────────────────────────────────────────────────────
    const hm = line.match(/^(#{1,6}) (.+)$/);
    if (hm) {
      flushList();
      const level = hm[1].length;
      const raw = hm[2];
      const id = raw
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      html.push(`<h${level} id="${id}">${applyInline(raw)}</h${level}>`);
      continue;
    }

    // ── Horizontal rule ─────────────────────────────────────────────────────
    if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
      flushList();
      html.push("<hr>");
      continue;
    }

    // ── Blockquote ──────────────────────────────────────────────────────────
    if (line.startsWith("> ") || line === ">") {
      flushList();
      html.push(
        `<blockquote><p>${applyInline(line.slice(2))}</p></blockquote>`,
      );
      continue;
    }

    // ── Table ────────────────────────────────────────────────────────────────
    if (line.startsWith("|")) {
      flushList();
      const tableLines: string[] = [line];
      while (i + 1 < lines.length && lines[i + 1].startsWith("|")) {
        i++;
        tableLines.push(lines[i]);
      }
      const dataRows = tableLines.filter((r) => !isSeparatorRow(r));
      const [header, ...body] = dataRows;
      if (header) {
        const headerHtml = parseTableRow(header)
          .map((c) => `<th>${c}</th>`)
          .join("");
        const bodyHtml = body
          .map(
            (r) =>
              `<tr>${parseTableRow(r)
                .map((c) => `<td>${c}</td>`)
                .join("")}</tr>`,
          )
          .join("");
        html.push(
          `<div class="archTableWrap"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
        );
      }
      continue;
    }

    // ── Unordered list ───────────────────────────────────────────────────────
    const ulm = line.match(/^(\s*)[-*] (.+)$/);
    if (ulm) {
      const depth = ulm[1].length;
      if (listType !== "ul" || depth !== listDepth) {
        flushList();
        listType = "ul";
        listDepth = depth;
      }
      listItems.push(applyInline(ulm[2]));
      continue;
    }

    // ── Ordered list ─────────────────────────────────────────────────────────
    const olm = line.match(/^(\s*)\d+\. (.+)$/);
    if (olm) {
      const depth = olm[1].length;
      if (listType !== "ol" || depth !== listDepth) {
        flushList();
        listType = "ol";
        listDepth = depth;
      }
      listItems.push(applyInline(olm[2]));
      continue;
    }

    // ── Empty line ───────────────────────────────────────────────────────────
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // ── Paragraph ────────────────────────────────────────────────────────────
    flushList();
    html.push(`<p>${applyInline(line)}</p>`);
  }

  flushList();
  if (inCode) {
    html.push(`<pre><code>${codeAccum.join("\n")}</code></pre>`);
  }

  return html.join("\n");
}

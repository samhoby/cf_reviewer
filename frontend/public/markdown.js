// Tiny, safe Markdown renderer: escapes all HTML first, then adds a few tags.
// Supports code fences, headings, lists, bold, italics, inline code, paragraphs.
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escapes the five HTML-special characters. */
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Formats inline Markdown (code, bold, italics) on one line of text. */
function inline(text) {
  // Split out `code` spans so they aren't formatted.
  return text
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : escapeHtml(part)
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<em>$2</em>"),
    )
    .join("");
}

/** Renders Markdown to safe HTML (all input is escaped first). */
export function renderMarkdown(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(/^\s*```/);
    if (fence) {
      flushPara(); closeList();
      const buf = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara(); closeList();
      const level = Math.min(heading[1].length + 1, 6); // h1 -> h2 to fit the panel
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const item = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      flushPara();
      const type = /\d/.test(item[1]) ? "ol" : "ul";
      if (list !== type) {
        closeList();
        const start = type === "ol" ? parseInt(item[1], 10) : 1;
        out.push(start > 1 ? `<ol start="${start}">` : `<${type}>`); // keep numbering after a split
        list = type;
      }
      out.push(`<li>${inline(item[2])}</li>`);
      continue;
    }

    if (!line.trim()) { flushPara(); closeList(); continue; }

    closeList();
    para.push(line.trim());
  }
  flushPara(); closeList();
  return out.join("");
}


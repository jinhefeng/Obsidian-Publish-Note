function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSourcePath(value) {
  return value
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\.md$/i, "")
    .toLowerCase();
}

function basename(value) {
  return value.replaceAll("\\", "/").split("/").pop() || value;
}

function sourcePathVariants(value) {
  const normalized = value.replaceAll("\\", "/");
  return [...new Set([normalizeSourcePath(normalized), normalizeSourcePath(basename(normalized))])];
}

function pageSlug(value) {
  return normalizeSourcePath(value)
    .replace(/[^a-z0-9/_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "") || "index";
}

function encodePath(value) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function isExternalUrl(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value.trim());
}

function isExternalReference(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("#") || isExternalUrl(trimmed);
}

function relativeHref(fromPagePath, targetPagePath) {
  const fromParts = fromPagePath.split("/");
  fromParts.pop();
  const targetParts = targetPagePath.split("/");
  let common = 0;
  while (common < fromParts.length && common < targetParts.length && fromParts[common] === targetParts[common]) {
    common += 1;
  }
  const prefix = "../".repeat(fromParts.length - common) || "./";
  return `${prefix}${encodePath(targetParts.slice(common).join("/")) || "index.html"}`;
}

function resolveRelativeSourcePath(target, currentSourcePath) {
  let normalized = target.replaceAll("\\", "/");
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep malformed or partially encoded paths for the normal lookup fallback.
  }
  if (!currentSourcePath || !/^\.\.?\//.test(normalized)) return normalized;
  const parts = currentSourcePath.replaceAll("\\", "/").split("/");
  parts.pop();
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function resolvePageHref(target, context) {
  if (isExternalReference(target)) return target.trim();
  const [rawTarget, rawAnchor] = target.split("#", 2);
  const resolvedTarget = resolveRelativeSourcePath(rawTarget, context.currentSourcePath);
  const targetKey = normalizeSourcePath(resolvedTarget);
  const mappedPath = context.pagePaths?.get(targetKey)
    || [...(context.pagePaths?.entries() || [])].find(([key]) => key.endsWith(`/${targetKey}`))?.[1];
  if (context.pagePaths && !mappedPath) return undefined;
  const pagePath = mappedPath || `${pageSlug(resolvedTarget)}.html`;
  const href = context.currentPagePath ? relativeHref(context.currentPagePath, pagePath) : `./${encodePath(pagePath)}`;
  return rawAnchor ? `${href}#${encodeURIComponent(rawAnchor)}` : href;
}

function resolveMarkdownLinkHref(href, context) {
  const trimmed = href.trim();
  if (isExternalReference(trimmed) || !/\.md(?:#|$)/i.test(trimmed)) return trimmed;
  return resolvePageHref(trimmed.replace(/\.md(?=#|$)/i, ""), context);
}

function resolveAssetPath(sourcePath, context) {
  if (isExternalUrl(sourcePath)) return sourcePath;
  const assetPath = sourcePathVariants(sourcePath).map((key) => context.assetPaths?.get(key)).find(Boolean);
  if (assetPath) return context.currentPagePath ? relativeHref(context.currentPagePath, assetPath) : `./${encodePath(assetPath)}`;
  return `./${encodePath(`assets/${basename(sourcePath)}`)}`;
}

function splitTableRow(line) {
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return value.split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll("\\|", "|"));
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function inlineMarkdown(value, context) {
  let html = escapeHtml(value);
  html = html.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, sourcePath, alt) => {
    const resolved = resolveAssetPath(sourcePath.trim(), context);
    return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml((alt || basename(sourcePath)).trim())}">`;
  });
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, sourcePath) => {
    const resolved = resolveAssetPath(sourcePath.trim(), context);
    return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}">`;
  });
  html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const text = (label || target).trim();
    const href = resolvePageHref(target.trim(), context);
    return href
      ? `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
      : `<span class="internal-link-unpublished" title="Linked page is not included">${escapeHtml(text)}</span>`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const resolvedHref = resolveMarkdownLinkHref(href, context);
    return resolvedHref
      ? `<a href="${escapeHtml(resolvedHref)}">${label}</a>`
      : `<span class="internal-link-unpublished" title="Linked page is not included">${label}</span>`;
  });
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  return html;
}

function renderTable(lines, context) {
  const header = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow);
  const headerHtml = header.map((cell) => `<th>${inlineMarkdown(cell, context)}</th>`).join("");
  const rowsHtml = rows.map((row) => {
    const cells = header.map((_cell, index) => `<td>${inlineMarkdown(row[index] || "", context)}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("\n");
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function renderList(lines, context) {
  const ordered = /^\s*\d+[.)]\s+/.test(lines[0]);
  const tag = ordered ? "ol" : "ul";
  const items = lines.map((line) => {
    const match = ordered ? /^\s*\d+[.)]\s+(.+)$/.exec(line) : /^\s*[-+*]\s+(.+)$/.exec(line);
    const value = match?.[1] || line.trim();
    const task = /^\[([ xX])\]\s+(.+)$/.exec(value);
    if (!task) return `<li>${inlineMarkdown(value, context)}</li>`;
    const checked = task[1].toLowerCase() === "x" ? " checked" : "";
    return `<li class="task-list-item"><input type="checkbox" disabled${checked}> ${inlineMarkdown(task[2], context)}</li>`;
  }).join("\n");
  return `<${tag}>${items}</${tag}>`;
}

function renderCallout(lines, context) {
  const first = /^>\s*\[!([^\]]+)\]\s*(.*)$/.exec(lines[0]);
  if (!first) return "";
  const kind = first[1].trim().toLowerCase();
  const title = first[2].trim() || first[1].trim();
  const content = lines.slice(1).map((line) => line.replace(/^>\s?/, "")).join("\n");
  return `<aside class="callout callout-${escapeHtml(kind)}"><div class="callout-title">${escapeHtml(title)}</div><div class="callout-content">${renderMarkdown(content, context)}</div></aside>`;
}

function renderHeadingSection(section) {
  const content = section.items.map((item) => typeof item === "string" ? item : renderHeadingSection(item)).join("\n");
  return `<details class="heading-section heading-level-${section.level}" open><summary>${section.heading}</summary>${content}</details>`;
}

function wrapHeadingSections(blocks) {
  const roots = [];
  const stack = [];
  for (const block of blocks) {
    const heading = /^<h([1-6])(?:\s[^>]*)?>[\s\S]*<\/h\1>$/.exec(block.trim());
    if (!heading) {
      (stack.at(-1)?.items || roots).push(block);
      continue;
    }
    const section = { level: Number(heading[1]), heading: block.trim(), items: [] };
    while (stack.length > 0 && stack.at(-1).level >= section.level) stack.pop();
    (stack.at(-1)?.items || roots).push(section);
    stack.push(section);
  }
  return roots.map((item) => typeof item === "string" ? item : renderHeadingSection(item)).join("\n");
}

function renderMarkdown(markdown, context = {}) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let index = 0;
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${inlineMarkdown(paragraph.join(" "), context)}</p>`);
      paragraph = [];
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("```")) {
      flushParagraph();
      const language = line.slice(3).trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const className = language ? ` class="language-${escapeHtml(language)}"` : "";
      blocks.push(`<pre><code${className}>${escapeHtml(codeLines.join("\n"))}</code><button type="button" class="copy-code-button" aria-label="Copy code">Copy</button></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2], context)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s*\[![^\]]+\]/.test(line)) {
      flushParagraph();
      const calloutLines = [line];
      index += 1;
      while (index < lines.length && /^>/.test(lines[index])) {
        calloutLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderCallout(calloutLines, context));
      continue;
    }

    if (/^>/.test(line)) {
      flushParagraph();
      const quoteLines = [];
      while (index < lines.length && /^>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${renderMarkdown(quoteLines.join("\n"), context)}</blockquote>`);
      continue;
    }

    if (index + 1 < lines.length && line.includes("|") && isTableSeparator(lines[index + 1])) {
      flushParagraph();
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(tableLines, context));
      continue;
    }

    if (/^\s*(?:[-+*]\s+|\d+[.)]\s+)/.test(line)) {
      flushParagraph();
      const listLines = [];
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-+*]\s+/;
      while (index < lines.length && pattern.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderList(listLines, context));
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }

  flushParagraph();
  return wrapHeadingSections(blocks);
}

function defaultAssetPath(sourcePath) {
  return `assets/${basename(sourcePath).replace(/[^a-z0-9._-]+/gi, "-")}`;
}

function pageHtml(title, body, navigation = "") {
  return `<!doctype html>
<html lang="en" class="share-publisher-page">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>html.share-publisher-page,body.share-publisher-page{width:auto!important;min-width:0;height:auto!important;min-height:100%;overflow:visible!important;contain:initial!important}body.share-publisher-page{display:block!important;position:static!important;user-select:text!important;max-width:54rem;margin:3rem auto;padding:0 1.25rem;font:16px/1.65 system-ui,sans-serif;color:#202124;background:#fff}main.markdown-rendered{min-width:0}.page-title{margin:0 0 2rem;border-bottom:1px solid #e5e5e7;padding-bottom:.75rem}.page-title h1{margin:0}.heading-section>summary{cursor:pointer}.heading-section>summary::marker{color:#888}img,video,svg{max-width:100%;height:auto}pre{padding:1rem;overflow:auto;background:#f4f4f5;border-radius:.5rem}code{font-family:ui-monospace,monospace}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #d7d7dc;padding:.5rem;text-align:left}th{background:#f4f4f5}blockquote{margin:1rem 0;padding:.25rem 1rem;border-left:4px solid #c7c7cc;background:#fafafa}.callout{margin:1rem 0;padding:1rem;border:1px solid #d7d7dc;border-radius:.5rem;background:#fafafa}.callout-title{font-weight:700;margin-bottom:.35rem}.callout-note,.callout-tip{border-color:#82b1ff;background:#f4f8ff}.callout-warning,.callout-caution{border-color:#e5b84b;background:#fff9e6}.task-list-item{list-style:none;margin-left:-1.5rem}</style>
    <style>.heading-section>summary{cursor:pointer;list-style:none;position:relative}.heading-section>summary::-webkit-details-marker{display:none}.heading-section>summary::marker{content:""}.heading-section>summary::before{content:"";position:absolute;inset-inline-start:-1.1em;inset-block-start:50%;width:0;height:0;border-block:.35em solid transparent;border-inline-start:.5em solid #888;opacity:0;transform:translateY(-50%);transition:opacity .12s ease,transform .12s ease}.heading-section>summary:hover::before,.heading-section>summary:focus-visible::before{opacity:1}.heading-section[open]>summary::before{transform:translateY(-50%) rotate(90deg)}.copy-code-button{position:absolute;inset-block-start:.5rem;inset-inline-end:.5rem;cursor:pointer}.copy-code-button.is-copied{color:#7c3aed}pre{position:relative}</style>
  </head>
    <body class="share-publisher-page">
      <main class="markdown-rendered">
        <header class="page-title"><h1>${escapeHtml(title)}</h1></header>
${navigation}${body}
      <script>
document.addEventListener("click", async (event) => {
  const button = event.target instanceof Element ? event.target.closest(".copy-code-button") : null;
  if (!button) return;
  const code = button.closest("pre")?.querySelector("code");
  if (!code) return;
  const text = code.textContent || "";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  const previousLabel = button.getAttribute("aria-label") || "Copy code";
  button.setAttribute("aria-label", "Copied");
  button.classList.add("is-copied");
  window.setTimeout(() => {
    button.setAttribute("aria-label", previousLabel);
    button.classList.remove("is-copied");
  }, 1200);
});
      </script>
      </main>
  </body>
</html>`;
}

function compareSourcePaths(left, right) {
  const leftKey = normalizeSourcePath(left.sourcePath);
  const rightKey = normalizeSourcePath(right.sourcePath);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : left.sourcePath < right.sourcePath ? -1 : left.sourcePath > right.sourcePath ? 1 : 0;
}

function shareNotes(input) {
  const rootKey = normalizeSourcePath(input.root.sourcePath);
  const related = new Map();
  for (const note of input.relatedNotes || []) {
    const key = normalizeSourcePath(note.sourcePath);
    if (key !== rootKey && !related.has(key)) related.set(key, note);
  }
  return [input.root, ...[...related.values()].sort(compareSourcePaths)];
}

function relatedPagePath(index) {
  return `page-${index}.html`;
}

function compileShare(input) {
  const notes = shareNotes(input);
  const pagePaths = new Map(notes.map((note, index) => [sourceKey(note.sourcePath), index === 0 ? "index.html" : relatedPagePath(index)]));
  const allAssets = notes.flatMap((note) => note.assets || []);
  const assets = allAssets.map((asset) => ({
    path: asset.path || defaultAssetPath(asset.sourcePath),
    contentType: asset.contentType,
    body: asset.body,
    encoding: asset.encoding,
  }));
  const assetPaths = new Map();
  allAssets.forEach((asset, index) => {
    const normalized = asset.sourcePath.replaceAll("\\", "/");
    assetPaths.set(normalizeSourcePath(normalized), assets[index].path);
    assetPaths.set(normalizeSourcePath(basename(normalized)), assets[index].path);
  });
  const pages = notes.map((note, index) => {
    const pagePath = pagePaths.get(normalizeSourcePath(note.sourcePath)) || (index === 0 ? "index.html" : relatedPagePath(index));
    const title = note.title?.trim() || basename(note.sourcePath).replace(/\.md$/i, "") || "Untitled";
    return { path: pagePath, contentType: "text/html", body: pageHtml(title, renderMarkdown(note.markdown, { currentPagePath: pagePath, currentSourcePath: note.sourcePath, pagePaths, assetPaths })), encoding: "utf8" };
  });
  return {
    formatVersion: 1,
    sourcePath: input.root.sourcePath,
    title: input.root.title?.trim() || basename(input.root.sourcePath).replace(/\.md$/i, "") || "Untitled",
    pages,
    assets,
  };
}

function compileNote(input) {
  return compileShare({ root: input });
}

module.exports = { compileNote, compileShare };

const { Plugin, Notice, PluginSettingTab, Setting, requestUrl, openExternal, MarkdownRenderer, Component } = require("obsidian");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sourceKey(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "").replace(/\.md$/i, "").toLowerCase();
}

function requestErrorDetail(response) {
  const raw = String(response?.text || response?.body || response?.response?.text || response?.responseText || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.error || parsed?.message || raw);
  } catch {
    return raw;
  }
}

const DEFAULT_UPLOAD_CHUNK_CHARACTERS = 1_000_000;

function normalizeLinkedPageDepth(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function shouldFollowLinkedPage(depth, maxDepth) {
  return maxDepth > 0 && depth < maxDepth;
}

function splitUploadText(value, maxCharacters = DEFAULT_UPLOAD_CHUNK_CHARACTERS) {
  const chunks = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + maxCharacters);
    if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1] || "")) {
      end = end - 1 > start ? end - 1 : Math.min(value.length, end + 1);
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks.length > 0 ? chunks : [""];
}

function createUploadChunks(bundle, maxCharacters = DEFAULT_UPLOAD_CHUNK_CHARACTERS) {
  if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) throw new Error("Upload chunk size must be a positive integer");
  const objects = [
    ...bundle.pages.map((page) => ({ kind: "page", ...page })),
    ...bundle.assets.map((asset) => ({ kind: "asset", ...asset })),
  ];
  return objects.flatMap((object) => {
    const bodies = splitUploadText(object.body, maxCharacters);
    return bodies.map((body, chunkIndex) => ({
      kind: object.kind,
      path: object.path,
      contentType: object.contentType,
      encoding: object.encoding,
      chunkIndex,
      chunkCount: bodies.length,
      body,
    }));
  });
}

function pageSlug(value) {
  return sourceKey(value).replace(/[^a-z0-9/_-]+/gi, "-").replace(/-+/g, "-").replace(/^[-/]+|[-/]+$/g, "") || "index";
}

function encodePath(value) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
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

function resolvePageHref(target, context = {}) {
  const [rawTarget, rawAnchor] = target.split("#", 2);
  const resolvedTarget = resolveRelativeSourcePath(rawTarget, context.currentSourcePath);
  const targetKey = sourceKey(resolvedTarget);
  const mappedPath = context.pagePaths?.get(targetKey)
    || [...(context.pagePaths?.entries() || [])].find(([key]) => key.endsWith(`/${targetKey}`))?.[1];
  if (context.pagePaths && !mappedPath) return undefined;
  const pagePath = mappedPath || `${pageSlug(resolvedTarget)}.html`;
  const href = context.currentPagePath ? relativeHref(context.currentPagePath, pagePath) : `./${encodePath(pagePath)}`;
  return rawAnchor ? `${href}#${encodeURIComponent(rawAnchor)}` : href;
}

function resolveMarkdownLinkHref(href, context = {}) {
  const trimmed = href.trim();
  if (!/\.md(?:#|$)/i.test(trimmed)) return trimmed;
  return resolvePageHref(trimmed.replace(/\.md(?=#|$)/i, ""), context);
}

function resolveAssetPath(sourcePath, context = {}) {
  if (/^(?:[a-z]+:)?\/\//i.test(sourcePath) || sourcePath.startsWith("data:")) return sourcePath;
  const normalized = sourcePath.replaceAll("\\", "/");
  const assetKeys = [sourceKey(normalized), sourceKey(normalized.split("/").pop() || normalized)];
  const assetPath = assetKeys.map((key) => context.assetPaths?.get(key)).find(Boolean);
  if (assetPath) return context.currentPagePath ? relativeHref(context.currentPagePath, assetPath) : `./${encodePath(assetPath)}`;
  const name = sourcePath.replaceAll("\\", "/").split("/").pop() || sourcePath;
  return `./${encodePath(`assets/${name}`)}`;
}

function splitTableRow(line) {
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return value.split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll("\\|", "|"));
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function inlineMarkdown(value, context = {}) {
  let html = escapeHtml(value);
  html = html.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, sourcePath, alt) => `<img src="${escapeHtml(resolveAssetPath(sourcePath.trim(), context))}" alt="${escapeHtml((alt || sourcePath).trim())}">`);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, sourcePath) => `<img src="${escapeHtml(resolveAssetPath(sourcePath.trim(), context))}" alt="${escapeHtml(alt)}">`);
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

function renderTable(lines, context = {}) {
  const header = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow);
  const headerHtml = header.map((cell) => `<th>${inlineMarkdown(cell, context)}</th>`).join("");
  const rowsHtml = rows.map((row) => `<tr>${header.map((_cell, index) => `<td>${inlineMarkdown(row[index] || "", context)}</td>`).join("")}</tr>`).join("\n");
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function renderCallout(lines, context = {}) {
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

function renderList(lines, context = {}) {
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
  const name = sourcePath.replaceAll("\\", "/").split("/").pop() || sourcePath;
  return `assets/${name.replace(/[^a-z0-9._-]+/gi, "-")}`;
}

function extractAssetReferences(markdown) {
  const references = [];
  for (const match of markdown.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) references.push(match[1]);
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) references.push(match[1]);
  return [...new Set(references)];
}

function mimeTypeFor(extension) {
  const types = {
    avif: "image/avif",
    css: "text/css",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    md: "text/markdown",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    txt: "text/plain",
    webm: "video/webm",
    webp: "image/webp",
  };
  return types[String(extension || "").toLowerCase()] || "application/octet-stream";
}

function sanitizeSnapshotClasses(value) {
  const layoutClasses = new Set([
    "app-container",
    "obsidian-app",
    "is-frameless",
    "is-hidden-frameless",
    "is-maximized",
    "is-focused",
    "is-translucent",
    "is-floating-nav",
    "auto-full-screen",
    "show-ribbon",
    "show-view-header",
    "mod-macos",
    "mod-windows",
    "mod-linux",
  ]);
  return String(value || "").split(/\s+/).filter((className) => className && !layoutClasses.has(className)).join(" ");
}

function pageHtml(title, body, navigation = "", options = {}) {
  const pagePath = options.pagePath || "index.html";
  const stylesheetHref = options.stylesheetPath ? relativeHref(pagePath, options.stylesheetPath) : "";
  const htmlClasses = ["share-publisher-page", sanitizeSnapshotClasses(options.htmlClass)].filter(Boolean).join(" ");
  const bodyClasses = ["share-publisher-page", sanitizeSnapshotClasses(options.bodyClass)].filter(Boolean).join(" ");
  const htmlClass = ` class="${escapeHtml(htmlClasses)}"`;
  const bodyClass = ` class="${escapeHtml(bodyClasses)}"`;
  return `<!doctype html>
<html lang="en"${htmlClass}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    ${stylesheetHref ? `<link rel="stylesheet" href="${escapeHtml(stylesheetHref)}">` : ""}
    <style>html.share-publisher-page,body.share-publisher-page{width:auto!important;min-width:0;height:auto!important;min-height:100%;overflow:visible!important;contain:initial!important}body.share-publisher-page{display:block!important;position:static!important;user-select:text!important;max-width:54rem;margin:3rem auto;padding:0 1.25rem;font:16px/1.65 var(--font-text,system-ui,sans-serif);font-size:var(--font-text-size,16px);color:var(--text-normal,#202124);background:var(--background-primary,#fff)}main.markdown-rendered{min-width:0}.page-title{margin:0 0 2rem;border-bottom:1px solid var(--background-modifier-border,#e5e5e7);padding-bottom:.75rem}.page-title h1{margin:0}.heading-section>summary{cursor:pointer;list-style:none;position:relative}.heading-section>summary::-webkit-details-marker{display:none}.heading-section>summary::marker{content:""}.heading-section>summary::before{content:"";position:absolute;inset-inline-start:-1.1em;inset-block-start:50%;width:0;height:0;border-block:.35em solid transparent;border-inline-start:.5em solid var(--text-muted,#888);opacity:0;transform:translateY(-50%);transition:opacity .12s ease,transform .12s ease}.heading-section>summary:hover::before,.heading-section>summary:focus-visible::before{opacity:1}.heading-section[open]>summary::before{transform:translateY(-50%) rotate(90deg)}.copy-code-button{cursor:pointer}.copy-code-button.is-copied{color:var(--text-accent,#7c3aed)}img,video,svg{max-width:100%;height:auto}nav{padding:.75rem 1rem;margin-bottom:2rem;background:var(--background-secondary,#f7f7f8);border-radius:.5rem}nav ul{margin:.35rem 0 0;padding-left:1.2rem}pre{position:relative;padding:1rem;overflow:auto;background:var(--code-background,#f4f4f5);border-radius:.5rem}code{font-family:var(--font-monospace,ui-monospace,monospace)}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid var(--background-modifier-border,#d7d7dc);padding:.5rem;text-align:left}th{background:var(--background-secondary,#f4f4f5)}blockquote{margin:1rem 0;padding:.25rem 1rem;border-left:4px solid var(--interactive-accent,#c7c7cc);background:var(--background-secondary,#fafafa)}.callout{margin:1rem 0;padding:1rem;border:1px solid var(--background-modifier-border,#d7d7dc);border-radius:.5rem;background:var(--background-secondary,#fafafa)}.callout-title{font-weight:700;margin-bottom:.35rem}.callout-content{margin-top:.35rem}.callout-note,.callout-tip{border-color:#82b1ff;background:#f4f8ff}.callout-warning,.callout-caution{border-color:#e5b84b;background:#fff9e6}.task-list-item{list-style:none;margin-left:-1.5rem}.task-list-item-checkbox{margin-right:.4rem}</style>
    <style>.copy-code-button{position:absolute;inset-block-start:.5rem;inset-inline-end:.5rem}</style>
  </head>
    <body${bodyClass}>
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
  const leftKey = sourceKey(left.sourcePath);
  const rightKey = sourceKey(right.sourcePath);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : left.sourcePath < right.sourcePath ? -1 : left.sourcePath > right.sourcePath ? 1 : 0;
}

function shareNotes(input) {
  const rootKey = sourceKey(input.root.sourcePath);
  const related = new Map();
  for (const note of input.relatedNotes || []) {
    const key = sourceKey(note.sourcePath);
    if (key !== rootKey && !related.has(key)) related.set(key, note);
  }
  return [input.root, ...[...related.values()].sort(compareSourcePaths)];
}

function relatedPagePath(index) {
  return `page-${index}.html`;
}

function buildAssetPathMap(inputs) {
  const assetPaths = new Map();
  for (const asset of inputs || []) {
    const path = asset.path || defaultAssetPath(asset.sourcePath);
    const normalized = asset.sourcePath.replaceAll("\\", "/");
    assetPaths.set(sourceKey(normalized), path);
    assetPaths.set(sourceKey(normalized.split("/").pop() || normalized), path);
  }
  return assetPaths;
}

function renderedPath(value) {
  if (!value) return "";
  let result = value;
  try {
    result = decodeURIComponent(value);
  } catch {
    // Keep the original URL when a plugin emits an incomplete percent escape.
  }
  result = result.replace(/^[a-z]+:\/\/[^/]+\/?/i, "");
  return result.replace(/^\/+/, "");
}

function codeBlockSources(markdown, language) {
  const sources = [];
  const fence = "```";
  const pattern = new RegExp(`^${fence}${language}\\s*\\n([\\s\\S]*?)^${fence}\\s*$`, "gim");
  for (const match of markdown.matchAll(pattern)) sources.push(match[1].trim());
  return sources;
}

function dynamicLanguages(markdown) {
  const languages = [];
  for (const match of markdown.matchAll(/^```([^\s`]+)?/gm)) {
    const language = String(match[1] || "").toLowerCase();
    if (language && !["js", "javascript", "ts", "typescript", "css", "html", "json", "yaml", "md", "markdown", "text"].includes(language)) {
      languages.push(language);
    }
  }
  return [...new Set(languages)];
}

async function waitForDynamicBlocks(container, markdown) {
  const languages = dynamicLanguages(markdown);
  if (languages.length === 0) return;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const settled = languages.every((language) => [...container.querySelectorAll(`.block-language-${language}`)].every((block) => block.children.length > 0 || block.textContent.trim().length > 0));
    if (settled) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function parseTaskLines(markdown) {
  const tasks = [];
  let fenced = false;
  for (const line of markdown.replaceAll("\r\n", "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(\s*)[-+*]\s+\[([^\]])\]\s+(.+)$/.exec(line);
    if (!match) continue;
    tasks.push({
      indent: match[1].length,
      status: match[2],
      description: match[3].trim(),
    });
  }
  return tasks;
}

function taskQueryLimit(query) {
  const match = /(?:^|\n)\s*limit\s+(\d+)/i.exec(query);
  return Math.max(1, Math.min(Number(match?.[1] || 500), 2000));
}

function filterTaskSnapshot(tasks, query) {
  const normalized = query.toLowerCase();
  const wantsNotDone = /\bnot\s+done\b/.test(normalized);
  const wantsDone = !wantsNotDone && /\bdone\b/.test(normalized);
  return tasks.filter((task) => {
    const done = /^[x✓✔]$/i.test(task.status);
    if (wantsNotDone && done) return false;
    if (wantsDone && !done) return false;
    const pathFilter = /(?:path|file)\s+includes\s+(.+)/i.exec(query);
    if (pathFilter && !task.sourcePath.toLowerCase().includes(pathFilter[1].trim().toLowerCase())) return false;
    return true;
  });
}

async function collectVaultTaskSnapshot(plugin) {
  const files = plugin.app.vault.getMarkdownFiles();
  const tasks = [];
  for (const file of files) {
    const markdown = await plugin.app.vault.cachedRead(file);
    for (const task of parseTaskLines(markdown)) tasks.push({ ...task, sourcePath: file.path });
  }
  return tasks;
}

async function renderTasksSnapshot(plugin, query, context) {
  const tasks = filterTaskSnapshot(await collectVaultTaskSnapshot(plugin), query).slice(0, taskQueryLimit(query));
  if (tasks.length === 0) return `<p class="tasks-query-empty">No tasks found.</p>`;
  const items = tasks.map((task) => {
    const checked = /^[x✓✔]$/i.test(task.status) ? " checked" : "";
    const indent = Math.min(task.indent, 8);
    return `<li class="task-list-item tasks-query-item" style="margin-left:${indent * 1.25}rem"><input type="checkbox" disabled${checked}> ${renderMarkdown(task.description, context)}</li>`;
  }).join("\n");
  return `<ul class="contains-task-list tasks-query-snapshot">${items}</ul>`;
}

async function fillEmptyTasksBlocks(plugin, container, markdown, context) {
  const queries = codeBlockSources(markdown, "tasks");
  const blocks = [...container.querySelectorAll(".block-language-tasks")];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.children.length > 0 || block.textContent.trim().length > 0) continue;
    block.innerHTML = await renderTasksSnapshot(plugin, queries[index] || "", context);
  }
}

function resolveRenderedAsset(element, context) {
  const candidates = [element.getAttribute("data-src"), element.getAttribute("src")].filter(Boolean);
  for (const candidate of candidates) {
    const clean = renderedPath(candidate.split("#", 1)[0].split("?", 1)[0]);
    const keys = [sourceKey(clean), sourceKey(clean.split("/").pop() || clean)];
    const assetPath = keys.map((key) => context.assetPaths?.get(key)).find(Boolean);
    if (assetPath) return context.currentPagePath ? relativeHref(context.currentPagePath, assetPath) : `./${encodePath(assetPath)}`;
  }
  return null;
}

function normalizeNativeSnapshot(container, context) {
  container.querySelectorAll("a.internal-link").forEach((link) => {
    const target = link.getAttribute("data-href") || link.getAttribute("href");
    if (!target || /^(?:[a-z]+:)?\/\//i.test(target) && !/^app:\/\//i.test(target)) return;
    const href = resolvePageHref(renderedPath(target), context);
    if (href) {
      link.setAttribute("href", href);
      return;
    }
    const replacement = document.createElement("span");
    replacement.className = "internal-link-unpublished";
    replacement.title = "Linked page is not included";
    replacement.textContent = link.textContent || renderedPath(target);
    link.replaceWith(replacement);
  });

  container.querySelectorAll("img, audio, video, source").forEach((element) => {
    const assetPath = resolveRenderedAsset(element, context);
    if (assetPath) element.setAttribute("src", assetPath);
  });

  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.setAttribute("disabled", "disabled");
  });

  container.querySelectorAll(".copy-code-button").forEach((button) => {
    button.setAttribute("type", "button");
    if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", "Copy code");
  });

  container.querySelectorAll("script, object, embed").forEach((element) => element.remove());
  container.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on")) element.removeAttribute(attribute.name);
    });
  });
  return container.innerHTML;
}

function makeHeadingsCollapsible(container) {
  const fragment = document.createDocumentFragment();
  const stack = [];
  for (const node of [...container.childNodes]) {
    const tagName = String(node.tagName || "").toLowerCase();
    if (/^h[1-6]$/.test(tagName)) {
      const level = Number(tagName.slice(1));
      while (stack.length > 0 && stack.at(-1).level >= level) stack.pop();
      const details = document.createElement("details");
      details.className = `heading-section heading-level-${level}`;
      details.open = true;
      const summary = document.createElement("summary");
      summary.appendChild(node);
      details.appendChild(summary);
      (stack.at(-1)?.details || fragment).appendChild(details);
      stack.push({ level, details });
      continue;
    }
    (stack.at(-1)?.details || fragment).appendChild(node);
  }
  container.replaceChildren(fragment);
}

function collectDocumentStyles(container) {
  const chunks = [];
  for (const stylesheet of [...document.styleSheets]) {
    try {
      const cssText = [...stylesheet.cssRules].map((rule) => rule.cssText).join("\n");
      if (cssText) chunks.push(cssText);
    } catch {
      // Some platform stylesheets do not expose cssRules; the local page styles remain usable.
    }
  }

  const variables = [];
  try {
    const computed = getComputedStyle(document.body);
    for (let index = 0; index < computed.length; index += 1) {
      const property = computed[index];
      if (!property.startsWith("--")) continue;
      const value = computed.getPropertyValue(property).trim();
      if (value) variables.push(`${property}:${value};`);
    }
  } catch {
    // CSS variables are an enhancement; the captured stylesheets still provide the theme.
  }

  const computedRules = [];
  const computedProperties = [
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "line-height",
    "letter-spacing",
    "color",
    "text-align",
    "text-decoration",
    "text-transform",
    "background-color",
    "border-color",
  ];
  try {
    [...container.querySelectorAll("*")].forEach((element, index) => {
      const computed = getComputedStyle(element);
      const declarations = computedProperties
        .map((property) => `${property}:${computed.getPropertyValue(property)};`)
        .join("");
      element.setAttribute("data-share-computed", String(index));
      computedRules.push(`[data-share-computed="${index}"]{${declarations}}`);
    });
  } catch {
    // Computed typography is an enhancement; the theme stylesheets remain the source of truth.
  }

  let contentStyle = "";
  try {
    const computed = getComputedStyle(container);
    contentStyle = `.markdown-rendered{font-family:${computed.fontFamily};font-size:${computed.fontSize};font-weight:${computed.fontWeight};line-height:${computed.lineHeight};color:${computed.color};}`;
  } catch {
    // The fallback page stylesheet supplies the base typography.
  }

  return {
    css: `:root{${variables.join("")}}\n${chunks.join("\n")}\n${contentStyle}\n${computedRules.join("\n")}`,
    htmlClass: document.documentElement.className || "",
    bodyClass: document.body.className || "",
  };
}

async function renderNativeMarkdown(plugin, markdown, sourcePath, context) {
  if (!MarkdownRenderer?.render || typeof document === "undefined") {
    throw new Error("Obsidian Markdown renderer is unavailable");
  }

  const container = document.createElement("div");
  container.className = "markdown-rendered";
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = "960px";
  container.style.visibility = "hidden";
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);

  const component = new Component();
  component.load();
  try {
    await MarkdownRenderer.render(plugin.app, markdown, container, sourcePath, component);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await waitForDynamicBlocks(container, markdown);
    await fillEmptyTasksBlocks(plugin, container, markdown, context);
    makeHeadingsCollapsible(container);
    return {
      html: normalizeNativeSnapshot(container, context),
      styles: collectDocumentStyles(container),
    };
  } finally {
    component.unload();
    container.remove();
  }
}

async function compileShareWithNative(plugin, input) {
  const fallback = compileShare(input);
  const notes = shareNotes(input);
  const pagePaths = new Map(notes.map((note, index) => [sourceKey(note.sourcePath), index === 0 ? "index.html" : relatedPagePath(index)]));
  const assetPaths = buildAssetPathMap(notes.flatMap((note) => note.assets || []));
  const pages = [];
  let styles;
  for (const [index, note] of notes.entries()) {
    const pagePath = pagePaths.get(sourceKey(note.sourcePath)) || (index === 0 ? "index.html" : relatedPagePath(index));
    const snapshot = await renderNativeMarkdown(plugin, note.markdown, note.sourcePath, {
      currentPagePath: pagePath,
      currentSourcePath: note.sourcePath,
      pagePaths,
      assetPaths,
    });
    styles ||= snapshot.styles;
    const title = note.title?.trim() || note.sourcePath.split(/[\\/]/).pop()?.replace(/\.md$/i, "") || "Untitled";
    pages.push({ path: pagePath, contentType: "text/html", body: pageHtml(title, snapshot.html, "", { pagePath, stylesheetPath: "assets/obsidian-snapshot.css", htmlClass: snapshot.styles.htmlClass, bodyClass: snapshot.styles.bodyClass }), encoding: "utf8" });
  }
  const stylesheetPath = "assets/obsidian-snapshot.css";
  const assets = styles?.css
    ? [...fallback.assets, { path: stylesheetPath, contentType: "text/css", body: styles.css, encoding: "utf8" }]
    : fallback.assets;
  return { ...fallback, pages, assets };
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
    assetPaths.set(sourceKey(normalized), assets[index].path);
    assetPaths.set(sourceKey(normalized.split("/").pop() || normalized), assets[index].path);
  });
  const pages = notes.map((note, index) => {
    const pagePath = pagePaths.get(sourceKey(note.sourcePath)) || (index === 0 ? "index.html" : relatedPagePath(index));
    const title = note.title?.trim() || note.sourcePath.split(/[\\/]/).pop()?.replace(/\.md$/i, "") || "Untitled";
    return { path: pagePath, contentType: "text/html", body: pageHtml(title, renderMarkdown(note.markdown, { currentPagePath: pagePath, currentSourcePath: note.sourcePath, pagePaths, assetPaths })), encoding: "utf8" };
  });
  return {
    formatVersion: 1,
    sourcePath: input.root.sourcePath,
    title: input.root.title?.trim() || input.root.sourcePath.split(/[\\/]/).pop()?.replace(/\.md$/i, "") || "Untitled",
    pages,
    assets,
  };
}

function compileNote(input) {
  return compileShare({ root: input });
}

const DEFAULT_SETTINGS = {
  apiBaseUrl: "http://127.0.0.1:8787",
  publishToken: "dev-token",
  includeLinkedPages: true,
  linkedPageDepth: 1,
  useNativeRenderer: true,
  language: "en",
};

const REPOSITORY_URL = "https://github.com/jinhefeng/Obsidian-Publish-Note";

const COPY = {
  productName: "Publish Note",
  publishNote: "Publish Note",
  openPublishedSite: "Open published site",
  repository: "Project repository",
  open: "Open",
  settingsIntro: "Publish Note turns an Obsidian Markdown note into a shareable website. It keeps the current note as the entry page, can include linked notes, uploads referenced local assets, and copies a stable link after publishing.",
  settingsIntroDetails: "Configure the publishing service and content scope below. Publish from the command palette, the ribbon icon, or a note's context menu.",
  language: "Language",
  languageDescription: "Choose the language used in this settings page.",
  serviceSection: "Publishing service",
  contentSection: "Published content",
  serviceUrl: "Service URL",
  serviceUrlDescription: "URL of the publishing service, for example http://127.0.0.1:8787.",
  accessToken: "Access token",
  accessTokenDescription: "Token used to authenticate with the publishing service; the local default is dev-token.",
  linkedNoteDepth: "Linked note depth",
  linkedNoteDepthDescription: "0 = current note only; 1 = direct links; higher values continue through the link graph.",
  nativeRenderer: "Use Obsidian renderer",
  nativeRendererDescription: "Preserve Obsidian styling and installed Markdown plugin output when publishing.",
  noPublishedLink: "No published link yet. Publish a note first.",
  linkCopied: "Published link copied.",
  linkCopyFailed: "Could not copy the published link.",
  openNote: "Open a Markdown note to publish it.",
  publishFailed: "Could not publish note",
  fallbackRenderer: "Obsidian rendering was unavailable; published with the fallback renderer.",
  cannotReachService: "Cannot reach the publishing service",
  startLocalServer: "Start the local server and try again.",
  uploading: (current, total) => `Uploading ${current}/${total} items...`,
  publishedAndCopied: (url) => `Published and copied link: ${url}`,
  published: (url) => `Published: ${url}`,
};

const COPY_ZH = {
  ...COPY,
  repository: "项目仓库",
  open: "打开",
  settingsIntro: "Publish Note 可以将 Obsidian Markdown 笔记转换为可分享的网站。它会以当前笔记作为入口页面，可携带链接笔记，上传笔记引用的本地资源，并在发布后复制稳定链接。",
  settingsIntroDetails: "请在下面配置发布服务和发布内容范围。你可以从命令面板、功能区图标或笔记右键菜单发起发布。",
  language: "语言",
  languageDescription: "选择设置页面使用的语言。",
  serviceSection: "发布服务",
  contentSection: "发布内容",
  serviceUrl: "服务地址",
  serviceUrlDescription: "发布服务的地址，例如 http://127.0.0.1:8787。",
  accessToken: "访问令牌",
  accessTokenDescription: "用于验证发布服务的令牌；本地默认值为 dev-token。",
  linkedNoteDepth: "链接笔记深度",
  linkedNoteDepthDescription: "0 = 仅发布当前笔记；1 = 包含直接链接；更大的值会继续遍历链接图。",
  nativeRenderer: "使用 Obsidian 渲染器",
  nativeRendererDescription: "发布时保留 Obsidian 样式和已安装 Markdown 插件的输出。",
  noPublishedLink: "还没有已发布链接，请先发布一篇笔记。",
  linkCopied: "已复制发布链接。",
  linkCopyFailed: "无法复制发布链接。",
  openNote: "请先打开一个 Markdown 笔记。",
  publishFailed: "笔记发布失败",
  fallbackRenderer: "Obsidian 原生渲染不可用，已使用备用渲染器发布。",
  cannotReachService: "无法连接发布服务",
  startLocalServer: "请启动本地服务后重试。",
  uploading: (current, total) => `正在上传 ${current}/${total} 个项目...`,
  publishedAndCopied: (url) => `已发布并复制链接：${url}`,
  published: (url) => `已发布：${url}`,
};

function normalizeLanguage(value) {
  return value === "zh" ? "zh" : "en";
}

function copyForLanguage(language) {
  return normalizeLanguage(language) === "zh" ? COPY_ZH : COPY;
}

class SharePublisherPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addCommand({ id: "publish-current-note", name: COPY.publishNote, callback: () => void this.publishCurrentNote() });
    this.addCommand({ id: "open-last-published-site", name: COPY.openPublishedSite, callback: () => this.openLastPublishedSite() });
    this.addRibbonIcon("upload", COPY.publishNote, () => void this.publishCurrentNote());
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file?.extension === "md") {
        menu.addItem((item) => item.setTitle(COPY.publishNote).setIcon("upload").onClick(() => void this.publishFile(file)));
      }
    }));
    this.addSettingTab(new SharePublisherSettingTab(this.app, this));
  }

  async loadSettings() {
    const stored = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    const storedDepth = stored?.linkedPageDepth;
    this.settings.linkedPageDepth = normalizeLinkedPageDepth(
      storedDepth === undefined ? (stored?.includeLinkedPages === false ? 0 : 1) : storedDepth,
    );
    this.settings.includeLinkedPages = this.settings.linkedPageDepth > 0;
    this.settings.useNativeRenderer = this.settings.useNativeRenderer !== false;
    this.settings.language = normalizeLanguage(this.settings.language);
  }

  copy() {
    return copyForLanguage(this.settings.language);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async publishCurrentNote() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice(this.copy().openNote);
      return;
    }
    await this.publishFile(file);
  }

  async publishFile(file) {
    try {
      const markdown = await this.app.vault.read(file);
      const notes = await this.collectShareNotes(file, markdown);
      const assets = await this.collectAssets(notes);
      const [root, ...relatedNotes] = notes;
      const input = {
        root: { sourcePath: root.sourcePath, title: root.title, markdown: root.markdown, assets },
        relatedNotes: relatedNotes.map(({ sourcePath, title, markdown: noteMarkdown }) => ({ sourcePath, title, markdown: noteMarkdown })),
      };
      const bundle = await this.compileForPublish(input);
      const storedSiteId = this.app.metadataCache.getFileCache(file)?.frontmatter?.share_site_id;
      const siteId = /^site-\d+$/i.test(String(storedSiteId || "")) ? undefined : storedSiteId;
      const result = await this.publishBundle(bundle, siteId, file.path);
      const publishedUrl = `${result.url}/`;
      await this.savePublishedMetadata(file, result, publishedUrl);
      await this.finishPublish(result, publishedUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`${this.copy().publishFailed}: ${message}`);
    }
  }

  async compileForPublish(input) {
    if (this.settings.useNativeRenderer === false) {
      return compileShare(input);
    }
    try {
      return await compileShareWithNative(this, input);
    } catch (error) {
      console.warn(`${COPY.productName}: native Obsidian rendering failed; using fallback renderer`, error);
      new Notice(this.copy().fallbackRenderer);
      return compileShare(input);
    }
  }

  async requestPublish(endpoint, method, payload) {
    let response;
    try {
      response = await requestUrl({
        url: endpoint,
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.settings.publishToken}` },
        body: JSON.stringify(payload),
        throw: false,
      });
    } catch (error) {
      const status = error?.status ?? error?.statusCode ?? error?.response?.status;
      const detail = requestErrorDetail(error);
      if (status) throw new Error(`Publish request failed (${status})${detail ? `: ${detail}` : ""}`);
      const copy = this.copy();
      throw new Error(`${copy.cannotReachService} ${this.settings.apiBaseUrl}. ${copy.startLocalServer}`);
    }
    if (response.status < 200 || response.status >= 300) {
      const detail = requestErrorDetail(response);
      throw new Error(`Publish request failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    return response.json || JSON.parse(response.text);
  }

  async publishBundle(bundle, siteId, sourceKeyForIdempotency) {
    const apiBaseUrl = this.settings.apiBaseUrl.replace(/\/$/, "");
    const chunks = createUploadChunks(bundle);
    const upload = await this.requestPublish(`${apiBaseUrl}/v1/sites/uploads`, "POST", {
      siteId: siteId || undefined,
      idempotencyKey: `${sourceKeyForIdempotency}:upload:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      formatVersion: bundle.formatVersion,
      sourcePath: bundle.sourcePath,
      title: bundle.title,
      chunkCount: chunks.length,
    });
    const copy = this.copy();
    const progress = new Notice(copy.uploading(0, chunks.length));
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        await this.requestPublish(`${apiBaseUrl}/v1/uploads/${encodeURIComponent(upload.uploadId)}/chunks`, "POST", {
          uploadId: upload.uploadId,
          ...chunks[index],
        });
        progress.setMessage?.(copy.uploading(index + 1, chunks.length));
      }
      return await this.requestPublish(`${apiBaseUrl}/v1/uploads/${encodeURIComponent(upload.uploadId)}/commit`, "POST", {
        uploadId: upload.uploadId,
      });
    } finally {
      progress.hide?.();
    }
  }

  async finishPublish(result, publishedUrl = result.url) {
    const copy = this.copy();
    try {
      await navigator.clipboard.writeText(publishedUrl);
      new Notice(copy.publishedAndCopied(publishedUrl));
    } catch {
      new Notice(copy.published(publishedUrl));
    }
  }

  async collectShareNotes(rootFile, rootMarkdown) {
    const notes = [];
    const queue = [{ file: rootFile, markdown: rootMarkdown, depth: 0 }];
    const seen = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || seen.has(current.file.path)) continue;
      seen.add(current.file.path);
      notes.push({ file: current.file, sourcePath: current.file.path, title: current.file.basename, markdown: current.markdown });
      if (!shouldFollowLinkedPage(current.depth, this.settings.linkedPageDepth)) continue;
      for (const reference of this.extractNoteReferences(current.file, current.markdown)) {
        const target = this.resolveVaultNote(reference, current.file);
        if (!target || seen.has(target.path)) continue;
        queue.push({ file: target, markdown: await this.app.vault.read(target), depth: current.depth + 1 });
      }
    }
    return notes;
  }

  extractNoteReferences(file, markdown) {
    const references = new Set((this.app.metadataCache.getFileCache(file)?.links || []).map((link) => link.link));
    for (const match of markdown.matchAll(/(?<!\!)\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]+)?\]\]/g)) references.add(match[1]);
    for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]*)?)\)/gi)) references.add(match[1]);
    return [...references];
  }

  resolveVaultNote(reference, sourceFile) {
    let clean = String(reference || "").split("#", 1)[0].split("^", 1)[0].trim();
    if (!clean) return null;
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // Keep partially encoded names for the direct vault lookup.
    }
    const candidates = [];
    const resolved = this.app.metadataCache.getFirstLinkpathDest?.(clean, sourceFile.path);
    if (resolved) candidates.push(resolved);
    const direct = this.app.vault.getAbstractFileByPath(clean.replace(/^\.\//, ""));
    if (direct) candidates.push(direct);
    const parentPath = sourceFile.parent?.path ? `${sourceFile.parent.path}/${clean}` : clean;
    const relative = parentPath.split("/").reduce((parts, part) => {
      if (!part || part === ".") return parts;
      if (part === "..") parts.pop();
      else parts.push(part);
      return parts;
    }, []).join("/");
    const relativeFile = this.app.vault.getAbstractFileByPath(relative);
    if (relativeFile) candidates.push(relativeFile);
    return candidates.find((candidate) => String(candidate.extension || "").toLowerCase() === "md") || null;
  }

  async collectAssets(noteInputs) {
    const assets = [];
    const seen = new Set();
    for (const note of noteInputs) {
      const references = extractAssetReferences(note.markdown);
      for (const reference of references) {
        const file = this.resolveVaultAsset(reference, note.file);
        if (!file || seen.has(file.path)) continue;
        seen.add(file.path);
        const binary = new Uint8Array(await this.app.vault.readBinary(file));
        let binaryString = "";
        for (let offset = 0; offset < binary.length; offset += 0x8000) {
          binaryString += String.fromCharCode(...binary.subarray(offset, offset + 0x8000));
        }
        assets.push({
          sourcePath: file.path,
          path: defaultAssetPath(file.path),
          contentType: mimeTypeFor(file.extension),
          body: btoa(binaryString),
          encoding: "base64",
        });
      }
    }
    return assets;
  }

  resolveVaultAsset(reference, noteFile) {
    const cleanReference = decodeURIComponent(reference.split("#", 1)[0].trim());
    if (!cleanReference || /^(?:[a-z]+:)?\/\//i.test(cleanReference) || cleanReference.startsWith("data:")) return null;
    const direct = this.app.vault.getAbstractFileByPath(cleanReference);
    if (direct && typeof direct.extension === "string" && direct.extension !== "md") return direct;
    const link = this.app.metadataCache.getFirstLinkpathDest?.(cleanReference, noteFile.path);
    if (link && typeof link.extension === "string" && link.extension !== "md") return link;
    const parentPath = noteFile.parent?.path ? `${noteFile.parent.path}/${cleanReference}` : cleanReference;
    const relative = this.app.vault.getAbstractFileByPath(parentPath);
    return relative && typeof relative.extension === "string" && relative.extension !== "md" ? relative : null;
  }

  async savePublishedMetadata(file, result, publishedUrl = result.url) {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.share_site_id = result.siteId;
      frontmatter.share_link = publishedUrl;
      frontmatter.share_updated = new Date().toISOString();
    });
    this.settings.lastPublishedUrl = publishedUrl;
    await this.saveSettings();
  }

  openLastPublishedSite() {
    if (!this.settings.lastPublishedUrl) {
      new Notice(this.copy().noPublishedLink);
      return;
    }
    openExternal(this.settings.lastPublishedUrl);
  }

  async copyLastPublishedLink() {
    if (!this.settings.lastPublishedUrl) {
      new Notice(this.copy().noPublishedLink);
      return;
    }
    try {
      await navigator.clipboard.writeText(this.settings.lastPublishedUrl);
      new Notice(this.copy().linkCopied);
    } catch {
      new Notice(this.copy().linkCopyFailed);
    }
  }
}

class SharePublisherSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const copy = copyForLanguage(this.plugin.settings.language);
    containerEl.empty();
    containerEl.createEl("h2", { text: copy.productName });
    containerEl.createEl("p", { text: copy.settingsIntro });
    containerEl.createEl("p", { text: copy.settingsIntroDetails });
    new Setting(containerEl)
      .setName(copy.language)
      .setDesc(copy.languageDescription)
      .addDropdown((dropdown) => dropdown
        .addOption("en", "English")
        .addOption("zh", "中文")
        .setValue(this.plugin.settings.language)
        .onChange(async (value) => {
          this.plugin.settings.language = normalizeLanguage(value);
          await this.plugin.saveSettings();
          this.display();
        }));
    containerEl.createEl("h3", { text: copy.serviceSection });
    new Setting(containerEl)
      .setName(copy.serviceUrl)
      .setDesc(copy.serviceUrlDescription)
      .addText((text) => text.setPlaceholder(DEFAULT_SETTINGS.apiBaseUrl).setValue(this.plugin.settings.apiBaseUrl).onChange(async (value) => {
        this.plugin.settings.apiBaseUrl = value.trim().replace(/\/$/, "");
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName(copy.accessToken)
      .setDesc(copy.accessTokenDescription)
      .addText((text) => text.setPlaceholder(DEFAULT_SETTINGS.publishToken).setValue(this.plugin.settings.publishToken).onChange(async (value) => {
        this.plugin.settings.publishToken = value.trim();
        await this.plugin.saveSettings();
      }));
    containerEl.createEl("h3", { text: copy.contentSection });
    new Setting(containerEl)
      .setName(copy.linkedNoteDepth)
      .setDesc(copy.linkedNoteDepthDescription)
      .addText((text) => {
        text.setValue(String(this.plugin.settings.linkedPageDepth)).setPlaceholder("1");
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.step = "1";
        text.onChange(async (value) => {
          this.plugin.settings.linkedPageDepth = normalizeLinkedPageDepth(value);
          this.plugin.settings.includeLinkedPages = this.plugin.settings.linkedPageDepth > 0;
          text.setValue(String(this.plugin.settings.linkedPageDepth));
          await this.plugin.saveSettings();
        });
    });
    new Setting(containerEl)
      .setName(copy.nativeRenderer)
      .setDesc(copy.nativeRendererDescription)
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.useNativeRenderer !== false).onChange(async (value) => {
        this.plugin.settings.useNativeRenderer = value;
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName(copy.repository)
      .setDesc(REPOSITORY_URL)
      .addButton((button) => button.setButtonText(copy.open).onClick(() => openExternal(REPOSITORY_URL)));
  }
}

// Keep compatibility with both direct CommonJS loaders and default-export loaders.
module.exports = SharePublisherPlugin;
module.exports.default = SharePublisherPlugin;

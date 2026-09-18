export interface MarkdownRenderContext {
  currentPagePath?: string;
  currentSourcePath?: string;
  pagePaths?: Map<string, string>;
  assetPaths?: Map<string, string>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSourcePath(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\.md$/i, "")
    .toLowerCase();
}

function basename(value: string): string {
  return value.replaceAll("\\", "/").split("/").pop() || value;
}

function sourcePathVariants(value: string): string[] {
  const normalized = value.replaceAll("\\", "/");
  return [...new Set([normalizeSourcePath(normalized), normalizeSourcePath(basename(normalized))])];
}

function pageSlug(value: string): string {
  return normalizeSourcePath(value)
    .replace(/[^a-z0-9/_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "") || "index";
}

function encodePath(value: string): string {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function isExternalUrl(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value.trim());
}

function isExternalReference(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("#") || isExternalUrl(trimmed);
}

function relativeHref(fromPagePath: string, targetPagePath: string): string {
  const fromParts = fromPagePath.split("/");
  fromParts.pop();
  const targetParts = targetPagePath.split("/");
  let common = 0;
  while (common < fromParts.length && common < targetParts.length && fromParts[common] === targetParts[common]) {
    common += 1;
  }
  const prefix = "../".repeat(fromParts.length - common);
  const sameDirectoryPrefix = prefix || "./";
  return `${sameDirectoryPrefix}${encodePath(targetParts.slice(common).join("/")) || "index.html"}`;
}

function resolveRelativeSourcePath(target: string, currentSourcePath?: string): string {
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

function resolvePageHref(target: string, context: MarkdownRenderContext): string | undefined {
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

function resolveMarkdownLinkHref(href: string, context: MarkdownRenderContext): string | undefined {
  const trimmed = href.trim();
  if (isExternalReference(trimmed) || !/\.md(?:#|$)/i.test(trimmed)) return trimmed;
  return resolvePageHref(trimmed.replace(/\.md(?=#|$)/i, ""), context);
}

function resolveAssetPath(sourcePath: string, context: MarkdownRenderContext): string {
  if (isExternalUrl(sourcePath)) {
    return sourcePath;
  }
  const assetPath = sourcePathVariants(sourcePath).map((key) => context.assetPaths?.get(key)).find(Boolean);
  if (assetPath) {
    return context.currentPagePath ? relativeHref(context.currentPagePath, assetPath) : `./${encodePath(assetPath)}`;
  }
  return `./${encodePath(`assets/${basename(sourcePath)}`)}`;
}

function splitTableRow(line: string): string[] {
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return value.split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll("\\|", "|"));
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function inlineMarkdown(value: string, context: MarkdownRenderContext): string {
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

function renderTable(lines: string[], context: MarkdownRenderContext): string {
  const header = splitTableRow(lines[0]);
  const rows = lines.slice(2).map(splitTableRow);
  const headerHtml = header.map((cell) => `<th>${inlineMarkdown(cell, context)}</th>`).join("");
  const rowsHtml = rows.map((row) => {
    const cells = header.map((_cell, index) => `<td>${inlineMarkdown(row[index] || "", context)}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("\n");
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function renderList(lines: string[], context: MarkdownRenderContext): string {
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

function renderCallout(lines: string[], context: MarkdownRenderContext): string {
  const first = /^>\s*\[!([^\]]+)\]\s*(.*)$/.exec(lines[0]);
  if (!first) return "";
  const kind = first[1].trim().toLowerCase();
  const title = first[2].trim() || first[1].trim();
  const content = lines.slice(1).map((line) => line.replace(/^>\s?/, "")).join("\n");
  return `<aside class="callout callout-${escapeHtml(kind)}"><div class="callout-title">${escapeHtml(title)}</div><div class="callout-content">${renderMarkdown(content, context)}</div></aside>`;
}

interface HeadingSection {
  level: number;
  heading: string;
  items: Array<string | HeadingSection>;
}

function renderHeadingSection(section: HeadingSection): string {
  const content = section.items.map((item) => typeof item === "string" ? item : renderHeadingSection(item)).join("\n");
  return `<details class="heading-section heading-level-${section.level}" open><summary>${section.heading}</summary>${content}</details>`;
}

function wrapHeadingSections(blocks: string[]): string {
  const roots: Array<string | HeadingSection> = [];
  const stack: HeadingSection[] = [];

  for (const block of blocks) {
    const heading = /^<h([1-6])(?:\s[^>]*)?>[\s\S]*<\/h\1>$/.exec(block.trim());
    if (!heading) {
      (stack.at(-1)?.items || roots).push(block);
      continue;
    }

    const section: HeadingSection = { level: Number(heading[1]), heading: block.trim(), items: [] };
    while (stack.length > 0 && stack.at(-1)!.level >= section.level) stack.pop();
    (stack.at(-1)?.items || roots).push(section);
    stack.push(section);
  }

  return roots.map((item) => typeof item === "string" ? item : renderHeadingSection(item)).join("\n");
}

export function renderMarkdown(markdown: string, context: MarkdownRenderContext = {}): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
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
      const codeLines: string[] = [];
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
      const quoteLines: string[] = [];
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
      const listLines: string[] = [];
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

export function sourcePathKey(value: string): string {
  return normalizeSourcePath(value);
}

export function defaultAssetPath(sourcePath: string): string {
  return `assets/${basename(sourcePath).replace(/[^a-z0-9._-]+/gi, "-")}`;
}

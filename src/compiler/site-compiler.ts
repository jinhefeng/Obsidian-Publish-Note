import type { PublishAsset, PublishBundle, PublishPage } from "../shared/contracts.ts";
import { defaultAssetPath, renderMarkdown, sourcePathKey } from "./markdown-renderer.ts";

export interface NoteAssetInput {
  sourcePath: string;
  body: string;
  contentType: string;
  encoding: "utf8" | "base64";
  path?: string;
}

export interface NoteInput {
  sourcePath: string;
  markdown: string;
  title?: string;
  assets?: NoteAssetInput[];
}

export interface ShareInput {
  root: NoteInput;
  relatedNotes?: NoteInput[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function noteTitle(input: NoteInput): string {
  return input.title?.trim() || input.sourcePath.split(/[\\/]/).pop()?.replace(/\.md$/i, "") || "Untitled";
}

function pageHtml(title: string, body: string, navigation = ""): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>html.share-publisher-page,body.share-publisher-page{width:auto!important;min-width:0;height:auto!important;min-height:100%;overflow:visible!important;contain:initial!important}body.share-publisher-page{display:block!important;position:static!important;user-select:text!important;max-width:54rem;margin:3rem auto;padding:0 1.25rem;font:16px/1.65 system-ui,sans-serif;color:#202124;background:#fff}main.markdown-rendered{min-width:0}.page-title{margin:0 0 2rem;border-bottom:1px solid #e5e5e7;padding-bottom:.75rem}.heading-section>summary{cursor:pointer}.heading-section>summary::marker{color:#888}img,video,svg{max-width:100%;height:auto}pre{padding:1rem;overflow:auto;background:#f4f4f5;border-radius:.5rem}code{font-family:ui-monospace,monospace}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #d7d7dc;padding:.5rem;text-align:left}th{background:#f4f4f5}blockquote{margin:1rem 0;padding:.25rem 1rem;border-left:4px solid #c7c7cc;background:#fafafa}.callout{margin:1rem 0;padding:1rem;border:1px solid #d7d7dc;border-radius:.5rem;background:#fafafa}.callout-title{font-weight:700;margin-bottom:.35rem}.callout-note,.callout-tip{border-color:#82b1ff;background:#f4f8ff}.callout-warning,.callout-caution{border-color:#e5b84b;background:#fff9e6}.task-list-item{list-style:none;margin-left:-1.5rem}</style>
    <style>.heading-section>summary{cursor:pointer;list-style:none;position:relative}.heading-section>summary::-webkit-details-marker{display:none}.heading-section>summary::marker{content:""}.heading-section>summary::before{content:"";position:absolute;inset-inline-start:-1.1em;inset-block-start:50%;width:0;height:0;border-block:.35em solid transparent;border-inline-start:.5em solid #888;opacity:0;transform:translateY(-50%);transition:opacity .12s ease,transform .12s ease}.heading-section>summary:hover::before,.heading-section>summary:focus-visible::before{opacity:1}.heading-section[open]>summary::before{transform:translateY(-50%) rotate(90deg)}.copy-code-button{position:absolute;inset-block-start:.5rem;inset-inline-end:.5rem;cursor:pointer}.copy-code-button.is-copied{color:#7c3aed}pre{position:relative}</style>
  </head>
  <body>
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

function compareSourcePaths(left: NoteInput, right: NoteInput): number {
  const leftKey = sourcePathKey(left.sourcePath);
  const rightKey = sourcePathKey(right.sourcePath);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : left.sourcePath < right.sourcePath ? -1 : left.sourcePath > right.sourcePath ? 1 : 0;
}

function shareNotes(input: ShareInput): NoteInput[] {
  const rootKey = sourcePathKey(input.root.sourcePath);
  const related = new Map<string, NoteInput>();
  for (const note of input.relatedNotes || []) {
    const key = sourcePathKey(note.sourcePath);
    if (key !== rootKey && !related.has(key)) related.set(key, note);
  }
  return [input.root, ...[...related.values()].sort(compareSourcePaths)];
}

function relatedPagePath(index: number): string {
  return `page-${index}.html`;
}

function toPublishAssets(inputs: NoteAssetInput[] = []): { assets: PublishAsset[]; paths: Map<string, string> } {
  const paths = new Map<string, string>();
  const assets = inputs.map((asset) => {
    const path = asset.path || defaultAssetPath(asset.sourcePath);
    const normalized = asset.sourcePath.replaceAll("\\", "/");
    paths.set(sourcePathKey(normalized), path);
    paths.set(sourcePathKey(normalized.split("/").pop() || normalized), path);
    return {
      path,
      contentType: asset.contentType,
      body: asset.body,
      encoding: asset.encoding,
    } satisfies PublishAsset;
  });
  return { assets, paths };
}

function compilePage(
  input: NoteInput,
  pagePath: string,
  pagePaths: Map<string, string>,
  assetPaths: Map<string, string>,
  navigation = "",
): PublishPage {
  const title = noteTitle(input);
  const body = renderMarkdown(input.markdown, { currentPagePath: pagePath, currentSourcePath: input.sourcePath, pagePaths, assetPaths });
  return {
    path: pagePath,
    contentType: "text/html",
    body: pageHtml(title, body, navigation),
    encoding: "utf8",
  };
}

export function compileShare(input: ShareInput): PublishBundle {
  const notes = shareNotes(input);
  const pagePaths = new Map(notes.map((note, index) => [sourcePathKey(note.sourcePath), index === 0 ? "index.html" : relatedPagePath(index)]));
  const allAssets = notes.flatMap((note) => note.assets || []);
  const { assets, paths: assetPaths } = toPublishAssets(allAssets);
  const pages = notes.map((note, index) => compilePage(note, pagePaths.get(sourcePathKey(note.sourcePath)) || (index === 0 ? "index.html" : relatedPagePath(index)), pagePaths, assetPaths));

  return {
    formatVersion: 1,
    sourcePath: input.root.sourcePath,
    title: noteTitle(input.root),
    pages,
    assets,
  };
}

export function compileNote(input: NoteInput): PublishBundle {
  return compileShare({ root: input });
}

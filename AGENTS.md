# Publish Note — Agent Instructions

This file records the durable project requirements that apply to future development work. Read it before changing the plugin, its settings UI, documentation, or repository metadata.

## Product identity

- Product name: `Publish Note`.
- Author: `Jin Hefeng`.
- Obsidian plugin ID: `share-publisher`.
- Keep the plugin ID and the Vault folder name `.obsidian/plugins/share-publisher/` stable for compatibility with existing installations.
- Current plugin baseline: `0.1.6`. The source of truth for the plugin version is `plugin/manifest.json`; bump it for user-visible plugin changes.
- GitHub repository: [jinhefeng/Obsidian-Publish-Note](https://github.com/jinhefeng/Obsidian-Publish-Note).
- Git remote: `origin` must point to `https://github.com/jinhefeng/Obsidian-Publish-Note.git`.

## User-facing interaction requirements

- The note context-menu item must be named exactly `Publish Note`.
- The command palette and ribbon publish entry should remain consistent with `Publish Note`.
- Do not reintroduce a `Publish current note` or `Last published link` block into the settings page.
- Do not add a first-line `Publish Note` heading to the settings page. The first content should be the product introduction.
- The settings page should begin with a moderately detailed explanation of what Publish Note does: it publishes the active Markdown note as a shareable website, can include linked notes, uploads referenced local assets, and copies a stable link after publishing.
- Keep the project repository link at the bottom of the settings page.
- The settings page must contain a language selector with English as the default and Chinese as the alternative. Display one language at a time; do not concatenate Chinese and English into the same setting label or description.
- Keep settings focused on service and content configuration: language, service URL, access token, linked-note depth, and Obsidian renderer behavior.

## Documentation and language policy

- `README.md` is English by default.
- `README.zh-CN.md` contains the Chinese documentation.
- Each README must have a small language switch at the top linking to the other file. Do not write the full Chinese and English documents inline in the same README body.
- Apply the same structure to `plugin/README.md` and `plugin/README.zh-CN.md`.
- Keep the repository and author links consistent across `plugin/manifest.json`, `package.json`, both README pairs, and the settings page.
- When user-facing copy changes, update the relevant English and Chinese source separately and preserve the language-switch links.

## Implementation constraints

- `plugin/main.js` is the self-contained runtime entry point loaded by Obsidian. Do not make it depend on `plugin/compiler.js` at runtime.
- Keep the CommonJS compatibility exports at the end of `plugin/main.js`.
- Store the settings language as `language: "en"` or `language: "zh"`; normalize unknown or missing values to English.
- Use the language-specific copy map for settings labels, descriptions, and notices. Keep the context-menu command exactly `Publish Note` as required above.
- Preserve the existing publishing behavior: the active note is the share root, linked-note depth controls traversal, referenced local assets are uploaded, and successful publishing stores `share_site_id`, `share_link`, and `share_updated` frontmatter.
- The local publishing service is an in-memory development service. Do not describe it as production hosting; Cloudflare Worker/R2/D1 integration remains future work.
- Do not change stable URL semantics without updating the compiler, publish service, tests, README files, and `Task Constitution.md` together.

## Git workflow

- Work on the `main` branch unless the user explicitly requests another branch.
- Before committing, inspect `git status` and keep unrelated user changes intact.
- Use focused commit messages that describe the change.
- Push completed project changes to `origin/main` when the user has asked for repository delivery.
- Do not use destructive commands such as `git reset --hard` or broad deletion commands without explicit user authorization.

## Required validation

Run the following checks after plugin or publishing changes:

```bash
npm run check:plugin
node --check plugin/main.js
npm test
git diff --check
```

`npm test` starts local HTTP listeners for two cases. If the sandbox rejects `127.0.0.1` port binding, rerun the same test with the required local-network permission; a sandbox `EPERM` is not a product failure.

After changing `plugin/main.js` or `plugin/manifest.json`, run:

```bash
npm run update:plugin
```

Then reload `Publish Note` in Obsidian and perform a real plugin smoke test when the task requires runtime verification.

## Project memory

- `Task Constitution.md` is the project task index and must remain consistent with the current implementation and delivery state.
- Preserve existing task IDs and historical evidence when updating it.
- Keep active requirements and blockers concise; do not turn it into a raw conversation transcript.
- `.engineering/` contains the architecture baseline, delivery plan, component catalog, and integration checklist.

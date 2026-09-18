# Publish Note — Agent Instructions

This file records the durable project requirements that apply to future development work. Read it before changing the plugin, its settings UI, documentation, or repository metadata.

## Product identity

- Product name: `Publish Note`.
- Author: `Jin Hefeng`.
- Obsidian plugin ID: `publish-note`.
- Keep the plugin ID and the Vault folder name `.obsidian/plugins/publish-note/` stable for compatibility with current installations. The former `share-publisher` folder is a legacy installation path and must not be deleted automatically.
- Current plugin baseline: `0.2.24`. The source of truth for the plugin version is `plugin/manifest.json`; bump it for every user-visible plugin change, including settings UI, diagnostics, behavior, and packaging changes.
- Versioning feedback is mandatory: announce the new plugin version in the working-session commentary when starting a plugin update and repeat it in the final response. Never report a plugin update as complete without stating the version.
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
- Keep settings focused on deploying to the user's Cloudflare, plus language, linked-note depth, Obsidian renderer behavior, and optional Debug mode. The official Cloudflare connection remains planned and must not appear as an active settings action. Do not expose service URL or Publish Token fields in the normal settings page.

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
- The local publishing service is an in-memory development service. Do not describe it as production hosting. The official hosted path may use Cloudflare Worker/R2/D1 and uses the official Publish Note control plane. Personal deployment runs directly from Obsidian desktop through Cloudflare OAuth/API and uses only Worker/D1 BLOB storage: it must not request, create, or require R2. Deploy Button, Wrangler, and manual `/setup` remain advanced fallbacks.
- Use `start.sh` (or the `npm run dev:server`, `start`, `stop`, `restart`, `status`, and `logs` wrappers) for local service lifecycle management; every `start` must force-stop processes listening on the configured port and launch a fresh project service.
- Do not change stable URL semantics without updating the compiler, publish service, tests, README files, and `Task Constitution.md` together.

## Version and release synchronization

- Treat `plugin/manifest.json` and `plugin/main.js` as the only hand-maintained plugin release sources. Do not edit generated copies in the repository root, the release staging directory, or the Obsidian Vault directly.
- Every plugin version update must synchronize all of these artifacts from the `plugin/` sources:
  - root `manifest.json` for the Obsidian Community directory;
  - root `main.js` as the repository and manual-install mirror;
  - `dist/obsidian-release/manifest.json` and `dist/obsidian-release/main.js` as the exact GitHub Release staging files;
  - `Vault/.obsidian/plugins/publish-note/manifest.json` and `Vault/.obsidian/plugins/publish-note/main.js` for local smoke testing.
- The synchronization workflow must build the plugin first, then generate the root mirrors and Release staging files, validate that their contents and versions match the `plugin/` sources, and only then sync the Vault. It must never copy `src/`, `server/`, `tests/`, `plugin/`, or `plugin/compiler.js` into the Release staging directory.
- `plugin/compiler.js` is a development/reference file only. It is not a runtime dependency and must not be included in the root runtime mirror, the Obsidian installation directory, or GitHub Release assets.
- Extend or preserve `npm run update:plugin` as the single local synchronization entry point. After changing `plugin/main.js` or `plugin/manifest.json`, run it before validation; if it does not regenerate every artifact listed above, the plugin update is incomplete.
- Add or maintain a parity check in `npm run check:plugin` that fails when a generated root or Release artifact is missing, stale, has a different version, or differs from its `plugin/` source. A clean rebuild must produce no uncommitted generated-file diff.
- Keep `package.json`'s version synchronized with `plugin/manifest.json`, unless a documented project decision explicitly states otherwise. The plugin manifest remains the release authority.
- For user-facing copy changes, update `README.md`, `README.zh-CN.md`, `plugin/README.md`, and `plugin/README.zh-CN.md` separately; preserve each language switch and do not overwrite the more focused plugin README with the repository README.
- For changes to stable URLs, publish contracts, storage, authentication, settings behavior, or release boundaries, update the relevant source, tests, README files, `.engineering/` documents, and `Task Constitution.md` in the same change.
- GitHub Releases must use the exact `x.y.z` version from `plugin/manifest.json` as the tag, and must upload only the generated `main.js` and `manifest.json` assets (plus `styles.css` if one exists). Do not upload a source archive as a plugin asset.
- Before announcing a release as complete, verify the generated artifact parity, run the required validation commands, inspect `git status`, commit and push the root manifest/runtime mirrors, and perform the required Obsidian smoke test.

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

Every user-visible plugin update must bump `plugin/manifest.json` before running this command. The command is a developer packaging/synchronization step; plugin users must never be instructed to run it.

Then reload `Publish Note` in Obsidian and perform a real plugin smoke test when the task requires runtime verification.

## Project memory

- `Task Constitution.md` is the project task index and must remain consistent with the current implementation and delivery state.
- Preserve existing task IDs and historical evidence when updating it.
- Keep active requirements and blockers concise; do not turn it into a raw conversation transcript.
- `.engineering/` contains the architecture baseline, delivery plan, component catalog, and integration checklist.

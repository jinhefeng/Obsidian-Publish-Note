# Publish Note

**Language / 语言:** English | [中文](README.zh-CN.md)

Publish Obsidian Markdown notes as stable, accessible share websites, with linked notes included according to your settings.

## Features

- The current note is the share root and receives a stable `/s/{siteId}` URL.
- Directly linked Markdown notes are included by default; adjust the scope with **Linked note depth**.
- Supports WikiLinks, relative Markdown links, images, callouts, code blocks, tables, and task lists.
- Uses Obsidian's native renderer when available and falls back to the deterministic renderer when needed.
- Published links are copied automatically and can be opened or copied again from the settings page.

## Validation

Requires Node.js 26 or a Node.js version with TypeScript type stripping support.

```bash
npm test
npm run check:plugin
```

## Local testing in Obsidian

1. Start the local publishing service:

   ```bash
   npm run dev:server
   ```

2. Sync the latest plugin files into your Vault:

   ```bash
   npm run update:plugin
   ```

   The default target is the development Vault. Set `OBSIDIAN_VAULT_PATH` to use another Vault.

3. In Obsidian, open **Settings → Community plugins** and enable **Publish Note**.

4. Open a Markdown note and choose **Publish Note** from the command palette, ribbon upload icon, or note context menu.

The settings-page button **Publish current note** publishes the Markdown note that is currently open. The published URL is copied automatically. The root page is `index.html`; linked pages use `page-1.html`, `page-2.html`, and so on.

The local service uses in-memory storage, so published sites disappear when the server stops; it is intended for plugin interaction and contract testing.

## Project links

- [GitHub repository](https://github.com/jinhefeng/Obsidian-Publish-Note)
- Author: [Jin Hefeng](https://github.com/jinhefeng)

Project delivery documents are in `.engineering/`, and the global task index is `Task Constitution.md`.

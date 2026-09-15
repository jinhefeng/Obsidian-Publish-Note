# Publish Note — local install

**Language / 语言:** English | [中文](README.zh-CN.md)

This folder contains the current development plugin artifact. It is not yet a production release.

The installable entry point is self-contained: `manifest.json` and `main.js` are the runtime files loaded by Obsidian. `compiler.js` remains a readable development reference.

## Install and test

1. Start the local publishing backend:

   ```bash
   npm run dev:server
   ```

2. Sync the latest runtime files into your Vault:

   ```bash
   npm run update:plugin
   ```

   The default target is the development Vault. Set `OBSIDIAN_VAULT_PATH` before the command to use another Vault.

3. In Obsidian, open **Settings → Community plugins** and enable **Publish Note**.

4. Open a Markdown note and choose **Publish Note** from the command palette, ribbon upload icon, or note context menu.

   The settings-page button **Publish current note** publishes the Markdown note that is currently open.

5. The published URL is copied automatically. The root page is `index.html`; linked pages use `page-1.html`, `page-2.html`, and so on.

## Settings

The settings page defaults to English. Use **Language** to switch the settings page to Chinese.

- **Service URL**: publishing service endpoint.
- **Access token**: authentication token for the service.
- **Linked note depth**: `0` publishes only the current note; larger values include more linked notes.
- **Use Obsidian renderer**: preserves Obsidian styling and installed Markdown plugin output.

## Project links

- [GitHub repository](https://github.com/jinhefeng/Obsidian-Publish-Note)
- Author: [Jin Hefeng](https://github.com/jinhefeng)

After changing `plugin/main.js`, run `npm run update:plugin`, then reload Publish Note in Obsidian.

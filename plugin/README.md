# Publish Note — plugin

**Language / 语言:** English | [中文](README.zh-CN.md)

This folder contains the current development plugin artifact. The supported personal path publishes through a Cloudflare Worker and D1 in the user's Cloudflare account; the local in-memory server is only a test substitute.

The installable entry point is self-contained: `manifest.json` and `main.js` are the runtime files loaded by Obsidian. `compiler.js` remains a readable development reference.

## Connect and publish

To stop using the connection in this Vault, click **Disconnect from my Cloudflare** in settings. This removes only the saved Worker URL and Publish Token from the Vault; it does not delete Cloudflare resources, published sites, or connections on other devices.

The current settings page provides **Deploy to my Cloudflare**. The official Publish Note connection is planned and is not an active settings action in this release; legacy official-service fields remain readable for compatibility. For a personal Worker, click **Deploy to my Cloudflare** on Obsidian desktop and authorize the public Cloudflare OAuth application. The plugin then creates the Worker, D1 migration, first internal account, and Publish Token directly in your account. Personal content is stored in D1 BLOB chunks, so no R2 bucket or subscription is needed. The Cloudflare access token is used in memory only and revoked after deployment; only the Worker URL and scoped Publish Token are saved. The direct setup does not ask for an email, password, recovery code, or a user-provided OAuth client.

Personal deployment prefers the stable Worker name `publish-note`, so the account hostname normally stays predictable while each note keeps its stable `/s/{siteId}` path. If another Worker already uses that name, a deterministic account-based suffix is used; existing older or suffixed URLs remain valid.

After **Disconnect**, a later deployment inspects same-pattern D1 databases, recognizes the Publish Note schema, and reuses the historical database. It also updates the matching historical Publish Note Worker in place, preserving its hostname, then issues a new token for the existing personal account. If either resource is missing, only the missing Worker or D1 is created and bound to the resource that was found. Ambiguous historical databases stop deployment instead of splitting content.

Deploy once on desktop, then include this plugin's settings when syncing your Vault to your phone. Syncing only notes does not transfer the connection. Synced settings load automatically; desktop and mobile can publish and update without another Cloudflare authorization, even with the desktop computer off. Selecting a saved connection never deploys again. Deploy Button, Wrangler, and `/setup` remain advanced fallbacks.

Deployment progress is local to the running device and does not overwrite a usable connection. Failed setup reports its stage, with sanitized technical details available in settings. Unconfirmed writes are not automatically repeated. Customers do not need commands or their own OAuth client.

For troubleshooting, enable **Debug mode** in settings before retrying. The copyable **Debug log** includes sanitized deployment and publishing request/response details such as phase, route template, status, internal/provider codes, safe external messages, retry attempt, and duration. It never stores credentials, request bodies, or note content.

The direct personal setup does not expose the service's account registration or recovery screens. Advanced self-hosted account management remains available through the Worker console when using the fallback `/setup` and account routes.

## Local install and test

1. Start the local publishing test backend:

   ```bash
   npm run dev:server
   ```

2. Sync the latest runtime files into your Vault:

   ```bash
   npm run update:plugin
   ```

   The default target is the development Vault. Set `OBSIDIAN_VAULT_PATH` before the command to use another Vault.

3. In Obsidian, open **Settings → Community plugins** and enable **Publish Note**.

4. The normal settings page does not expose service credentials. For a local backend smoke test, temporarily seed the plugin data with `apiBaseUrl: "http://127.0.0.1:8787"`, `publishToken: "dev-token"`, `selfPublishToken: "dev-token"`, `deploymentWorkerUrl: "http://127.0.0.1:8787"`, `deploymentManaged: true`, and `cloudflareMode: "self"`, then open a Markdown note and choose **Publish Note** from the command palette, ribbon upload icon, or note context menu.

5. The published URL is copied automatically. The root page is `index.html`; linked pages use `page-1.html`, `page-2.html`, and so on. Pages and assets upload in chunks before the new revision is committed.

## Packaging a release

Edit only `plugin/manifest.json` and `plugin/main.js` for plugin release changes. After bumping the version, run `npm run update:plugin`. It rebuilds the embedded Worker artifact, generates the root runtime mirrors, prepares `dist/obsidian-release/`, validates that all generated files match the plugin sources, and syncs the latest runtime into the development Vault. A GitHub Release must contain only the generated `main.js` and `manifest.json` assets; `compiler.js` is a development reference and is not included.

## Settings

The settings page defaults to English. Use **Language** to switch the settings page to Chinese.

- **Deploy to my Cloudflare**: first-time setup runs on desktop. Once connected, the same option selects the saved personal connection on desktop or mobile without redeploying.
- **Official Cloudflare connection**: planned; it is not exposed as an active settings action in this release.
- **Service URL / Publish Token**: are managed internally after personal deployment; normal settings no longer ask the user to enter them.
- **Linked page depth**: `0` publishes only the current note; `1` includes direct links; larger values include deeper linked pages.
- **Use Obsidian renderer**: preserves Obsidian styling and installed Markdown plugin output.
- **Debug mode**: when enabled, records detailed, sanitized deployment and publishing diagnostics for troubleshooting; when disabled, the settings page hides the log panels.
- **After publishing**: the root note stores `share_site_id`, `share_link`, and `share_updated` in frontmatter so later updates can keep the same site.

External URLs, `mailto:` links, anchors, and external assets stay unchanged and are not traversed.

## Project links

- [GitHub repository](https://github.com/jinhefeng/Obsidian-Publish-Note)
- Author: [Jin Hefeng](https://github.com/jinhefeng)

After changing `plugin/main.js`, run `npm run update:plugin`, then reload Publish Note in Obsidian.

# Publish Note

**Language / 语言:** English | [中文](README.zh-CN.md)

Publish Obsidian Markdown notes as stable, accessible share websites, with linked notes included according to your settings.

## Features

- The current note is the share root and receives a stable `/s/{siteId}` URL.
- Directly linked Markdown notes are included by default; adjust the scope with **Linked page depth** (`0` = current note only, `1` = direct links, higher values = deeper links).
- Supports WikiLinks, relative Markdown links, images, callouts, code blocks, tables, and task lists.
- External URLs, `mailto:` links, anchors, and external assets remain unchanged and are never added to the linked-page queue.
- Uses Obsidian's native renderer when available and falls back to the deterministic renderer when needed.
- The published URL is copied automatically; successful publishing stores `share_site_id`, `share_link`, and `share_updated` in the root note's frontmatter so later updates can keep the same site.
- Optional **Debug mode** records sanitized deployment and publishing request/response details in the settings page. It never records tokens, request bodies, or note content, and the log can be copied for troubleshooting.

## Validation

Requires Node.js 26 or a Node.js version with TypeScript type stripping support.

```bash
npm test
npm run check:plugin
npm run check:worker
```

## Cloudflare publishing

Publish Note serves pages through Cloudflare Workers at `/s/{siteId}/`. The supported personal path uses a Worker and D1 in your Cloudflare account; current content is stored as D1 BLOB chunks and does not create or require R2. The planned official hosted path may use Worker, R2, and D1. Each account has a 50 MB current-content quota and up to 10 published Notes.

### Personal Cloudflare deployment

To stop using the connection in this Vault, click **Disconnect from my Cloudflare** in settings. This removes only the saved Worker URL and Publish Token from the Vault; it does not delete Cloudflare resources, published sites, or connections on other devices.

The primary personal deployment flow starts in the Obsidian settings page on desktop. Click **Deploy to my Cloudflare**, authorize the public Publish Note OAuth application in Cloudflare, and let the plugin create and initialize a private Worker and D1 database directly in your account. The plugin creates the initial private account and scoped Publish Token during setup; no email/password form or user-provided OAuth client is required. Content is stored as D1 BLOB chunks; no R2 bucket or R2 subscription is created. The plugin keeps the Cloudflare access token in memory only, revokes it after deployment, and saves only the Worker URL and scoped Publish Token.

D1-only keeps the normal publishing experience for notes, linked pages, images, and mobile publishing after setup. Individual files are limited to 20 MB and content is split into 1 MB chunks to stay within D1 and Workers Free request limits. Free-plan D1 limits are hard limits rather than automatic overage charges; see Cloudflare's [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Set up once on desktop, then sync this plugin's settings with the same Vault on your phone. Syncing notes alone does not transfer the connection: include community plugin settings in your sync configuration. Publish Note reloads synced settings automatically and pins one connection for each publish. Desktop and mobile can publish and update notes without another Cloudflare authorization, even when the desktop computer is off. Selecting an existing connection never redeploys it.

Setup uses Authorization Code + PKCE with a temporary desktop callback. Deployment progress stays in memory; only a completed connection is saved. A failed attempt preserves existing connections and reports the failed stage under expandable technical details. An unconfirmed write is never automatically repeated or reported as cleaned up. The [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/jinhefeng/Obsidian-Publish-Note) button, Wrangler, and `/setup` remain advanced fallbacks.

When troubleshooting a deployment or publish failure, enable **Debug mode** in the settings page and retry the operation. The **Debug log** records the phase, route template, HTTP status, internal code, Cloudflare code/message, response content type, retry attempt, and duration. Credentials, request bodies, and note contents are excluded.

The Worker can later be bound to a custom domain. Set `PUBLIC_BASE_URL` when the sharing URL must use that domain; otherwise links use the request's Worker hostname.

### Official hosted service (planned)

The current plugin settings expose the personal **Deploy to my Cloudflare** action; once a connection exists, the same block also offers **Disconnect from my Cloudflare**. The official hosted connection is kept as a planned product path and is not offered as an active settings action in this release. Existing legacy official-service configuration remains readable for compatibility, but new users are not asked to connect to it.

When the official path is introduced, the official Publish Note service will act as the control plane for account connection, device authorization, Publish Token issuance, quotas, and tenant isolation. It will be separate from the personal Worker path and will not be required when a user publishes through their own Worker.

The local in-memory server remains available only for contract and plugin testing. It is not production hosting.

### OAuth client configuration

The released plugin uses a public Cloudflare OAuth client for desktop Authorization Code + PKCE, with token endpoint authentication method `none`, the fixed loopback redirect `http://127.0.0.1:8976/oauth/callback`, and only account-read, Workers Scripts write, and D1 write scopes. The public client ID is embedded in the plugin; no client secret is shipped. Users do not register an OAuth client. The official Publish Note Worker and control plane are separate planned infrastructure and are not needed for the current personal-deployment flow.

## Local testing in Obsidian

These commands are for plugin development only. Customers install the released plugin and use its settings; they do not run `npm run update:plugin` or create their own OAuth client.

1. Start the local publishing service:

   ```bash
   npm run dev:server
   ```

   The launcher is reusable: `npm run status`, `npm run restart`, `npm run stop`, and `npm run logs` are also available. Every `start` first force-stops processes listening on the configured port, then launches a fresh service.

2. Sync the latest plugin files into your Vault:

   ```bash
   npm run update:plugin
   ```

   The default target is the development Vault. Set `OBSIDIAN_VAULT_PATH` to use another Vault.

3. In Obsidian, open **Settings → Community plugins** and enable **Publish Note**.

4. The normal settings page intentionally does not expose service credentials. To exercise the local test backend in Obsidian, temporarily seed the plugin data with the compatibility values `apiBaseUrl: "http://127.0.0.1:8787"`, `publishToken: "dev-token"`, `selfPublishToken: "dev-token"`, `deploymentWorkerUrl: "http://127.0.0.1:8787"`, `deploymentManaged: true`, and `cloudflareMode: "self"`.

5. Open a Markdown note and choose **Publish Note** from the command palette, ribbon upload icon, or note context menu. The published URL is copied automatically. The root page is `index.html`; linked pages use `page-1.html`, `page-2.html`, and so on. Pages and assets upload sequentially in small chunks before the new revision is committed.

The local service uses in-memory storage, so published sites disappear when the server stops; it is intended for plugin interaction and contract testing.

## Project links

- [GitHub repository](https://github.com/jinhefeng/Obsidian-Publish-Note)
- Author: [Jin Hefeng](https://github.com/jinhefeng)

Project delivery documents are in `.engineering/`, and the global task index is `Task Constitution.md`.

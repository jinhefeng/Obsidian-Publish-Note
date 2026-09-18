# Publish Note plugin

**Language / 语言:** English | [中文](README.zh-CN.md)

Publish Note publishes the active Obsidian Markdown note as a shareable website through your own Cloudflare account. It can include linked notes, upload referenced local assets, copy the published URL, and preserve the same URL when the note is updated.

## Install manually

Download the `manifest.json` and `main.js` assets from the [latest release](https://github.com/jinhefeng/Obsidian-Publish-Note/releases/latest) and place them directly in:

```text
.obsidian/plugins/share-publisher/
```

Enable **Publish Note** under **Settings → Community plugins**.

## Use the plugin

1. Open **Settings → Community plugins → Publish Note**.
2. Click **Deploy to my Cloudflare** on desktop and authorize Cloudflare.
3. Open a Markdown note and choose **Publish Note** from the command palette, ribbon, or note context menu.
4. Adjust **Linked page depth** if linked notes should be included.

The current note is the share root. Publish Note supports WikiLinks, relative links, images, callouts, code blocks, tables, task lists, and referenced local assets. External URLs and assets remain unchanged.

The plugin saves the Worker URL and scoped Publish Token after deployment. It does not create or require R2, and the normal settings page does not ask for a service URL or token.

For the full user guide, see the [repository README](../README.md). For development and release work, see [CONTRIBUTING.md](../CONTRIBUTING.md).

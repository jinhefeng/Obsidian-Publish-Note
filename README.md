# Publish Note / 发布笔记

把 Obsidian 中的 Markdown 笔记发布成稳定、可访问的分享网站，并按设置自动携带链接笔记。  
Publish Obsidian Markdown notes as stable, accessible share websites, with linked notes included according to your settings.

## 功能 / Features

- 当前笔记是分享入口，发布后获得稳定的 `/s/{siteId}` 链接。  
  The current note is the share root and receives a stable `/s/{siteId}` URL.
- 默认携带直接链接的 Markdown 笔记，可用“链接笔记深度 / Linked note depth”调整范围。  
  Directly linked Markdown notes are included by default; adjust the scope with “Linked note depth”.
- 支持 WikiLink、相对 Markdown 链接、图片、Callout、代码块、表格和任务列表。  
  Supports WikiLinks, relative Markdown links, images, callouts, code blocks, tables, and task lists.
- 优先使用 Obsidian 原生渲染，并在不可用时自动回退到确定性渲染器。  
  Uses Obsidian's native renderer when available and falls back to the deterministic renderer when needed.
- 发布链接会自动复制到剪贴板，也可以在设置页打开或再次复制。  
  Published links are copied automatically and can be opened or copied again from settings.

## 验证 / Validation

需要 Node.js 26 或支持 TypeScript type stripping 的 Node.js 版本。  
Requires Node.js 26 or a Node.js version with TypeScript type stripping support.

```bash
npm test
npm run check:plugin
```

## 在 Obsidian 中本地测试 / Local testing in Obsidian

1. 启动本地发布服务。 / Start the local publishing service.

   ```bash
   npm run dev:server
   ```

2. 将最新插件同步到 Vault。 / Sync the latest plugin files into your Vault.

   ```bash
   npm run update:plugin
   ```

   默认目标是当前开发 Vault；如需指定其他 Vault，请先设置 `OBSIDIAN_VAULT_PATH`。  
   The default target is the development Vault; set `OBSIDIAN_VAULT_PATH` to use another Vault.

3. 在 Obsidian 中打开 **Settings → Community plugins**，启用 **Publish Note**。  
   In Obsidian, open **Settings → Community plugins** and enable **Publish Note**.

4. 打开 Markdown 笔记，从命令面板、功能区上传图标或右键菜单选择 **Publish Note**。  
   Open a Markdown note and choose **Publish Note** from the command palette, ribbon upload icon, or note context menu.

本地服务使用内存存储，重启后已发布内容会清空；它只用于验证插件交互和发布契约。  
The local service uses in-memory storage, so published sites disappear when the server stops; it is intended for plugin interaction and contract testing.

## 项目链接 / Project links

- [GitHub repository / GitHub 项目仓库](https://github.com/jinhefeng/Obsidian-Publish-Note)
- 作者 / Author: [Jin Hefeng](https://github.com/jinhefeng)

项目交付文档位于 `.engineering/`，全局任务索引位于 `Task Constitution.md`。  
Project delivery documents are in `.engineering/`, and the global task index is `Task Constitution.md`.

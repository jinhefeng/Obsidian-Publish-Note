# Publish Note

**语言 / Language:** 中文 | [English](README.md)

将 Obsidian 中的 Markdown 笔记发布成稳定、可访问的分享网站，并按设置自动携带链接笔记。

## 功能

- 当前笔记是分享入口，发布后获得稳定的 `/s/{siteId}` 链接。
- 默认携带直接链接的 Markdown 笔记，可通过 **链接笔记深度** 调整范围。
- 支持 WikiLink、相对 Markdown 链接、图片、Callout、代码块、表格和任务列表。
- 优先使用 Obsidian 原生渲染，不可用时自动回退到确定性渲染器。
- 发布链接会自动复制到剪贴板，也可以在设置页打开或再次复制。

## 验证

需要 Node.js 26 或支持 TypeScript type stripping 的 Node.js 版本。

```bash
npm test
npm run check:plugin
```

## 在 Obsidian 中本地测试

1. 启动本地发布服务：

   ```bash
   npm run dev:server
   ```

2. 将最新插件文件同步到 Vault：

   ```bash
   npm run update:plugin
   ```

   默认目标是开发 Vault；如需使用其他 Vault，请设置 `OBSIDIAN_VAULT_PATH`。

3. 在 Obsidian 中打开 **设置 → 社区插件**，启用 **Publish Note**。

4. 打开 Markdown 笔记，从命令面板、功能区上传图标或右键菜单选择 **Publish Note**。发布链接会自动复制到剪贴板。根页面为 `index.html`，链接页面依次使用 `page-1.html`、`page-2.html` 等路径。

本地服务使用内存存储，重启后已发布内容会清空；它只用于验证插件交互和发布契约。

## 项目链接

- [GitHub 项目仓库](https://github.com/jinhefeng/Obsidian-Publish-Note)
- 作者：[Jin Hefeng](https://github.com/jinhefeng)

项目交付文档位于 `.engineering/`，全局任务索引位于 `Task Constitution.md`。

# Publish Note / 发布笔记 — local install / 本地安装

This folder contains the current development plugin artifact. It is not yet a production release.  
此目录是当前开发版插件产物，暂不是生产发布包。

The installable entry point is self-contained: `manifest.json` and `main.js` are the runtime files loaded by Obsidian. `compiler.js` remains a readable development reference.  
可安装入口是自包含的：Obsidian 运行时加载 `manifest.json` 和 `main.js`；`compiler.js` 仅作为开发参考保留。

## Install and test / 安装与测试

1. Start the local publishing backend. / 启动本地发布服务。

   ```bash
   npm run dev:server
   ```

2. Sync the latest runtime files into your Vault. / 将最新运行时文件同步到 Vault。

   ```bash
   npm run update:plugin
   ```

   The default target is the development Vault. Set `OBSIDIAN_VAULT_PATH` before the command to use another Vault.  
   默认目标是开发 Vault；如需使用其他 Vault，请在执行前设置 `OBSIDIAN_VAULT_PATH`。

3. In Obsidian, open **Settings → Community plugins** and enable **Publish Note**.  
   在 Obsidian 中打开 **设置 → 社区插件**，启用 **Publish Note**。

4. Open a Markdown note and choose **Publish Note** from the command palette, ribbon upload icon, or note context menu.  
   打开 Markdown 笔记，从命令面板、功能区上传图标或右键菜单选择 **Publish Note**。

   The settings-page button **Publish current note / 发布当前笔记** publishes the Markdown note that is currently open.  
   设置页中的 **Publish current note / 发布当前笔记** 按钮，会发布当前正在打开的 Markdown 笔记。

5. The published URL is copied automatically. The root page is `index.html`; linked pages use `page-1.html`, `page-2.html`, and so on.  
   发布链接会自动复制到剪贴板。根页面为 `index.html`，链接页面依次使用 `page-1.html`、`page-2.html` 等路径。

## Settings / 设置

- **Service URL / 服务地址**：publishing service endpoint / 发布服务地址。
- **Access token / 访问令牌**：authentication token for the service / 发布服务的认证令牌。
- **Linked note depth / 链接笔记深度**：`0` publishes only the current note; larger values include more linked notes. / `0` 仅发布当前笔记，更大的值会携带更多链接笔记。
- **Use Obsidian renderer / 使用 Obsidian 渲染器**：preserves Obsidian styling and installed Markdown plugin output. / 保留 Obsidian 样式和已安装 Markdown 插件的输出。

## Project links / 项目链接

- [GitHub repository / GitHub 项目仓库](https://github.com/jinhefeng/Obsidian-Publish-Note)
- Author / 作者: [Jin Hefeng](https://github.com/jinhefeng)

After changing `plugin/main.js`, run `npm run update:plugin`, then reload Publish Note in Obsidian.  
修改 `plugin/main.js` 后执行 `npm run update:plugin`，然后在 Obsidian 中重新加载 Publish Note。

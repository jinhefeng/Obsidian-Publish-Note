# Publish Note — 本地安装

**语言 / Language:** 中文 | [English](README.md)

此目录是当前开发版插件产物，暂不是生产发布包。

可安装入口是自包含的：Obsidian 运行时加载 `manifest.json` 和 `main.js`；`compiler.js` 仅作为开发参考保留。

## 安装与测试

1. 启动本地发布服务：

   ```bash
   npm run dev:server
   ```

2. 将最新运行时文件同步到 Vault：

   ```bash
   npm run update:plugin
   ```

   默认目标是开发 Vault；如需使用其他 Vault，请在执行前设置 `OBSIDIAN_VAULT_PATH`。

3. 在 Obsidian 中打开 **设置 → 社区插件**，启用 **Publish Note**。

4. 打开 Markdown 笔记，从命令面板、功能区上传图标或右键菜单选择 **Publish Note**。

5. 发布链接会自动复制到剪贴板。根页面为 `index.html`，链接页面依次使用 `page-1.html`、`page-2.html` 等路径。

## 设置

设置页默认使用英文，可通过 **语言** 切换为中文。

- **服务地址**：发布服务地址。
- **访问令牌**：发布服务的认证令牌。
- **链接笔记深度**：`0` 仅发布当前笔记，更大的值会携带更多链接笔记。
- **使用 Obsidian 渲染器**：保留 Obsidian 样式和已安装 Markdown 插件的输出。

## 项目链接

- [GitHub 项目仓库](https://github.com/jinhefeng/Obsidian-Publish-Note)
- 作者：[Jin Hefeng](https://github.com/jinhefeng)

修改 `plugin/main.js` 后执行 `npm run update:plugin`，然后在 Obsidian 中重新加载 Publish Note。

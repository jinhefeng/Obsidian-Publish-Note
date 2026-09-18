# One-Click Publish 插件

**语言 / Language:** 中文 | [English](README.md)

完成一次 Cloudflare 账户连接后，One-Click Publish 只需一次点击即可将当前 Obsidian Markdown 笔记发布为可分享的网站。插件可以携带链接笔记、上传引用的本地资源、复制发布链接，并在更新笔记时保持原链接不变。

## 手动安装

从[最新 Release](https://github.com/jinhefeng/One-Click-Publish/releases/latest)下载 `manifest.json` 和 `main.js`，将两个文件直接放入：

```text
.obsidian/plugins/one-click-publish/
```

然后在**设置 → 社区插件**中启用 **One-Click Publish**。

## 使用插件

1. 打开**设置 → 社区插件 → One-Click Publish**。
2. 在桌面版点击**部署到我的 Cloudflare**并完成一次 Cloudflare 授权。
3. 打开 Markdown 笔记，从命令面板、功能区或笔记右键菜单选择 **One-Click Publish**。
4. 如需携带链接笔记，调整**引用页面深度**。

当前笔记是分享根页面。One-Click Publish 支持 WikiLink、相对链接、图片、Callout、代码块、表格、任务列表和引用的本地资源；外部 URL 和资源保持原样。

部署完成后，插件会保存 Worker 地址和受限的 Publish Token。插件不会创建或要求 R2，普通设置页也不会要求填写服务地址或 Token。

完整用户指南请参阅[仓库 README](../README.zh-CN.md)；开发和发布说明请参阅[贡献指南](../CONTRIBUTING.zh-CN.md)。

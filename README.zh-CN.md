# Publish Note

**语言 / Language:** 中文 | [English](README.md)

通过你自己的 Cloudflare 账户，将当前 Obsidian Markdown 笔记发布为可分享的网站。Publish Note 可以携带链接笔记、上传引用的本地资源，并在再次发布时保持稳定链接。

## 插件功能

- 将当前笔记发布为稳定 `/s/{siteId}` 网站的根页面。
- 根据**引用页面深度**携带链接的 Markdown 笔记。
- 支持 WikiLink、相对 Markdown 链接、图片、Callout、代码块、表格和任务列表。
- 上传引用的本地图片及其他支持的本地资源。
- 外部 URL、锚点、`mailto:` 链接和外部资源保持原样。
- 自动复制发布链接，并在根笔记 frontmatter 中写入 `share_site_id`、`share_link` 和 `share_updated`。
- 支持 Obsidian 原生渲染；原生渲染不可用时使用确定性回退渲染器。

## 安装

### 社区插件

在 Obsidian 中打开**设置 → 社区插件 → 浏览**，搜索 **Publish Note**，安装后启用。

### 手动安装

从[最新 GitHub Release](https://github.com/jinhefeng/Obsidian-Publish-Note/releases/latest)下载 `manifest.json` 和 `main.js`，将两个文件放入：

```text
.obsidian/plugins/share-publisher/
```

然后打开**设置 → 社区插件**，启用 **Publish Note**。

## 快速开始

1. 在 Obsidian 桌面版打开**设置 → 社区插件 → Publish Note**。
2. 点击**部署到我的 Cloudflare**，在 Cloudflare 中授权 Publish Note 应用。
3. 打开要发布的 Markdown 笔记。
4. 从命令面板、功能区或笔记右键菜单选择 **Publish Note**。
5. 打开自动复制的链接，或在笔记 frontmatter 中查看链接。

首次部署会在你的 Cloudflare 账户中创建私有 Worker 和 D1 数据库。部署完成后，插件只在 Vault 中保存 Worker 地址和受限的 Publish Token；Cloudflare access token 只在内存中使用，完成部署后会撤销。

部署完成后，如果要在其他设备使用，请在同步 Vault 时同时同步本插件设置。只同步笔记不会同步发布连接。

## 链接笔记与资源

**引用页面深度**决定 Publish Note 跟随链接的范围：

- `0`：只发布当前笔记。
- `1`：包含当前笔记直接链接的页面。
- 更大的值：继续包含更深层的链接页面。

当前笔记始终是分享根页面。本地图片和支持的本地资源会随页面一起上传；外部资源不会被下载或改写。

## 设置

- **语言**：默认英文，也可以切换为中文。
- **引用页面深度**：控制链接笔记的遍历范围。
- **使用 Obsidian 渲染器**：在支持时保留 Obsidian 的渲染效果。
- **调试模式**：排查问题时显示脱敏后的部署和发布诊断信息。

普通设置页不会要求填写服务地址或 Publish Token。官方托管连接仍在规划中；当前支持的路径是部署到你自己的 Cloudflare 账户。

## 限制与隐私

- 个人发布使用 Cloudflare Workers 和 D1，不会创建或要求 R2。
- 每个账户最多保存 50 MB 当前发布内容，最多发布 10 篇笔记。
- 单个文件上限为 20 MB。
- 内容会分片上传，以符合 Cloudflare 请求限制。
- 调试日志不会记录凭证、请求正文或笔记内容。

## 更新已发布笔记

Publish Note 会在根笔记 frontmatter 中保存站点 ID。再次发布同一个根笔记时，会更新原有网站，而不是创建新的链接。

## 常见问题

- 安装或更新插件后，请重新加载社区插件。
- 发布失败时，开启**调试模式**，重试一次并查看可复制的调试日志。
- 部署失败时，确认 Obsidian 桌面版可以打开 Cloudflare 授权流程，并且账户允许修改 Worker 和 D1。
- 手动安装时，确认 `manifest.json` 和 `main.js` 直接位于 `.obsidian/plugins/share-publisher/` 中。

## 相关链接

- [GitHub 仓库](https://github.com/jinhefeng/Obsidian-Publish-Note)
- [最新 Release](https://github.com/jinhefeng/Obsidian-Publish-Note/releases/latest)
- [作者：Jin Hefeng](https://github.com/jinhefeng)
- [MIT License](LICENSE)

开发、测试、打包和发布说明请参阅[贡献指南](CONTRIBUTING.zh-CN.md)。

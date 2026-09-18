# Publish Note

**语言 / Language:** 中文 | [English](README.md)

将 Obsidian 中的 Markdown 笔记发布成稳定、可访问的分享网站，并按设置自动携带链接笔记。

## 功能

- 当前笔记是分享入口，发布后获得稳定的 `/s/{siteId}` 链接。
- 默认携带直接引用的 Markdown 笔记，可通过 **引用页面深度** 调整范围（`0` = 仅当前笔记，`1` = 直接引用，更大的值 = 更深层级）。
- 支持 WikiLink、相对 Markdown 链接、图片、Callout、代码块、表格和任务列表。
- 外部 URL、`mailto:` 链接、锚点和外部资源保持原样，不加入引用页面队列。
- 优先使用 Obsidian 原生渲染，不可用时自动回退到确定性渲染器。
- 发布链接会自动复制到剪贴板；发布成功后，根笔记的 frontmatter 会保存 `share_site_id`、`share_link` 和 `share_updated`，后续更新可以继续使用同一个站点。
- 可选的**调试模式**会在设置页记录脱敏后的部署和发布请求/响应详情。日志不会记录 Token、请求正文或笔记内容，并支持一键复制排查。

## 验证

需要 Node.js 26 或支持 TypeScript type stripping 的 Node.js 版本。

```bash
npm test
npm run check:plugin
npm run check:worker
```

## Cloudflare 发布

Publish Note 通过 Cloudflare Worker 的 `/s/{siteId}/` 提供网页访问。当前支持的个人路径在你自己的 Cloudflare 账户中使用 Worker 和 D1；当前内容以 D1 BLOB 分片保存，不会创建或要求 R2。规划中的官方托管路径可以使用 Worker、R2 和 D1。每个账户最多保存 50 MB 当前内容，最多发布 10 篇 Note。

### 个人 Cloudflare 部署

如果要停止此 Vault 使用该连接，可以在设置中点击**取消连接**。这只会删除 Vault 保存的 Worker 地址和 Publish Token，不会删除 Cloudflare 资源、已发布网站或其他设备上的连接。

首选的个人部署流程从 Obsidian 桌面版设置页开始。点击 **部署到我的 Cloudflare**，在 Cloudflare 中授权公开的 Publish Note OAuth 应用，然后由插件直接在你的账户中创建并初始化私有 Worker 和 D1 数据库。插件会在部署时创建内部账户和受限的 Publish Token，不会要求用户填写邮箱、密码或注册自己的 OAuth 客户端。内容以 D1 BLOB 分片保存，不会创建 R2 存储桶，也不需要订阅 R2。Cloudflare access token 只在插件内存中使用，部署完成后会撤销；插件只保存 Worker 地址和受限的 Publish Token。

D1-only 保留笔记、引用页面、图片以及部署后移动端发布的正常体验。单个文件上限为 20 MB，内容按 1 MB 分片，以符合 D1 与 Workers Free 的单次请求限制。Free 计划的 D1 限制是硬限制，不会自动产生超额收费；请参阅 Cloudflare 的 [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/) 和 [D1 限制](https://developers.cloudflare.com/d1/platform/limits/)。

在电脑上部署一次，再将本插件的设置随同一 Vault 同步到手机。仅同步笔记不会同步连接，请在同步配置中包含第三方插件设置。Publish Note 会自动加载同步配置，每次发布固定使用一组连接。电脑和手机之后都可以直接发布和更新，无需再次进行 Cloudflare 授权，电脑关机也不影响手机发布。选用已有连接不会重新部署。

首次部署使用 Authorization Code + PKCE 和临时本机回调。部署进度仅保存在内存中，完成后才保存连接；失败保留已有连接，并在可展开的技术详情中显示失败阶段。写入结果不明时不会自动重复创建，也不会声称清理成功。[Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/jinhefeng/Obsidian-Publish-Note)、Wrangler 和 `/setup` 仍为高级备用方案。

排查部署或发布失败时，可以在设置页开启**调试模式**后重试。**调试日志**会记录阶段、脱敏路由模板、HTTP 状态码、插件错误码、Cloudflare 错误码/信息、响应类型、重试次数和耗时；不会记录凭证、请求正文或笔记内容。

之后可以为 Worker 绑定自定义域名；如果分享链接要使用自定义域名，请设置 `PUBLIC_BASE_URL`，否则自动使用当前 Worker 域名。

### 官方托管服务（规划中）

当前插件设置页提供个人 **部署到我的 Cloudflare** 操作；连接成功后，同一个设置块还会提供**取消连接**。官方托管连接仍处于规划阶段，本版本不在设置页提供可操作入口。为兼容旧版本，插件仍可读取历史官方服务配置，但新用户不会被要求连接官方服务。

未来启用官方路径时，官方 Publish Note 服务的控制面将负责账户连接、设备授权、Publish Token 发放、配额和租户隔离。它与个人 Worker 路径分开；用户通过自己的 Worker 发布时不需要经过该控制面。

本地内存服务继续保留，但只用于契约和插件测试，不是生产托管方案。

### OAuth 客户端配置

发布版插件使用一个用于桌面 Authorization Code + PKCE 的公开 Cloudflare OAuth Client，并将 token endpoint authentication method 设为 `none`；固定回调地址为 `http://127.0.0.1:8976/oauth/callback`，只申请账户读取、Workers Scripts 写入和 D1 写入权限。公开 Client ID 已内置在插件中，插件不会携带 Client Secret。用户不需要注册 OAuth 客户端。官方 Publish Note Worker 和控制面属于独立的规划中基础设施，当前个人部署流程不需要它们。

## 在 Obsidian 中本地测试

以下命令仅用于插件开发。客户安装发布版后直接使用设置页，不需要运行 `npm run update:plugin`，也不需要自行注册 OAuth 客户端。

1. 启动本地发布服务：

   ```bash
   npm run dev:server
   ```

   启动器支持重复执行，也提供 `npm run status`、`npm run restart`、`npm run stop` 和 `npm run logs`。每次 `start` 都会先强制停止占用配置端口的进程，再启动全新的服务。

2. 将最新插件文件同步到 Vault：

   ```bash
   npm run update:plugin
   ```

   默认目标是开发 Vault；如需使用其他 Vault，请设置 `OBSIDIAN_VAULT_PATH`。

3. 在 Obsidian 中打开 **设置 → 社区插件**，启用 **Publish Note**。

4. 普通设置页不会暴露服务凭据。若要在 Obsidian 中验证本地测试服务，请临时在插件数据中预置兼容字段：`apiBaseUrl: "http://127.0.0.1:8787"`、`publishToken: "dev-token"`、`selfPublishToken: "dev-token"`、`deploymentWorkerUrl: "http://127.0.0.1:8787"`、`deploymentManaged: true` 和 `cloudflareMode: "self"`。

5. 打开 Markdown 笔记，从命令面板、功能区上传图标或右键菜单选择 **Publish Note**。发布链接会自动复制到剪贴板。根页面为 `index.html`，链接页面依次使用 `page-1.html`、`page-2.html` 等路径。页面和资源会先按小块顺序上传，全部完成后才提交新版本。

本地服务使用内存存储，重启后已发布内容会清空；它只用于验证插件交互和发布契约。

## 项目链接

- [GitHub 项目仓库](https://github.com/jinhefeng/Obsidian-Publish-Note)
- 作者：[Jin Hefeng](https://github.com/jinhefeng)

项目交付文档位于 `.engineering/`，全局任务索引位于 `Task Constitution.md`。

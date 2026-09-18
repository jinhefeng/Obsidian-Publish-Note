# Publish Note — 插件

**语言 / Language:** 中文 | [English](README.md)

此目录是当前开发版插件产物。当前支持的个人路径通过用户 Cloudflare 账户中的 Worker 和 D1 发布；本地内存服务只用于测试替身。

可安装入口是自包含的：Obsidian 运行时加载 `manifest.json` 和 `main.js`；`compiler.js` 仅作为开发参考保留。

## 连接并发布

如果要停止此 Vault 使用该连接，可以在设置中点击**取消连接**。这只会删除 Vault 保存的 Worker 地址和 Publish Token，不会删除 Cloudflare 资源、已发布网站或其他设备上的连接。

当前设置页提供 **部署到我的 Cloudflare**。官方 Publish Note 连接仍处于规划阶段，本版本不在设置页提供可操作入口；旧版官方服务字段仍可读取以保持兼容。如果要使用个人 Worker，请在 Obsidian 桌面版的 Cloudflare 区域点击 **部署到我的 Cloudflare**，然后授权公开的 Cloudflare OAuth 应用。插件会直接在你的账户中创建 Worker、D1 migration、内部账户和 Publish Token。个人内容保存在 D1 BLOB 分片中，不需要 R2 存储桶或订阅。Cloudflare access token 只在内存中使用并在部署后撤销；插件只保存 Worker 地址和受限的 Publish Token。个人部署不会要求填写邮箱、密码、恢复码或注册自己的 OAuth 客户端。

个人部署会优先使用固定的 Worker 名称 `publish-note`，因此账户域名通常可预测，每篇笔记仍使用稳定的 `/s/{siteId}` 路径。如果该名称已被其他 Worker 占用，插件会使用基于账户的可预测后缀；已有的旧地址或带后缀地址仍然有效。

点击**取消连接**后再次部署时，插件会检查同名模式的 D1，通过表结构识别 Publish Note，并复用历史数据库；同时原地更新并复用匹配的历史 Publish Note Worker，保持原来的域名，再为原个人账户重新签发 Token。如果 Worker 或 D1 缺失，只创建缺失的资源并绑定已找到的资源。多个历史数据库无法安全判断时会停止，避免内容分裂。

在桌面版部署一次，再将本插件设置随 Vault 同步到手机。仅同步笔记不会同步连接。插件会自动加载同步后的配置，电脑和手机之后都可以直接发布和更新，无需再次授权，电脑关机也不影响手机发布。选用已保存的连接不会重新部署。Deploy Button、Wrangler 和 `/setup` 仍为高级备用方案。

部署进度仅保存在当前设备内存中，不会覆盖已有可用连接。失败时显示具体阶段，设置页可展开脱敏技术详情；结果不明的写入不会自动重试。客户无需运行命令，也无需注册自己的 OAuth 客户端。

排查问题时，可先在设置页开启**调试模式**再重试。可复制的**调试日志**包含脱敏后的部署和发布请求/响应信息，例如阶段、路由模板、状态码、插件/外部错误码、安全的外部错误信息、重试次数和耗时；不会保存凭证、请求正文或笔记内容。

个人部署流程不会显示服务的账户注册或恢复页面。使用备用的 `/setup` 和账户路由时，Worker 控制台仍提供高级的自托管账户管理能力。

## 本地安装与测试

1. 启动本地发布测试服务：

   ```bash
   npm run dev:server
   ```

2. 将最新运行时文件同步到 Vault：

   ```bash
   npm run update:plugin
   ```

   默认目标是开发 Vault；如需使用其他 Vault，请在执行前设置 `OBSIDIAN_VAULT_PATH`。

3. 在 Obsidian 中打开 **设置 → 社区插件**，启用 **Publish Note**。

4. 普通设置页不会暴露服务凭据。若要验证本地测试服务，请临时在插件数据中预置 `apiBaseUrl: "http://127.0.0.1:8787"`、`publishToken: "dev-token"`、`selfPublishToken: "dev-token"`、`deploymentWorkerUrl: "http://127.0.0.1:8787"`、`deploymentManaged: true` 和 `cloudflareMode: "self"`，然后打开 Markdown 笔记，从命令面板、功能区上传图标或笔记右键菜单选择 **Publish Note**。

5. 发布链接会自动复制到剪贴板。根页面为 `index.html`，链接页面依次使用 `page-1.html`、`page-2.html` 等路径。页面和资源会先按分片上传，全部完成后才提交新版本。

## 打包发布版本

插件发布变更只修改 `plugin/manifest.json` 和 `plugin/main.js`。升级版本后执行 `npm run update:plugin`，该命令会重新构建内嵌 Worker、生成根目录运行时镜像、准备 `dist/obsidian-release/`、校验所有生成文件与插件源文件一致，并将最新运行时同步到开发 Vault。GitHub Release 只能包含生成的 `main.js` 和 `manifest.json` 附件；`compiler.js` 只是开发参考文件，不会进入发布包。

## 设置

设置页默认使用英文，可通过 **语言** 切换为中文。

- **部署到我的 Cloudflare**：首次部署在桌面版完成；已有连接时，电脑和手机都可以通过这个选项选用个人服务，不会重新部署。
- **官方 Cloudflare 连接**：规划中的功能，本版本不在设置页提供入口。
- **服务地址 / Publish Token**：个人部署成功后由插件内部管理，普通设置不再要求用户手动填写。
- **引用页面深度**：`0` 仅发布当前笔记；`1` 包含直接引用页面；更大的值会继续发布更深层的引用页面。
- **使用 Obsidian 渲染器**：保留 Obsidian 样式和已安装 Markdown 插件的输出。
- **调试模式**：开启后记录详细且脱敏的部署与发布诊断信息；关闭时设置页隐藏日志区域，方便按需排查问题。
- **发布完成后**：根笔记的 frontmatter 会保存 `share_site_id`、`share_link` 和 `share_updated`，后续更新可以继续使用同一个站点。

外部 URL、`mailto:` 链接、锚点和外部资源保持原样，不会被遍历。

## 项目链接

- [GitHub 项目仓库](https://github.com/jinhefeng/Obsidian-Publish-Note)
- 作者：[Jin Hefeng](https://github.com/jinhefeng)

修改 `plugin/main.js` 后执行 `npm run update:plugin`，然后在 Obsidian 中重新加载 Publish Note。

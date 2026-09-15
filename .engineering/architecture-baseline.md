# Architecture Baseline: Obsidian 网站发布 MVP

## Context

- Objective: 将一篇 Obsidian 笔记作为分享入口发布为稳定的公开网站，并按选项携带引用页面。
- In scope: 单页入口、引用页面遍历、本地内容编译、随机不透明 siteId、发布包契约、发布 API、站点元数据、网页访问和失败安全切换。
- Out of scope: 自定义域名、BYOC、账号体系、收费、搜索、统计、评论、密码保护、主题市场和国内区域部署。
- Evidence:
  - 当前仓库为空，没有可复用的代码、测试或工程边界。
  - 已确认参考 `obsidian-htmlto-link` 的 Obsidian 交互，但不沿用其中心化服务实现。
  - 已确认 MVP 采用官方托管、产品域名默认链接。
  - 已完成本地编译器首轮 fixture 和真实 Obsidian 当前笔记首发/更新 smoke；插件已接入 Obsidian 原生渲染快照，最新引用页面内容 smoke 待执行。

## Boundaries

| Boundary | Responsibility | Owner | Depends on | Exposes |
|---|---|---|---|---|
| Obsidian Plugin | 读取当前笔记、按深度遍历可选的引用页面、提供命令/设置、优先调用 Obsidian 原生 Markdown/plugin renderer、采集引用资源、按小块队列调用发布服务、保存 siteId | T4 | Obsidian API, Compiler fallback, Publish API | 用户交互 |
| Content Compiler | 将根 Markdown、引用页面和本地资源转换为确定性的 PublishBundle，作为原生渲染不可用时的回退 | T2 | Shared contracts | `PublishBundle` |
| Publish API | 校验发布包、鉴权、分配/复用 siteId、提交 revision | T3 | Storage adapter | C-002 |
| Storage | 保存 revision 资源和站点元数据，支持原子 current 指针 | T3 | R2/D1 或本地适配器 | `SiteRecord`, objects |
| Viewer | 解析 `/s/{siteId}/{path}`，读取当前 revision 并返回 HTML/asset | T3 | Storage | C-004 |

## Dependency direction

```text
Obsidian Plugin
    ├──> Obsidian Native Renderer
    ├──> Content Compiler (fallback) ───> Shared Contracts
    └──> Publish Client ─────> Publish API

Publish API ───> Storage ───> R2 / D1
Viewer ────────> Storage
```

Compiler 不依赖 Obsidian UI 或 Cloudflare SDK；发布服务不解析 Markdown。插件 artifact 当前内嵌 compiler runtime，开发参考保留在 `plugin/compiler.js`，后续正式构建时再收敛为单一产物来源。跨边界数据只通过 `.engineering/delivery-plan.md` 中的契约流动。

## Constraints and risks

- Constraint: R2 对象保持私有，所有站点访问经过 Viewer/Worker。
- Constraint: 页面资源使用稳定相对路径，避免把本地 vault 路径泄漏到公开网站。
- Constraint: 每次新站点使用不可预测的随机 siteId；根页面固定为 `index.html`，引用页面直接使用同一站点目录下的 `page-N.html`。
- Risk: Obsidian Markdown 语义远大于第一版编译器；通过 T2 的 fixture 阶段逐项扩展。
- Risk: 原生渲染结果包含临时 DOM、插件样式或事件监听器；发布前必须做资源/链接规范化，交互先按静态快照处理。
- Risk: 主题 CSS 依赖 Obsidian 运行时的变量和字体资源；发布时复制已加载样式、主题类和内容计算字体，无法获得的本地字体仍可能回退。
- Risk: Obsidian 工作区 CSS 对 `body` 使用固定高度、`overflow: clip` 和 `contain: strict`；公开页必须剥离工作区类并显式恢复普通文档流，否则内容虽完整输出却不可滚动。
- Risk: 插件可能依赖 Obsidian API、Vault 索引或任意 JavaScript；不承诺任意插件自动获得公开站点运行时。
- Risk: 上传中断可能造成半成品；通过 revision 前缀和最后切换 current 指针规避。
- Risk: 分片上传会留下未提交会话；当前本地服务保留会话以支持重试，生产 Worker 需要设置过期清理并保持 commit 原子性。
- Risk: 发布 API 若没有明确幂等键，会因重试产生重复 revision 或重复站点；C-002 强制要求幂等键。
- Risk: 引用页面递归发布会同时携带大量附件，JSON base64 会放大请求体；本地服务默认上限为 100,000,000 字节，并以 413 明确报告超限，生产服务需要按部署平台限制实现分片或压缩上传。
- Risk: 随机 siteId 只是能力链接，不等于访问控制；真正的私密分享仍需后续密码或身份认证能力。
- Compatibility requirement: `PublishBundle.formatVersion` 和 API `/v1` 在 MVP 内保持兼容；契约变更必须更新 fixture 和受影响工作包。

## Delivery seams

- Seam: Compiler → Publish API
  - Contract needed: C-001 Publish Bundle
  - Work packages affected: WP-002, WP-003, WP-004
- Seam: Plugin → Publish API
  - Contract needed: C-002 Publish API
  - Work packages affected: WP-003, WP-004
- Seam: Plugin → Publish API queued upload
  - Contract needed: C-005 Queued Publish Upload
  - Work packages affected: WP-003, WP-004, WP-005
- Seam: Publish API → D1/R2
  - Contract needed: C-003 Site Metadata and revision rules
  - Work packages affected: WP-003, WP-005
- Seam: Viewer → browser
  - Contract needed: C-004 Site URL and path mapping
  - Work packages affected: WP-003, WP-005

## Open decisions

- ADR-001: `.engineering/decisions/ADR-001-hosted-cloud-publishing.md` — MVP 使用官方托管 Cloudflare 发布服务。
- Pending: 真实产品域名、Worker 部署项目、生产鉴权令牌签发方式，在 WP-003 启动前确定。

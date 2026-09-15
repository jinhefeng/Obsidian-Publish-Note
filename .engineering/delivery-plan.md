# Delivery Plan: Obsidian 网站发布 MVP

## Contract register

### Contract C-001 — Publish Bundle

- Status: frozen
- Producer: CMP-001 / WP-002
- Consumers: CMP-004 / WP-003, CMP-005 / WP-005
- Owner: WP-001
- Inputs: 编译器接收 `sourcePath`、`title`、Markdown 文本和可选资源
- Outputs: `PublishBundle`，包含版本号、站点标题、页面列表和资源列表
- Compatibility: `formatVersion` 当前为 `1`；路径必须是相对 POSIX 路径且不能包含 `..`；HTML/资源内容不得携带本地绝对路径；页面中的标题区可使用原生 `<details>/<summary>` 静态折叠，不依赖脚本；代码块复制由发布页 shell 的委托事件处理
- Verification: `tests/publish-flow.test.ts` 的 bundle shape 和路径断言
- Change rule: 变更必须更新 fixture、消费者和本文件；破坏性变更提升 `formatVersion`

### Contract C-002 — Publish API

- Status: frozen
- Producer: CMP-004 / WP-003
- Consumers: CMP-003 / WP-004
- Owner: WP-001
- Inputs: `PublishRequest { siteId?, idempotencyKey, bundle }`
- Outputs: `PublishResult { siteId, url, revision, uploadedPaths }`
- Compatibility: API 前缀 `/v1`；成功返回 200；首次发布可省略 `siteId`；重复 `idempotencyKey` 返回同一结果；非法包返回 400；请求体超过服务配置上限返回 413；未授权返回 401；错误响应为 `{ error: string }`
- Verification: 本地内存服务测试；接入 Worker 后补充 HTTP fixture
- Change rule: 修改请求/响应、状态码或错误格式前，必须通知 WP-002/WP-004 并更新契约测试

### Contract C-005 — Queued Publish Upload

- Status: frozen
- Producer: CMP-003 / WP-004
- Consumers: CMP-004 / WP-003
- Owner: WP-001
- Inputs: `POST /v1/sites/uploads` 接收 `siteId?`、`idempotencyKey`、`formatVersion`、`sourcePath`、`title`、`chunkCount`；随后通过 `POST /v1/uploads/{uploadId}/chunks` 逐个接收页面或附件块，最后通过 `POST /v1/uploads/{uploadId}/commit` 提交
- Outputs: 开始上传返回 `{ uploadId, siteId, revision }`；块上传返回接收状态；提交返回 C-002 的 `PublishResult`
- Compatibility: 每个页面/附件按顺序编号分片；重复块必须幂等；只有全部对象完整且 bundle 校验通过后才切换 current revision；分片或提交失败不得影响旧 revision；每个请求只承载一个小块
- Verification: `tests/publish-flow.test.ts` 的分片组装、HTTP 生命周期、重复提交和不完整上传保旧版本断言
- Change rule: 分片字段、上传会话状态或提交时机变更必须同步插件、发布服务和契约测试；生产 Worker 需要保留同样的原子提交语义

### Contract C-003 — Site Metadata and revision rules

- Status: frozen
- Producer: CMP-004 / WP-003
- Consumers: CMP-005 / WP-005, CMP-006 / WP-003
- Owner: WP-003
- Inputs: `siteId`, `revision`, `sourcePath`, `title`, `currentRevision`
- Outputs: 当前站点记录和 revision 资源索引
- Compatibility: 同一站点 revision 单调递增；只有资源全部校验成功后才更新 current；失败重试不得改变 current
- Verification: update、idempotency 和 failed-commit tests
- Change rule: 任何 current 指针或 revision 语义变更必须更新 ADR 和回滚验证

### Contract C-004 — Site URL and path mapping

- Status: frozen
- Producer: CMP-006 / WP-003
- Consumers: Plugin, browser, integration tests
- Owner: WP-003
- Inputs: `siteId` 和浏览器路径 `/s/{siteId}/{path}`
- Outputs: current revision 中对应的站点内页面或资源；无路径时使用 `index.html`；HTML 页面必须恢复可滚动的普通文档流
- Compatibility: 根页面固定为 `index.html`；引用页面在同一站点目录下使用 `page-N.html`，编号按规范化源路径排序并在重复引用时只保留一个页面；新站点使用不可预测的随机 siteId，更新时保持不变；MVP 产品域名由部署配置提供；不存在站点返回 404
- Verification: local viewer tests and later deployed smoke test
- Change rule: URL 形态变更需同时更新插件复制链接行为和 README 示例

## Work packages

### WP-001 — Foundation and local vertical slice

- `package_id`: WP-001
- `goal`: 建立可运行的共享契约、最小编译器、内存发布服务和 viewer 测试
- `owner`: Codex
- `scope`: `src/shared`, `src/compiler`, `src/publish`, `scripts/local-publish-server.ts`, `tests`, `.engineering`
- `non_goals`: 真实 Cloudflare、Obsidian API、完整 Markdown 语义
- `dependencies`: none
- `acceptance`: `node --experimental-strip-types --test tests/publish-flow.test.ts` 通过；首发、重复发布、更新和 viewer 读取均有断言
- `status`: complete
- `task_refs`: T1, T1.1, T1.2, T1.3
- `validation`: `npm test` passed on 2026-09-14; 3 tests passed.

### WP-002 — Content compiler

- `package_id`: WP-002
- `goal`: 支持单笔记入口及可选引用页面的 Obsidian 内容编译
- `owner`: Codex
- `scope`: `src/compiler`
- `non_goals`: 发布 API、用户设置、Cloudflare 认证
- `dependencies`: C-001, WP-001
- `acceptance`: fixture 覆盖 Markdown 基础语法、WikiLink、相对 Markdown 文档链接、图片、Callout、代码块复制、表格、标题折叠和页面导航
- `status`: active
- `task_refs`: T2
- `validation`: `npm test` passed on 2026-09-15; 15 tests cover note rendering, referenced assets, moved-target relative links, site-local deduplication, independent site addresses, root index/related-page navigation, heading folding, scroll-safe page layout, oversized HTTP request handling, queued upload assembly/HTTP lifecycle, atomic commit, and depth semantics. Latest Obsidian linked-page content smoke remains open.

### WP-003 — Cloudflare publish service

- `package_id`: WP-003
- `goal`: 用 Worker + 私有 R2 + D1 替换内存服务
- `owner`: Codex
- `scope`: `server/worker`, deployment configuration
- `non_goals`: 账号系统、自定义域名、分析统计
- `dependencies`: C-001, C-002, C-003, C-004, C-005, WP-001
- `acceptance`: 发布/更新/访问/失败恢复在 Cloudflare 环境通过；R2 不公开暴露
- `status`: waiting-contract
- `task_refs`: T3

### WP-004 — Obsidian plugin UX

- `package_id`: WP-004
- `goal`: 在 Obsidian 中完成配置、发布、更新和复制链接
- `owner`: Codex
- `scope`: `plugin/`
- `non_goals`: 模板市场、账号注册、站点管理后台
- `dependencies`: C-001, C-002, C-004, C-005, WP-001
- `acceptance`: 只有当前笔记能触发发布；引用深度默认 `1` 且可设为 `0` 或任意更大整数；新站点使用随机不透明目录，根页面为 `index.html`；默认优先使用 Obsidian 原生渲染快照；原生渲染失败可回退；页面和附件通过 C-005 小块队列上传并在最后原子提交；发布成功显示并复制稳定链接；公开页代码块可复制；错误可见且不丢失旧链接
- `status`: active
- `task_refs`: T4
- `validation`: `npm run check:plugin` and `npm test` passed; real Obsidian current-note first publish and update both passed on 2026-09-14; native snapshot path, dynamic-block wait, basic Tasks snapshot fallback, original filename paths, CSS/typography snapshot, scroll-safe page layout, hover-only heading folding, code-block copy interaction, root/related-page entry and local asset collection are implemented, pending fresh Obsidian plugin-content smoke.

### WP-005 — Integration and release validation

- `package_id`: WP-005
- `goal`: 验证插件、发布服务和 viewer 的完整 MVP 链路
- `owner`: Codex
- `scope`: `tests`, smoke scripts, release docs
- `non_goals`: 生产运营、计费、内容审核平台
- `dependencies`: WP-002, WP-003, WP-004, C-003, C-004
- `acceptance`: 首发、更新、幂等重试、失败回滚、链接访问和资源路径检查全部有证据
- `status`: proposed
- `task_refs`: T5

## Parallelism and ownership review

| Boundary | Owner | Current write scope | Parallel rule |
|---|---|---|---|
| Shared contracts | WP-001 | `src/shared`, contract docs | WP-002/WP-003/WP-004 依赖冻结版本，不直接修改 |
| Compiler | WP-002 | `src/compiler` | 可与 WP-003 并行；契约变更需回到 WP-001 |
| Publish service | WP-003 | `server/worker` | 可与 WP-002/WP-004 并行；只消费 C-001/C-002 |
| Plugin | WP-004 | `plugin` | 依赖 C-002/C-004；不修改 service 或 compiler 内部实现 |
| Integration | WP-005 | `tests`, release docs | 只在依赖包形成可运行版本后执行 |

当前没有重叠写入范围；WP-001 完成后才开放真正的并行实现。

# Task Constitution

## 1. Mission

把 Obsidian 中的一篇笔记，以尽可能少的操作发布成稳定、可访问的公开分享网站；默认自动携带它引用的笔记。

首个 MVP 采用官方托管发布服务：插件本地编译内容，发布服务使用 Cloudflare Worker、私有 R2 和 D1，用户默认通过产品域名访问分享链接。

## 2. Success Criteria

- [ ] 一篇 Markdown 笔记可以从本地编译为可访问的 HTML 网站资源。
- [ ] 插件或本地发布客户端可以上传一个发布包，并获得稳定的 `/s/{siteId}` 链接。
- [ ] 同一站点再次发布时复用原链接，并以新 revision 原子切换内容。
- [ ] Worker 通过私有存储提供网页访问，不直接暴露 R2 bucket。
- [ ] WikiLink、图片、基础 Markdown、原生 Obsidian 渲染快照、文件名标题、字体样式和引用页面发布满足 MVP 验收样例。
- [ ] 发布失败不会破坏上一版可访问内容；本地、契约和端到端验证均有证据。

## 3. Task Tree

### T1 — 工程基线与发布契约
- Status: 已完成
- Objective: 建立模块边界、最小契约、开发骨架和第一条本地竖切链路
- Acceptance: 工程文档存在；契约有固定样例；Markdown → 发布 → 访问测试通过

#### T1.1 — 基线文档与契约
- Status: 已完成
- Objective: 建立架构、组件、工作包、集成门槛和 ADR
- Acceptance: `.engineering/` 下的交付文档存在，C-001–C-004 有 owner、兼容性和验证方式
- Evidence: `.engineering/architecture-baseline.md`, `.engineering/delivery-plan.md`

#### T1.2 — 本地发布适配器
- Status: 已完成
- Objective: 提供与未来 Worker/R2/D1 语义一致的内存发布服务和 viewer
- Acceptance: 首发、revision、幂等键、稳定 URL、当前内容读取和路径校验可运行
- Evidence: `src/publish/in-memory-publisher.ts`, `src/publish/local-viewer.ts`

#### T1.3 — 第一条竖切测试
- Status: 已完成
- Objective: 验证 Markdown → PublishBundle → Publish → Viewer 的最小链路
- Acceptance: 三个本地测试通过，demo 返回 HTTP 200
- Evidence: `npm test`, `npm run demo`, `tests/publish-flow.test.ts`

### T2 — Obsidian 内容编译器
- Status: 进行中
- Objective: 将单个根笔记及可选引用页面转换为确定性的多页面网站资源，并为原生渲染不可用时提供纯编译回退
- Acceptance: 基础 Markdown、WikiLink、相对 Markdown 文档链接、图片、Callout、代码块、表格和引用页面导航有测试覆盖
- Evidence: `src/compiler/markdown-renderer.ts`、`src/compiler/site-compiler.ts` 已实现；`npm test` 的 15 个测试通过，覆盖资源路径、移动目标后的相对链接、站点内重复引用去重、独立站点地址、引用页面链接、标题折叠、公开页滚动布局、超大发布请求处理、分片上传、原子提交和引用深度语义
- Children: 在 T1 通过后展开

### T3 — Cloudflare 发布服务
- Status: 未开始
- Objective: 将本地发布适配器替换为 Worker + R2 + D1 实现
- Acceptance: 发布、更新、读取、失败回滚和幂等行为在 Cloudflare 环境通过验证
- Children: 在 T1 契约冻结后展开

### T4 — Obsidian 插件交互
- Status: 进行中
- Objective: 提供设置、右键菜单、命令面板、发布状态和复制链接体验
- Acceptance: 用户完成配置后可从当前笔记触发发布，并按选项自动携带引用页面得到结果

#### T4.1 — 本地可安装插件
- Status: 已完成
- Objective: 提供 Obsidian 能加载的 manifest、main.js 和 compiler runtime
- Acceptance: `plugin/` 可直接复制到 vault 的 `.obsidian/plugins/share-publisher/`，artifact 检查通过
- Evidence: `npm run check:plugin`, `plugin/manifest.json`

#### T4.2 — 发布当前笔记
- Status: 已完成
- Objective: 从当前笔记读取 Markdown，调用 C-002 并保存稳定 siteId
- Acceptance: 真实 Obsidian vault 中完成一次首发和一次更新
- Evidence: `Share Publisher Test` 在真实 Obsidian vault 中首发和再次发布均成功；两次复用同一 siteId，页面返回 HTTP 200。随机 siteId 与引用页面递归发布已由本地测试覆盖，最新插件内容 smoke 待执行

#### T4.3 — 设置与结果反馈
- Status: 已完成
- Objective: 提供 API URL、token、发布 Notice、复制链接和打开链接
- Acceptance: 设置可保存；成功/失败状态可见；发布链接自动复制
- Evidence: Obsidian 设置页显示 API URL/token；发布成功 Notice 可见；链接写入 frontmatter 并执行自动复制

#### T4.4 — Obsidian 原生渲染快照
- Status: 已实现，待真实插件内容 smoke
- Objective: 优先调用 Obsidian MarkdownRenderer 和已注册的 Markdown 插件处理器，再提取 HTML 快照发布
- Acceptance: 原生渲染失败时自动回退；内部链接、引用资源和复选框经过发布侧规范化；公开页不继承 Obsidian 工作区的固定高度/裁切规则；Markdown 标题悬停显示折叠符号并可点击折叠；代码块复制按钮可用；可切换原生/回退渲染
- Evidence: `plugin/main.js` 的 `renderNativeMarkdown`、`compileShareWithNative`；`npm run check:plugin`、`npm test` 通过

### T5 — 集成验证与 MVP 交付
- Status: 未开始
- Objective: 完成真实插件、发布服务和 viewer 的集成验收
- Acceptance: 发布链路、更新链路、失败恢复和回归检查全部有证据
- Children: 在 T2–T4 形成可集成版本后展开

### T6 — 零星项目 / Miscellaneous
- Status: 未开始
- Objective: 收纳与主工作流无直接归属的小型独立事项
- Acceptance: 每个事项都有来源、状态、下一动作和去向
- Children: none

## 4. Current Focus

- Task: T4
- Parent path: T4
- Objective: 在 Obsidian 中安装插件并发布当前 Markdown 笔记到本地测试服务
- Next action: 在 Obsidian 中重新加载 `0.1.5` 的 Publish Note，确认设置页双语名称、Publish current note / 发布当前笔记按钮、项目仓库链接和“链接笔记深度 / Linked note depth”默认值 `1`；用指定的大型引用链笔记完成一次真实分片发布，再验证深度 `0/1/2` 和 A→B→C 的页面去重与互链

## 5. Decision Log

| Date | Decision | Rationale | Impact |
|---|---|---|---|
| 2026-09-14 | MVP 采用官方托管发布服务 | 用户无需理解 Cloudflare，发布体验最短 | 需要 Worker、R2、D1 和发布 API |
| 2026-09-14 | 内容在插件侧先编译为发布包 | 降低服务端耦合，便于本地验证和未来自托管 | 编译器与发布 API 之间需要稳定契约 |
| 2026-09-14 | 默认使用产品域名，不做自定义域名 | 自定义域名会引入 DNS、TLS 和域名验证复杂度 | 自定义域名列入后续范围 |
| 2026-09-14 | 插件优先使用 Obsidian 原生渲染并发布 HTML 快照，纯编译器保留为回退 | 复用 Obsidian 及已安装 Markdown 插件的渲染能力，减少重复实现 | 动态交互先以快照交付；回写与完整客户端运行时后置 |

## 6. Knowledge Context

- Constraints: 海外托管优先；R2 保持私有；MVP 暂不包含账号、收费、统计、搜索、评论、密码保护和主题市场。
- Dependencies: Obsidian Plugin API；Cloudflare Worker、R2、D1；产品域名和部署凭据将在 T3/T5 接入。
- Relevant files, links, or prior agreements:
  - 参考项目: https://github.com/licc168/obsidian-htmlto-link/
  - 工程契约: `.engineering/delivery-plan.md`
  - 架构基线: `.engineering/architecture-baseline.md`

## 7. Change History

| Date | Change | Reason | Affected tasks |
|---|---|---|---|
| 2026-09-14 | 创建初始任务树，确定 T1–T5 主工作流和 Miscellaneous 分类 | 用户确认按架构化交付提案开工 | T1–T6 |
| 2026-09-14 | 完成 T1 工程基线与本地竖切链路 | `npm test` 通过，3 个测试覆盖首发、幂等更新和路径安全 | T1 |
| 2026-09-14 | 开始 T4，本地插件与开发发布服务加入仓库 | 用户要求在 Obsidian 中实际测试 | T4, T3 |
| 2026-09-14 | 完成 T4.1，并验证本地 API smoke test | 插件 artifact 可加载，发布 API 返回 200，viewer 返回 HTML | T4.1, T4.2, T4.3 |
| 2026-09-14 | 修正 Obsidian 入口导出与本地依赖，完成真实笔记首发/更新验证 | 插件在 Vault 中成功加载；`Share Publisher Test` 首发与更新复用同一链接，页面 HTTP 200 | T4.1, T4.2, T4.3 |
| 2026-09-14 | 完成 T2 第一轮编译器能力，并将文件夹发布入口接入插件 artifact | 5 个本地测试通过；插件支持文件夹命令/右键、WikiLink 页面映射和引用资源采集，待真实 Obsidian smoke | T2, T4 |
| 2026-09-14 | 接入 Obsidian 原生渲染快照，失败自动回退并提供设置开关 | 让 Tasks、Dataview 等已安装插件有机会参与发布，同时保留确定性回退路径 | T2, T4 |
| 2026-09-14 | 为异步 Tasks 查询增加等待和基础 Vault 任务快照回退 | `site-0006` 的原生 Tasks 容器在提取时为空，需要确保全库任务页先可用 | T4, T5 |
| 2026-09-14 | 增加 `npm run sync:plugin` 固定同步流程 | 确保工作区代码和实际 Obsidian Vault 中的插件入口始终同步 | T4 |
| 2026-09-14 | 页面统一增加文件名标题，保留原始文件名路径并发布主题/字体 CSS 快照 | 修复页面缺少标题、链接路径不直观和字体样式未还原的问题 | T2, T4, T5 |
| 2026-09-14 | 修复原生 CSS 快照导致的公开页不可滚动，并将 Markdown 标题转换为默认展开的嵌套折叠区 | Obsidian 工作区规则把页面设为固定高度并裁切内容；用户要求按标题折叠 | T2, T4, T5 |
| 2026-09-15 | 将折叠符号改为标题悬停时显示，并在发布页 shell 中补齐代码块复制事件 | 原生快照只保留 HTML，不保留 Obsidian 的按钮监听器；用户要求折叠提示按需出现且复制按钮可用 | T2, T4, T5 |
| 2026-09-15 | 编译器按当前源文件路径解析相对 Markdown 文档链接，并增加文档移动后的回归测试 | 文件移动后 `../文档.md` 不能继续按旧页面位置解释；发布时应依据最新 Vault 文件索引重建链接 | T2, T4, T5 |
| 2026-09-15 | 将产品范围收敛为单页面分享：根页面固定为 `index.html`，siteId 改为随机不透明目录，引用页面默认递归发布到 `pages/`（后续由同目录 `page-N.html` 方案替代） | 降低入口猜测风险，符合“分享一页即可访问其上下文”的预期；文件夹不再作为分享入口 | T2, T4, T5 |
| 2026-09-15 | 确定站点内页面去重与独立地址策略：根页面为 `index.html`，引用页按规范化路径排序为同目录 `page-N.html`；不同站点不共享页面地址 | 避免同一站点重复生成被多页引用的文档，同时保持不同分享边界的隐私隔离 | T2, T4, T5 |
| 2026-09-15 | 实现站点内页面去重、同目录 `page-N.html` 路由、未包含引用的无死链降级和设置默认值修复；补充 400 错误详情诊断；插件升级至 0.1.2 并同步 Vault | `npm test` 10/10、插件检查和语法检查通过；等待真实 Obsidian 重新加载后的内容 smoke | T2, T4, T5 |
| 2026-09-15 | 定位指定笔记的超限来源：递归引用链包含 46 篇笔记、66 个附件，附件原始总量约 40.8 MB；本地发布服务上限提升至 100,000,000 字节并增加 413 契约测试，重启 8787 服务 | 11/11 测试通过；11 MB 有效发布包返回 200；等待真实 Obsidian 重新加载后用指定笔记完成约 55 MB 请求 smoke | T1.2, T2, T4, T5 |
| 2026-09-15 | 将大发布改为上传会话、约 1 MB 对象分片队列和最后原子 commit；新增 `Linked page depth`，默认 1 层，0 层表示只发布根页面 | 15/15 测试通过；HTTP 上传生命周期、分片重组、不完整上传保旧版本和深度规范化均有断言；插件升级至 0.1.3，待真实 Obsidian smoke | T1.2, T2, T4, T5 |
| 2026-09-15 | 统一插件对外文案为 Obsidian Share，补齐作者信息、作者链接、发布/打开/复制按钮和设置说明；插件升级至 0.1.4 | 清理开发占位文案，确保名称、操作入口和反馈消息在 manifest、设置页、命令面板、右键菜单、功能区和文档中一致 | T4, T5 |
| 2026-09-15 | 按用户确认将产品名改为 Publish Note，作者统一为 Jin Hefeng；设置页按钮改为明确的 Publish current note / 发布当前笔记；README、设置和项目链接改为中英文双语 | 消除按钮用途歧义，统一插件名称与作者信息，并为后续 GitHub 项目交付预留固定仓库地址 | T4, T5 |

## 8. Detail Pointers

- Format: v1 single-file
- Active branch detail: `.engineering/delivery-plan.md`
- History: none

## 9. Current Round

- Round: R1
- Frontier: T2, T3, T4, T5
- Granularity target: objective + output + acceptance + dependency
- Exit condition: 每个前沿任务都有第一份结果或明确阻塞；T1 已完成并保留证据
- Status: in progress

## 10. Technical Debt Queue

| ID | Discovered in | Debt | Why deferred | Trigger / target round | Priority | Status |
|---|---|---|---|---|---|---|
| TD-001 | T1 | 将当前最小 Markdown 编译器升级为完整 Obsidian Markdown 语义 | 不阻塞第一条发布竖切链路 | T2 | P1 | queued |
| TD-002 | T1 | 引入正式 TypeScript 构建与 Obsidian 打包工具链 | 当前运行时可直接执行 TypeScript，先验证契约 | T4 | P1 | queued |

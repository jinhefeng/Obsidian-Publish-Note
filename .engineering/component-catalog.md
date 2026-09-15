# Component Catalog: Obsidian 网站发布 MVP

| `component_id` | Capability | Owner | Consumers | Public interface | Maturity | Decision | Migration |
|---|---|---|---|---|---|---|---|
| CMP-001 | Markdown → HTML 编译 | T2 | Obsidian Plugin, local tests | `compileShare(input): PublishBundle`, `compileNote(input): PublishBundle` | validated local | create | `compileShare` 接收根笔记和可选引用页面，站点内去重后输出 `index.html` 与同目录 `page-N.html` 路由；`src/compiler/markdown-renderer.ts` 保持纯函数；插件 artifact 暂以自包含 runtime mirror，后续接入正式构建 |
| CMP-002 | 发布包契约 | T1 | Compiler, Publish API, tests | `PublishBundle`, `PublishRequest`, `PublishResult` | frozen for MVP | create | 使用 `formatVersion: 1`；破坏性变更需新版本 |
| CMP-003 | 发布客户端 | T4 | Obsidian Plugin | `publish(request): Promise<PublishResult>` | proposed | create | 本地测试先使用内存适配器，真实 Worker 实现保持相同契约 |
| CMP-004 | 发布服务 | T3 | Plugin, Viewer | `/v1/sites`, `/v1/sites/{siteId}` | proposed | create | 先做本地内存服务，再替换为 Worker handler |
| CMP-005 | 资源存储适配器 | T3 | Publish API, Viewer | `putRevision`, `getCurrent`, `commitRevision` | first vertical slice | create | 内存实现用于测试；生产实现映射 R2/D1 |
| CMP-006 | 站点 Viewer | T3 | Browser, integration tests | `GET /s/{siteId}/{path}` | first vertical slice | create | 本地 viewer 先验证路由规则，再实现 Worker fetch |
| CMP-007 | Obsidian 交互层 | T4 | Obsidian users | commands, menus, settings | proposed | create | 参考 `obsidian-htmlto-link` 的交互，不复制其服务耦合 |
| CMP-008 | Obsidian 原生渲染快照 | T4 | Obsidian Plugin, Publish API | `renderNativeMarkdown(plugin, markdown, sourcePath, context): Promise<{html, styles}>` | first implementation | create | 在隐藏容器中调用 `MarkdownRenderer`，等待动态块，提取 HTML、主题/插件 CSS 和计算字体样式，规范化链接/资源/复选框，剥离工作区布局类并将标题组织为原生 `<details>/<summary>` 后发布；发布页 shell 负责标题悬停折叠符号和代码块复制事件；失败回退 CMP-001 |
| CMP-009 | 发布上传队列 | T4 | Obsidian Plugin, Publish API | `createUploadChunks(bundle): PublishUploadChunk[]`; `/v1/sites/uploads`, `/v1/uploads/{uploadId}/chunks`, `/commit` | first implementation | create | 页面和附件按约 1 MB 字符块逐个上传；服务端保存未提交会话，所有块完整后才生成 revision；重复块和重复 commit 可安全重试；后续 Worker/R2 实现沿用 C-005 |

## Reuse decisions

- `obsidian-htmlto-link` 的 UI 交互属于外部参考，不直接复制代码；当前仓库为空，也没有可合法复用的内部组件。
- 编译器、发布服务和存储适配器分别拥有不同生命周期，因此不抽取为一个“大而全”的共享模块。
- `src/compiler/markdown-renderer.ts` 是根笔记/引用页面编译共享的纯渲染核心；`site-compiler.ts` 负责 bundle 组装、页面路径和导航。
- `plugin/main.js` 当前保持自包含，避免 Obsidian 对本地 sibling runtime 的加载差异；`plugin/compiler.js` 作为可读参考，二者必须通过同一组 fixtures 校验。两者都使用 `compileShare`，不再提供文件夹分享入口。
- 内存存储不是生产组件，而是 C-003 的验证替身；它的接口刻意与 R2/D1 适配器一致，减少集成风险。
- 原生渲染是插件内的运行时能力，不改变 C-001；其输出仍需包装成 `PublishBundle`，并将动态行为按快照处理。

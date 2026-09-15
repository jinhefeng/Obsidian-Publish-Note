# Integration Checklist: Obsidian 网站发布 MVP

## Contract gate

- [x] 必要契约已列出并指定 owner。
- [x] Publish Bundle 有固定版本和路径约束。
- [x] 发布 API 的成功、错误、幂等和更新行为已记录。
- [x] revision/current 指针和回滚语义已记录。
- [x] 大发布包使用 C-005 分片上传和最后原子提交，分片/提交失败不会切换旧 revision。

## Work-package gate

- [x] 每个已完成工作包都有验收证据。
- [x] WP-001 的本地契约和竖切测试通过。
- [ ] 真实 Cloudflare 工作包尚未开始。
- [x] 当前工作包之间没有未解决的写入冲突。

## Migration and compatibility gate

- [x] 本地内存存储与生产存储之间使用同一最小适配器语义。
- [x] revision 提交要求资源完整后再切换 current。
- [x] 重复幂等键不会创建新的站点结果。
- [ ] R2/D1 的生产写入、观测、停止条件和恢复证据待 WP-003。

## Cross-package gate

- [x] Compiler → Publish API 的 bundle shape 有测试。
- [x] Plugin → Publish API 的上传会话、分片、commit HTTP 生命周期有测试。
- [x] 编译器 fixtures 覆盖 callout、table、task、WikiLink、相对 Markdown 文档链接、图片资源和引用页面导航。
- [x] 同一分享站点内重复引用只生成一个 `page-N.html`，不同站点各自维护页面地址。
- [x] 编译器 fixture 覆盖标题折叠结构、悬停折叠符号、代码块复制按钮和公开页可滚动布局。
- [x] Publish API → Viewer 的随机 siteId/path 关系有测试，根页面使用 `index.html`。
- [x] 引用页面直接位于站点目录下，页面编号按规范化源路径排序。
- [ ] 真实 Worker HTTP 请求尚未验证。
- [x] Obsidian Plugin 已接入本地测试服务。
- [x] 本地插件 artifact 包含 `manifest.json`、`main.js` 和 compiler runtime。
- [x] 真实 Obsidian vault 中的加载、当前笔记首发/更新和 frontmatter 回写已验证。

## Regression and recovery gate

- [x] 本地首发、重复发布、更新和 viewer 读取纳入测试。
- [x] 纯编译器页面布局回归覆盖工作区 CSS 快照的固定高度/overflow 冲突；标题折叠不依赖脚本，代码块复制由页面 shell 事件处理。
- [ ] 真实 Obsidian 原生快照重新发布后，确认长页面可滚动且标题折叠可用。
- [x] 本地 HTTP 发布接口和 `/s/{siteId}/` viewer smoke test 通过。
- [x] 小块队列上传和不完整上传保留旧 revision 的测试通过。
- [ ] 失败提交保留旧 revision 的测试待补充异常注入后完成。
- [ ] 真实部署回滚步骤待 WP-003/WP-005。

## Evidence

- Local contract/e2e fixture: `tests/publish-flow.test.ts`
- Runtime implementation: `src/compiler/site-compiler.ts`, `src/publish/in-memory-publisher.ts`, `src/publish/local-viewer.ts`
- Compiler renderer: `src/compiler/markdown-renderer.ts`
- Obsidian smoke note: `Share Publisher Test.md`（真实 Vault，已验证当前笔记首发/更新；最新随机 siteId 和引用页面默认开关待重新 smoke）

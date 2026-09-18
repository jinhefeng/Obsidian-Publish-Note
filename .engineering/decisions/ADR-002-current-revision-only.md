# ADR-002: 只保留 current revision

- Status: accepted
- Date: 2026-09-15
- Context: 发布更新必须保留稳定 URL，但首版不提供历史版本、回滚和版本浏览；历史对象还会重复占用配额。
- Decision: 每次上传写入不可变 revision 前缀，全部对象校验后在 D1 transaction 中切换 `sites.current_revision`。提交后删除旧 revision 的 D1 索引和内容：官方 R2 Worker 删除旧 R2 对象，个人 D1-only Worker 删除旧 BLOB 行；失败或不完整上传永远不改变 current。
- Consequences: 存储和配额模型简单，Viewer 只查 current；未来若要回滚必须新增历史 revision 保留策略和 UI，不能在本 ADR 语义上偷偷恢复。
- Verification: MemoryStorage、D1 batch 语句、上传不完整和更新测试。

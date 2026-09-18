# ADR-004: 50MB/10 Note 配额

- Status: accepted
- Date: 2026-09-15
- Context: 官方托管需要可预测的成本边界，并且大发布包不能依赖单个 JSON 请求。
- Decision: 每个账户最多保存 50MB 当前页面、附件和 CSS，最多 10 个 Note。上传分片不计入最终容量但有 24 小时会话 TTL；开始和提交阶段都按“其他站点占用 + 新 revision”校验，超限返回 `413 QUOTA_EXCEEDED`，站点数超限返回 `LIMIT_EXCEEDED`。删除立即生效且无回收站。
- Consequences: 约 55MB 的测试笔记不能发布到官方服务；用户需减少附件或使用自部署实例。自部署默认复用同一限制，部署者可在配置层调整但插件仍显示服务返回的实际错误。
- Verification: quota admission、更新替换、站点上限、删除和错误映射测试。

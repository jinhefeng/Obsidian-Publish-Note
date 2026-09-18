# ADR-001: Cloudflare 官方托管与用户自部署双模式

- Status: accepted
- Date: 2026-09-15
- Context: 产品要让 Obsidian 用户通过一次发布操作获得公开链接，同时为需要数据主权的用户提供低操作成本的 Cloudflare 自部署路径。
- Decision: 首版同时支持官方托管 Worker 和用户自部署 Worker。两者共用 portable Publish/Auth Core、C-005 protocol v2、D1 数据模型和 `/s/{siteId}` Viewer。官方模式可使用私有 R2 对象模型，并由官方控制面管理账户/设备/Token/配额/租户；自部署模式由 Obsidian 桌面插件通过 Cloudflare OAuth/API 直接创建 Worker/D1，以 D1 BLOB 保存内容，并以一次性 `BOOTSTRAP_SECRET` 初始化第一个账户。
- Alternatives:
  - 仅官方托管：操作最少，但不能满足数据主权需求。
  - GitHub Pages/Vercel：依赖第三方授权和部署项目，无法保持一键发布体验。
  - 公开 R2：实现简单，但不利于访问控制、删除和未来密码保护。
- Consequences:
  - 正面：官方用户无需 Cloudflare 账户；自部署用户通过一个按钮获得自己的 Worker 和 D1，不必开通 R2；两种模式不产生两套业务逻辑。
  - 代价：项目需要承担官方托管成本、滥用治理、生产鉴权和自部署文档维护；真实生产域名与凭据仍需部署环境接入。
- Affected packages/components: WP-001, WP-002, WP-003, WP-004, WP-005; CMP-002–CMP-007
- Verification: 先通过本地内存发布服务验证契约和 revision 语义，再分别在官方 Worker + R2 + D1 与个人 Worker + D1-only 环境完成发布/访问 smoke test。

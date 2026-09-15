# ADR-001: MVP 使用官方托管 Cloudflare 发布服务

- Status: accepted
- Date: 2026-09-14
- Context: 产品要让 Obsidian 用户通过一次发布操作获得公开链接。让每个用户配置自己的 Cloudflare 会增加账号、Token、R2、Worker 和域名配置成本，不利于验证核心体验。
- Decision: MVP 采用官方托管的 Cloudflare Worker + 私有 R2 + D1。插件在本地编译发布包，Worker 负责鉴权、站点元数据、revision 提交和网页访问。用户默认使用产品域名 `/s/{siteId}`，暂不支持自定义域名和 BYOC。
- Alternatives:
  - 用户自带 Cloudflare：数据主权更强，但首次配置复杂，留作后续高级模式。
  - GitHub Pages/Vercel：依赖第三方授权和部署项目，无法保持一键发布体验。
  - 公开 R2：实现简单，但不利于访问控制、删除和未来密码保护。
- Consequences:
  - 正面：用户体验短；部署成本低；网页访问可通过 Worker 统一控制；内容不需要经过独立的应用服务器编译。
  - 代价：项目需要承担托管成本、滥用治理和发布 API 鉴权；生产域名和令牌签发方式必须在 WP-003 前确定。
- Affected packages/components: WP-001, WP-002, WP-003, WP-004, WP-005; CMP-002–CMP-007
- Verification: 先通过本地内存发布服务验证契约和 revision 语义，再在 Worker + R2 + D1 环境完成发布/访问 smoke test。

# ADR-003: 设备授权与一次性 bootstrap secret

- Status: accepted
- Date: 2026-09-15
- Context: Obsidian 插件不应要求用户复制 Cloudflare 管理 Token；自部署又不能允许第一个访问者抢先创建管理员。
- Decision: 插件请求 10 分钟、单次设备码并打开浏览器连接页；用户在控制台登录后批准，轮询只返回一次新的 `pn_` Publish Token。数据库只保存 Token 哈希。自部署 `/setup` 必须验证 `BOOTSTRAP_SECRET`，成功后原子消费且不可再次使用。账户恢复使用只显示一次的恢复码，不做邮箱验证。
- Consequences: 插件操作最少，Cloudflare 管理权限不进入插件；用户必须保管恢复码和初始化 secret，丢失后首版不提供邮箱找回。
- Verification: 设备重复 poll、过期、拒绝、恢复码重复使用和 bootstrap state 测试。

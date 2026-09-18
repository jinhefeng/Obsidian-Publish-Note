# ADR-005: 官方控制面与个人部署直连 Cloudflare

## Context

One-Click Publish 同时支持官方托管和用户自己的 Cloudflare Worker。官方托管需要统一的账户、设备授权、Publish Token、配额和租户隔离；个人部署则要求数据和资源归用户所有，并且不应因为部署动作依赖项目方的 provisioning control plane。个人账户启用 R2 可能要求订阅，因此一键个人部署不能把 R2 作为前提。

## Decision

- 官方模式继续使用 `server/worker` 的控制面：`/v1/auth/device/start`、`poll`、`approve` 负责连接官方服务，官方 Worker 负责账户、Token、配额和租户隔离。
- 个人模式由 Obsidian 桌面插件直接执行 Cloudflare Authorization Code + S256 PKCE。插件使用公开 OAuth Client，不携带 `client_secret`，回调固定为 `http://127.0.0.1:8976/oauth/callback`，并验证 state、单次消费和超时。
- 插件直接调用 Cloudflare API，按固定顺序检查唯一账户和 Worker/D1 冲突，创建 D1 和 Worker，上传内嵌且版本匹配的 bundle/migration，写入一次性 `BOOTSTRAP_SECRET`，调用目标 Worker 的内部初始化接口，删除 secret，最后撤销 OAuth access token。个人 Worker 只绑定 `DB`；不创建 R2 bucket，也不请求 R2 OAuth scope。
- `CloudflareD1R2Storage` 在缺少 `CONTENTS` binding 时把每个内容分片写入 D1 BLOB；个人上传分片固定为 1 MB，单对象上限 20 MB，以留出 Workers Free 的 D1 查询余量。官方 Worker 仍可绑定私有 R2，并继续使用原有 R2 分片路径。
- 目标 Worker 通过一次性 `BOOTSTRAP_SECRET` 与 10 分钟 HMAC claim 创建单用户空间和 Publish Token。

OAuth access token 只在部署期间保存在插件内存，不写入 Vault、设置、日志或 frontmatter；成功后只保存 Worker URL 和受限 Publish Token。任何失败只清理本次创建的资源，不覆盖已有资源或已有可用配置。控制面不提供通用 Cloudflare API 代理。

`server/provisioner`、`wrangler.provisioner.jsonc` 和 provisioning D1 在兼容窗口内保留，但标记为 legacy，不进入新的个人部署默认流程。Deploy Button、Wrangler 和手动 `/setup` 仍是高级备用方案。

## Consequences

### 0.2.8 transport and connection lifecycle

- All deployment requests use Obsidian `requestUrl`; Worker multipart is encoded as UTF-8 `ArrayBuffer`, with explicit boundary and module MIME type. Cloudflare failures retain safe stage/method/route/status/code metadata; neither raw request/response bodies nor provider messages are logged.
- Read requests retry at most twice. Ordinary requests have a 30-second wait deadline, Worker uploads 90 seconds. A deadline does not cancel `requestUrl`: unknown writes stop the workflow, do not commit configuration, and are not automatically retried or falsely reported as rolled back. Late OAuth exchange results are revoked.
- Worker activation sends `enabled: true`; D1 query results are validated; a read-only health check precedes exactly one initialization claim. Confirmed failures clean only this attempt's resources, Worker before D1. Unknown writes and failed cleanup are explicitly reported.
- Deployment and official authorization progress remain in memory. Completed connections are persisted together; `connectionProfiles` is one JSON string containing complete `self` and `official` URL/token pairs, alongside legacy compatibility fields. `deploymentManaged` is read only for migration. Loading derives ready/connected state from credentials, never from another device's progress.
- External settings changes, foreground events and publishing reload configuration. Each publish pins a connection snapshot for its full upload/commit lifecycle. Existing connections are selectable on desktop/mobile without new OAuth. No pairing service is introduced; Vault plugin-settings sync is required.
- Public distribution additionally requires OAuth client visibility `public`, separately from PKCE token endpoint authentication `none`; private visibility only permits the client owner's account members. Real external-account authorization is a release gate.

- 个人部署首期只能在 Obsidian 桌面版完成；部署后的 Worker URL 和 Publish Token 可随 Vault 设置同步，移动版直接发布。
- D1-only 对普通笔记、引用页面和常见图片没有行为差异；超过 20 MB 的单个附件会被明确拒绝，个人大文件/高流量场景可选择高级 R2 方案。
- 官方控制面不可用不影响已经配置好的个人 Worker；个人部署也不消耗官方服务配额。
- 插件在部署期间短暂持有用户的高权限 OAuth access token，因此必须坚持最小 scope、PKCE、loopback 回调、内存生命周期、失败清理和 revoke。
- 发布版本必须把 target Worker bundle、migration 和插件版本一起构建，避免客户端部署出与插件契约不一致的 Worker。
- 真实验收需要公开 OAuth Client ID、Cloudflare 账户和桌面 Obsidian smoke；不需要 provisioning D1 或外部 bundle host。

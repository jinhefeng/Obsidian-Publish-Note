# Manual Test Findings

## 2026-09-17 — Obsidian settings / Cloudflare one-click deployment

Environment: Obsidian 1.13.7, Publish Note 0.2.1, the current Home vault, and the synced plugin artifact.

### CF-UI-001 — Obsidian kept a stale English credential label before reload

- Reproduction: sync the updated plugin artifact while Obsidian is still running, then open Settings → Publish Note and switch the language selector to English before reloading Obsidian.
- Observed: the running plugin view still displayed the old `Access token` label, even though both the source bundle and active synced artifact already contained `Publish Token`.
- Expected: the field is the Publish Note credential and must be labelled `Publish Token` in both languages.
- Resolution: reload Obsidian after `npm run update:plugin`; request/storage compatibility remains unchanged.
- Verification: after reload, the real settings page displays `Publish Token` and no longer displays `Access token`.

### CF-UI-002 — Legacy control-plane finding superseded

- Historical reproduction: the earlier plugin attempted to use `controlPlaneUrl` and showed a provisioning endpoint configuration error before Cloudflare authorization.
- Resolution: superseded by the direct desktop flow. The current plugin ignores the legacy endpoint, opens the loopback PKCE callback, calls Cloudflare OAuth/API directly, and never requests `/v1/cloudflare/provision/*`.
- Classification: retained as migration evidence only; it is not a current deployment prerequisite.

### CF-UI-003 — Historical Cloudflare publishing choices (superseded)

- Historical reproduction: reload Obsidian, open Settings → Publish Note, and inspect the Cloudflare section.
- Historical observation: the page showed `部署到我的 Cloudflare` and `连接到官方 Cloudflare` as mutually exclusive choices. Service URL, Publish Token, connection status, and deployment status were not separate settings rows.
- Superseded in plugin 0.2.14: the current settings page exposes only personal deployment. The official connection remains a planned path; legacy configuration is still readable for compatibility.

### CF-UI-004 — Loopback OAuth callback is a temporary desktop listener

- Observation: after authorization, Chrome reached `http://127.0.0.1:8976/oauth/callback` and displayed the callback acknowledgement page. The listener is created by the Obsidian desktop plugin only for the current OAuth attempt and is closed after the code is received; it is not a deployed or public Publish Note Web service.
- Boundary: the browser callback only returns the authorization code to the local plugin. Worker/D1 creation, migration, and target initialization happen afterward through Cloudflare API calls.
- Follow-up: the deployment settings copy now explains this local callback explicitly, and the account list request uses Cloudflare's supported maximum page size of 50.

## 2026-09-18 — Personal deployment storage decision

- Observation: a real direct OAuth attempt reached Cloudflare resource provisioning and was rejected because the account had not enabled R2.
- Decision: personal deployment now creates only Worker and D1, stores 1 MB content chunks in D1 BLOBs, and does not request an R2 OAuth scope or create an R2 bucket. Official hosted storage remains independently capable of using private R2.
- Limit: personal D1-only Worker rejects individual files larger than 20 MB; the normal note, linked-page, image, token-sync, and mobile-after-setup workflow is unchanged.

## 2026-09-18 — 0.2.11 D1 commit failure (T3 / T4.6 / T5.1)

- User evidence: upload-session creation and three chunk POSTs succeeded with HTTP 200; `/v1/uploads/:upload/commit` returned HTTP 500 `INTERNAL_ERROR`. This is a server commit failure, not a missing D1 database or a rejected Publish Token.
- Root cause: the Workers D1 binding reads BLOB columns as `number[]`. `d1BlobBytes` accepted only ArrayBuffer and typed views, so commit rejected the stored upload data. Duplicate-chunk checks and public viewer reads shared the same defect. See [D1 type conversion](https://developers.cloudflare.com/d1/worker-api/#type-conversion).
- Reproduction: change the node:sqlite adapter to serialize BLOB reads into ordinary arrays, matching D1. The pre-fix D1-only test fails at `listUploadChunks` with `Stored upload object is missing`, status 500.
- Fix: validate every array element as an integer byte before creating a Uint8Array; retain typed-view compatibility and reject malformed/missing values. No schema migration or resource recreation is needed.
- Regression: cover the HTTP start → three chunks → commit flow, duplicate chunks, repeated commit, non-ASCII HTML, binary bytes including 0/128/255, empty objects, revision updates at the same URL, current-revision cleanup, and malformed BLOBs. Update the preexisting deployment assertion to account for sanitized log persistence after the single connection commit.
- Code verification: 63/63 tests pass with localhost permission; `check:plugin`, `check:worker`, `node --check plugin/main.js`, and `git diff --check` pass. Built-in Worker/migration artifact `8677a1175f8c411b` is packaged with plugin 0.2.11.
- Desktop installation: `npm run update:plugin` completed with authorized Vault-directory access; installed runtime hash matches source. Obsidian shows Publish Note 0.2.11, and the plugin was disabled/re-enabled to load the new code. Configuration and credentials were not replaced.
- Existing remote Worker: Cloudflare's editor confirmed the same defective helper. Applied only its array-decoding branch to `publish-note`; active deployment changed from `c0ad7f81` to `fa4bf22a`. Existing D1 binding, data, account and Publish Token were preserved. `GET /healthz` returned `status: ok`, `storage: cloudflare-d1`. Updating the plugin artifact alone would not update an existing Worker.
- Settings smoke: after reload, the actual Obsidian settings page retains the selected personal connection (`已连接`), Debug mode, prior diagnostic records and copy-log button. No new authorization or deployment was triggered.

## 2026-09-18 — Statusless publish network failure (T4.3 / T5.1)

- User evidence: at 06:20, two independent `POST /v1/sites/uploads` attempts waited 10045 ms and 10017 ms, then failed with `httpStatus: 0`, `NETWORK_ERROR`; neither attempt received a response content type, provider code, or HTTP status. The failure occurred before Worker routing, D1 access, token validation, or upload creation.
- Conclusion: the existing log cannot distinguish DNS resolution, TLS/proxy failure, Obsidian `requestUrl` timeout, or a temporary local network interruption. It is not evidence of a D1 or commit failure.
- Diagnostic change: plugin 0.2.12 records only safe transport metadata in Debug mode: `transport=obsidian.requestUrl`, Worker origin, `errorName`, `errorCode`, sanitized `errorMessage`, authentication-header presence, request byte length, stage, route, status and duration. Token, request body, note content and query secrets remain excluded.
- Next verification: after installing 0.2.12, enable Debug mode and retry once. The resulting `errorCode`/`errorMessage` will identify the transport failure class; if no error code is returned, compare the Worker health endpoint from the same machine and inspect whether the request is blocked before reaching Cloudflare.
- Runtime acceptance: real desktop publish/update is pending consent to publish a synthetic test note; mobile and fresh-Vault deployment remain unverified. Do not mark T5.1 complete from Node tests or deployment status alone.

## 2026-09-18 — Native-rendered stylesheet asset encoding (T4.2 / T4.3 / T5.1)

- User evidence: upload-session creation and all three chunk requests returned HTTP 200; `/v1/uploads/:upload/commit` returned HTTP 400 `BAD_REQUEST: Assets must use base64 chunks`. The Debug fields show the requests reached the Worker with an accepted authorization header, so this is not a network, D1, or token-rejection failure.
- Root cause: the native Obsidian renderer appended `assets/obsidian-snapshot.css` as an asset with `encoding: "utf8"`. The Worker commit contract requires every asset object to use base64; the regular Vault asset collector already followed that contract.
- Fix: plugin 0.2.13 encodes the generated stylesheet's UTF-8 bytes as base64 before chunking. The Worker contract remains strict so existing binary assets keep the same behavior.
- Regression: add a non-ASCII stylesheet encoding test. After a full Obsidian reload, the synthetic note `Publish Note 0.2.13 Smoke Test` published successfully to the existing personal Worker at 06:42:55, received a stable `/s/<siteId>/` URL, and wrote `share_site_id`, `share_link`, and `share_updated` frontmatter. The first retry before a full app reload still used the old in-memory plugin instance and reproduced the old error; this is why `npm run update:plugin` must be followed by a complete Obsidian reload during development.

## 2026-09-18 — Personal-only settings and debug visibility (T4.3 / T4.5)

- Plugin 0.2.14 removes the official Cloudflare connection row and action from the settings page. Existing legacy official-service fields remain readable for compatibility, but the official path is now explicitly planned rather than an active user flow.
- Deployment and debug log panels render only when Debug mode is enabled. The Debug mode setting is immediately above the project repository link.
- Source regression tests assert that the official action is absent, logs are gated by `debugMode`, and the settings order is native renderer → Debug mode → project repository.

# SH2 evidence log

- Worktree: independent Codex worktree
- Branch: `codex/selfhost-productization`
- Baseline revision: `c5a84d87`
- Date: 2026-10-17
- Scope: self-host optional capabilities and no-cloud startup

## Implemented contract

- 新增全局 runtime capability registry，匿名状态端点为
  `GET /api/runtime/capabilities`；输出仅包含 provider、状态、稳定 code、缺失字段名和认证方式，
  不返回 secret value。
- required 能力（PostgreSQL、storage、local authentication）在自托管启动期 fail fast；optional
  能力使用 `enabled`、`disabled`、`not_configured`、`misconfigured` 四态表达。
- 新增稳定业务码 `CAPABILITY_DISABLED`（10024）和
  `CAPABILITY_MISCONFIGURED`（10025），HTTP 状态均为 503。
- Core Local 不从遗留商业凭据推断 provider；AI、SMTP、billing、telemetry、weather、
  通用 third-party sync、agent API、public demo 和 social auth 默认关闭。用户级 Intervals.icu
  personal API Key 作为窄 capability 单独开放，不启用 OAuth 或 webhook。
- AI client 延迟构造；支持显式 `custom-openai-compatible` provider。自托管 BYOK AI 且
  billing 关闭时采用 operator-funded 语义：保留 action、usage、幂等与 settlement 记录，
  不创建 SaaS 订阅、积分消耗或欠费。
- OAuth/social/third-party provider 按 capability 与完整凭据组条件注册；controller、worker、
  cron 和账户删除清理路径均有服务端 capability boundary。
- Langfuse、PostHog、Google Analytics、Sentry、billing webhook、WeatherKit 和第三方 webhook bootstrap
  在自托管环境均需显式启用；禁用状态不执行远程调用。docs 站点使用与 client 相同的 self-host build marker，
  默认移除遥测初始化、Sentry tunnel 和遥测 CSP origin，且不发送默认 PII。
- Web 与 mobile 导航、AI 路由、第三方连接、订阅购买、social login、email verification 和
  password reset 入口按服务端能力状态隐藏或显示说明。
- `schemas/self-host-config.schema.json` 已覆盖 provider 分组校验、secret 标记和 Core Local
  禁用约束。

## Verification

### Focused server regression

执行 20 个 capability、AI、billing、weather、worker、import、账户删除和 DI 回归套件：

```text
pnpm --dir server test -- --runInBand <20 SH2 spec files>

Test Suites: 20 passed, 20 total
Tests:       133 passed, 133 total
Snapshots:   0 total
```

配置 schema、第三方 webhook 默认值和业务错误映射另行回归：

```text
pnpm --dir server test -- --runInBand \
  src/config/spec/self-host-config-schema.spec.ts \
  src/config/spec/third-party-webhook-bootstrap-config.spec.ts \
  src/filters/spec/business-exception.filter.spec.ts

Test Suites: 3 passed, 3 total
Tests:       16 passed, 16 total
```

覆盖的关键行为包括：

- Core Local 无商业凭据的 capability snapshot；
- required 配置启动失败、optional 配置降级和 secret-free diagnostics；
- disabled AI/mail/maps/weather/billing/sync 不调用 provider；
- custom OpenAI-compatible provider；
- operator-funded AI 不走 membership credit/debt；
- account deletion、remote import、Garmin、COROS 和自动导出不会绕过 capability boundary；
- 既有 managed 模式默认行为和 Nest module DI 保持可用。

### Client visibility regression

```text
pnpm --dir client test -- \
  src/components/Sidebar/Sidebar.test.tsx \
  src/components/mobile-app/components/MobileMeMembershipPanel.test.tsx \
  src/components/mobile-app/components/MobileTabBar.test.tsx \
  src/components/premium/vip-pricing-dialog.test.tsx

Test Files  4 passed (4)
Tests       20 passed (20)
```

### Docs telemetry and runtime boundary regression

2026-10-18 扩展发货代码 inventory 后发现 docs 根 Sentry 配置仍包含固定 DSN，layout 又读取不会被浏览器构建正确内联的
`SELF_HOST_MODE`，使 Core Local docs 可能初始化 Google Analytics、PostHog 或 Sentry。修复后：

```text
pnpm --dir docs test
Test Files  122 passed (122)
Tests       662 passed (662)

node --test scripts/selfhost/docs-telemetry-contract.test.mjs \
  scripts/selfhost/docs-runtime-contract.test.mjs
Tests       2 passed (2)
```

Node 22、Webpack、单 worker、3 GB heap 的 Core Local production build 成功生成 1,010 个页面；实际
`routes-manifest.json` 只允许 `connect-src 'self'` 与 `frame-src 'self'`，完整构建目录不存在原固定 Sentry DSN。
standalone 产物的回环实测确认 docs 同源代理只接受 `/public/*`，不转发浏览器 Cookie、不回传上游 `Set-Cookie`，
并通过运行时 `DOCS_INTERNAL_API_URL` 到达容器内 server。

### Type and production builds

```text
NODE_OPTIONS=--max-old-space-size=8192 pnpm --dir server exec tsc --noEmit --pretty false
exit 0

pnpm --dir client typecheck
exit 0

NODE_OPTIONS=--max-old-space-size=8192 pnpm --dir server build
exit 0

pnpm --dir client build
exit 0
```

### Minimal production-process probe

以空环境启动 production server，仅注入 Core Local required 配置，并显式设置所有 optional
provider 为 `none` / `false`。结果：

- Nest module graph、LOCAL storage、capability registry 和 worker lifecycle 均成功初始化；
- 未出现 R2、Mapbox、SMTP、AI、billing、telemetry、weather 或 third-party 凭据错误；
- 唯一启动失败是探针刻意指向 `127.0.0.1:59999` 后 PostgreSQL 不可达；
- 启动失败后 Nest app、worker 和 DuckDB 正常关闭。

这证明原基线 `B-SH2-001`（AI constructor-time missing credentials）和 `B-SH2-002`
（默认启动 Langfuse）已经消除，但不能替代真实数据库和浏览器核心旅程。

## Stage gates

| Gate                                                    | Status            | Evidence / blocker                                                       |
| ------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| capability registry and secret-free status              | PASS              | resolver/service/controller tests；schemaVersion 1                       |
| required/optional grouped validation                    | PASS              | resolver + JSON Schema regression                                        |
| stable disabled/misconfigured error codes               | PASS              | guard/filter regression；10024/10025                                     |
| optional providers do not initialize or call when off   | PASS              | focused provider/worker/controller tests + apps/server/docs production probes |
| managed behavior remains available                      | PASS              | resolver managed defaults、DI、billing/AI regressions                    |
| Web/mobile feature visibility follows server capability | PASS              | 4 client files / 20 tests                                                |
| Core Local production process reaches database boundary | PASS              | no commercial credential error before intentional PostgreSQL refusal     |
| Core Local complete user journey with clean PostgreSQL  | BLOCKED ON RUNNER | current host has no Docker CLI; blocker `B-SH0-001` remains              |
| container recreate persistence                          | BLOCKED ON RUNNER | same blocker; must be executed by Docker-capable clean-room/CI runner    |

因此 SH2 的代码交付和可在当前 host 验证的门禁已经完成，但 SH2 总退出门禁仍保持未通过；不得在
真实 PostgreSQL、浏览器 smoke 和 container recreate 证据补齐前声称“Core Local 核心旅程通过”。

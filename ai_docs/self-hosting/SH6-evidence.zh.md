# SH6 首次启动与权限证据

日期：2026-10-17  
revision：本阶段提交生成后以 git revision 为准。

## 交付映射

| 门禁                           | 实现/证据                                                                                                               | 状态                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| owner bootstrap                | 统一管理 CLI、stdin password、容器内 token、durable singleton、digest-only DB、advisory lock、单事务 owner + credential | 静态与单元测试通过         |
| 初始化不可重复接管             | DB state check、singleton/check/FK constraints、成功后清 token、重启读取 `READY`                                        | 静态与单元测试通过         |
| no-SMTP recovery               | 管理 CLI dry-run + stdin passthrough、同 Better Auth KDF、owner identity check、session revoke                          | 单元测试通过               |
| 邮件能力降级                   | UI 隐藏并解释；mail capability guard；Better Auth mail write path 预先拒绝                                              | 单元/类型检查通过          |
| secure cookie / trusted proxy  | host-only cookie；HTTPS Secure；HTTP local exception；self-host 仅信任 private proxy ranges                             | 单元测试通过               |
| 公网危险配置                   | origin 同源、trusted origin、bind/localhost、public HTTP、HTTPS Caddy address 校验与 LAN warning                        | 单元测试通过               |
| 默认关闭管理/internal endpoint | operations 404、mail capability、billing 独立 secret、admin report opt-in + 显式收件人                                  | 单元测试通过               |
| 容器集成                       | Compose smoke 已覆盖 claim、重放拒绝、重启、恢复、旧/新密码登录与 token 文件权限                                        | `B-SH6-001`：本机无 Docker |

## 不变量

1. 原始 token 不进入数据库、status response 或正常日志；只有本机 protected file 保存。
2. `READY` 数据行不能同时保存 token，也不能缺 owner；数据库 check constraint 是最终防线。
3. claim 在 password hash 前先做低成本 token 校验，并在锁内再次校验，避免无 token 请求滥用 KDF。
4. owner/user/account/默认静息心率/instance transition 在一个数据库事务提交。
5. 恢复只处理 singleton owner，不能把任意 email 当作管理目标；成功后撤销全部 owner session。
6. `owner-bootstrap` 与 `owner-recovery` 共用管理 CLI 的 Compose 环境隔离和 stdin 边界；宿主不读取 bootstrap token，
   密码只由容器命令继承，结果、operation record 和错误均不回显 owner identity、password 或 token。
7. owner 外键与删除 API 双层拒绝实例无主化。
8. server root filesystem 保持只读，仅新增 `data/operations` 明确持久挂载。
9. operations 目录或 token 文件出现 group/world 权限或属主异常时，旧 token 不会被复用；server 会在安全目录上轮换。
10. `.env.selfhost` 中通过管理 CLI 校验的 bootstrap token TTL 必须由 Compose 原样传入 server；契约测试拒绝配置只被接受却不生效。

## 验证命令

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
  pnpm exec prisma validate --schema packages/prisma/schema.prisma
env NODE_OPTIONS=--max-old-space-size=8192 pnpm --dir server build
pnpm --dir server test -- --runInBand \
  src/self-host/self-host-token-file.spec.ts \
  src/self-host/self-host-bootstrap.service.spec.ts \
  src/self-host/self-host-owner-recovery.spec.ts \
  src/self-host/self-host-bootstrap.migration.spec.ts \
  src/auth/self-host-mail-auth.spec.ts \
  src/bootstrap/spec/self-host-network-security.spec.ts \
  src/admin-report/spec/admin-daily-user-stats.cron.spec.ts \
  src/admin-report/spec/admin-daily-user-stats-report.service.spec.ts \
  src/api/user/spec/account-deletion.service.spec.ts \
  src/billing/spec/billing-internal.controller.spec.ts \
  src/operations/spec/operations-auth.guard.spec.ts \
  src/config/spec/self-host-config-schema.spec.ts \
  src/runtime-capabilities/runtime-capability.resolver.spec.ts
pnpm --dir client typecheck
pnpm --dir client build
pnpm selfhost:inventory
pnpm validate:deployment-config
pnpm selfhost:compose-contract
pnpm selfhost:image-supply-chain
pnpm test:selfhost-image-supply-chain
pnpm selfhost:compose-smoke -- --mode=source
```

可执行门禁结果：apps/server/client production build 通过；SH6 定向 Jest 为 15 suites / 89 tests；当前
management core 定向为 76 tests，全量 self-host Node 门禁为 317 tests。配置、Compose、镜像供应链与生成
inventory 契约均通过；变更 TS/TSX 文件的定向 ESLint 为 0 error / 0 warning。

最后一条在当前 host 稳定退出 77，并输出
`SKIP B-SH6-001 (includes unresolved B-SH5-001): Docker Engine with Compose v2 is unavailable`。
这不等价于真实容器通过。

## 阶段判断

SH6 的代码、契约、静态验证与无容器单元门禁完成；实际 Docker clean-room claim/restart/recovery smoke 尚未执行。
在保留 `B-SH6-001` 的前提下可进入 SH7 管理 CLI，但 self-host v1 总体 DoD 仍未完成。

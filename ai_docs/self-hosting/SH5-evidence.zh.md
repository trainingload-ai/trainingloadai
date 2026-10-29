# SH5 Compose 与网络入口证据

日期：2026-10-17

范围：独立 self-host Compose、一次性 migration、liveness/readiness、同源 BFF、Caddy HTTP/HTTPS、
显式数据目录、源码 build override、可选 docs profile 与最小环境示例。

结论：SH5 实现与当前主机可执行的静态、单元和构建门禁通过；SH5 clean-machine 总退出门禁仍为
`BLOCKED ON RUNNER`。当前主机没有 Docker/Podman，因此没有宣称真实 Compose 启动或 HTTPS 证书证据。
该缺口沿用 `B-SH0-001`，本阶段记为 `B-SH5-001`。

## 1. 交付映射

| 门禁                 | 实现与证据                                                                                 | 状态                        |
| -------------------- | ------------------------------------------------------------------------------------------ | --------------------------- |
| 独立 Compose         | `compose.yml` 无 production env_file、Cloudflare 或内部 secret                    | 静态通过                    |
| migration job        | 官方 PostgreSQL healthy → Prisma migrate deploy → server                                   | 单元/静态通过，容器执行阻塞 |
| readiness            | 配置 snapshot + DB `SELECT 1`；失败 503；错误脱敏                                          | 单元通过                    |
| gateway              | Caddy 唯一 mandatory host port；HTTP 默认、hostname automatic HTTPS                        | 静态通过，TLS 执行阻塞      |
| relocatable client   | 浏览器同源 BFF，SSR 私有网络；self-host cookie 按 origin scheme 决定 Secure                | 单元通过                    |
| relocatable docs     | `/api/proxy/public/*` 受限同源 BFF；运行时私有网络，不烘焙访问者后端地址                   | 单元/build/standalone 通过  |
| 持久目录             | PostgreSQL/uploads/server cache/docs cache/elevation/Caddy state 全部显式 bind 到 `data/*` | 静态通过，recreate 阻塞     |
| 最小配置             | 三个生成 secret、站点 origin、三个 release image ref；无商业凭据                           | 静态通过                    |
| optional profile     | docs 默认关闭、loopback-only port                                                          | 静态通过，容器执行阻塞      |
| source/prebuilt 路径 | 独立 build override，不改变运行拓扑                                                        | 静态通过，等价执行阻塞      |

## 2. 自动验证

```text
pnpm selfhost:compose-contract
  PASS: 6 required services, 1 optional profile

node --test scripts/selfhost/verify-compose-contract.test.mjs
  PASS: 12 tests / 0 failed（含 private upstream、secret、安全边界与受控 docs profile）

server focused
  PASS: 4 suites / 11 tests

client config focused
  PASS: 1 file / 14 tests

docs focused
  PASS: 122 files / 662 tests；production build 1,010 pages
  PASS: standalone public proxy live probe；private namespace 404
```

失败路径覆盖：

- server 未等待 migration 成功；
- PostgreSQL/Caddy 使用 mutable 或错误 digest；
- self-host Compose 引入生产 secret；
- PostgreSQL 端口直接暴露；
- application 持久 bind mount 未进入数据契约（包括 docs cache）；
- database/auth secret 进入 client；
- Caddy 关闭 upstream TLS verification；
- 环境示例复制手写 `DATABASE_URL`；
- readiness DB 错误泄漏 host 或 password；
- self-host HTTP 错误使用 Secure cookie，或 HTTPS 复用 managed 跨子域 cookie。
- docs 预构建镜像把 `localhost:3001` 烘焙到访问者浏览器，或代理开放非 `public` 后端命名空间。

## 3. 关键设计判断

1. 使用官方 plain PostgreSQL 17，而不是生产 Compose 的 PostGIS 第三方镜像。仓库 schema/migrations/source
   未使用 PostGIS、pgRouting、hstore 或 geography；为不存在的依赖扩大镜像与升级面不符合最小自托管契约。
2. migration 使用与 server 完全相同的 release image，避免“CLI schema 与运行代码来自不同版本”。
3. client 与可选 docs 的浏览器 API 固定走各自同源 BFF，而不是把站点 URL 烘焙进预构建镜像；docs BFF 仅允许
   `/public/*`，并通过 `DOCS_INTERNAL_API_URL=http://server:3001` 在运行期解析私有上游。这消除了换域名必须重建前端的
   路径依赖，也不把完整后端面额外暴露到 docs 端口。
4. 默认 `http://localhost:43210` 允许零 DNS 首启，但真实 hostname 使用 Caddy automatic HTTPS；Better Auth 的
   Secure/host-only cookie 策略跟随实际 public origin，而不是简单跟随 `NODE_ENV=production`。
5. 不把尚未实现的 tiles、observability 或 backup scheduler 填成空 profile。docs 是当前唯一真实可运行的
   optional profile；它只能由受保护的 `SELF_HOST_DOCS_ENABLED` 开关启用，CLI 会显式传入 profile 并把 docs 纳入
   readiness，不依赖隐藏的 `COMPOSE_PROFILES`。后续 profile 只有在拥有服务、数据和 doctor 契约时才加入。
6. 自定义 HTTPS 端口同时成为 host/container TCP 与 UDP target，与 Caddy 的显式 site address 一致；静态契约拒绝
   把任意 host port 固定转发到容器 443 的失配配置。

## 4. 未关闭证据

必须由 Docker-capable clean runner 补齐：

1. `docker compose ... config` 在最小 `.env.selfhost` 上成功；
2. 空数据目录首次启动，migration 恰好成功一次，所有 mandatory service healthy；
3. 注册、登录、上传、活动导入与重启后的同一数据可见；
4. kill/recreate server、client、gateway 后数据库和 uploads 不变；
5. `http://localhost:43210` cookie 登录与真实域名 HTTPS 登录；
6. Caddy certificate state 随 gateway recreate 保留；
7. source build 与 release digest 镜像跑同一 smoke；
8. amd64 与 arm64 各执行一次。

上述第 1、2、4 和 migration 幂等部分已编码为 `pnpm selfhost:compose-smoke -- --mode=source`；底层脚本在
当前主机会以 code 77 和 `B-SH5-001` 明确跳过（pnpm 会将非零 code 包装为 lifecycle failure），不把
“没有 Docker”伪装成通过。

在这些结果存在前，SH5 的 clean-machine 退出门禁保持未通过，self-host v1 Definition of Done 不能宣称完成。

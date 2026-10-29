# Self-host Compose 与网络入口

本文定义 self-host v1 的独立编排入口。`compose.yml` 不导入生产 `.env`、不复用
`docker-compose.yml`，也不要求 Cloudflare、内部 API secret 或商业 provider 凭据。

## 1. 启动拓扑

```text
PostgreSQL healthy
        ↓
Prisma migrate deploy（一次性，成功退出）
        ↓
server /api/health/ready = 2xx
        ↓
client healthy
        ↓
Caddy :80 / :443
```

Docker Compose 只保证普通依赖容器已经启动，不保证依赖已经 ready。这里显式使用
`service_healthy` 和 `service_completed_successfully`，让 schema migration 成为 API 启动的硬门，而不是
与 API 进程抢跑。该语义与 [Docker Compose 官方启动顺序文档](https://docs.docker.com/compose/how-tos/startup-order/)
一致。

Mandatory 服务只有 `permissions`、`postgres`、`migrate`、`server`、`client` 和 `gateway`。`docs`
属于 `docs` profile，默认不启动，也不参与核心 readiness。

## 2. 最小配置

源码工作树使用统一管理 CLI 初始化。CLI 会生成三个 256-bit secret（auth、数据库和第三方凭据加密）、创建并声明专用数据目录，且不会把
secret 打到终端：

```bash
pnpm self-host -- init --dry-run
pnpm self-host -- init
```

`.env.selfhost` 是 mode `0600` 的 operator secret，不得提交。重复执行 `init` 只验证并修复权限，不会轮换
已有 secret；如果 `data` 已包含不属于本产品的文件且没有专用目录 marker，初始化会在写配置前拒绝接管。
`SELF_HOST_PROJECT_NAME` 是同一 Docker Engine 上的实例 namespace，默认 `trainingload-selfhost`；第二实例或
clean restore 必须改为另一个受校验的名称，不能与源实例共享 project label。

默认地址是 `http://localhost:43210`。首次本机启动无需 DNS、TLS 或任何收费账号；源码模式显式选择 build override：

```bash
pnpm self-host -- start --source --dry-run
pnpm self-host -- start --source
```

源码 override 只改变应用镜像的取得方式：`pull_policy: build` 从当前 revision 构建
apps/server/client/docs；数据库、migration、健康顺序、网络和数据目录与预构建发行版完全相同。

预构建发行版必须把 manifest 中的精确 digest 写入三个 image 变量，再省略 build override：

```dotenv
SELF_HOST_SERVER_IMAGE=registry.example/trainingload-server@sha256:...
SELF_HOST_CLIENT_IMAGE=registry.example/trainingload-client@sha256:...
SELF_HOST_DOCS_IMAGE=registry.example/trainingload-docs@sha256:...
```

```bash
pnpm self-host -- start
```

不能使用 `latest`。tag 只用于发现，release manifest 的 digest 才是部署身份。
直接调用 `docker compose` 只用于底层开发调试，不是稳定的 operator 接口；人工文档和自动化都应调用同一
管理 CLI。

## 3. HTTP 与 HTTPS

`SELF_HOST_SITE_ADDRESS` 是应用生成 URL、校验 origin 与设置 cookie 的完整 public origin；
`SELF_HOST_GATEWAY_ADDRESS` 是 Caddy 的站点地址。默认只绑定主机 loopback，并让 Caddy 在容器内
HTTP 80 接受本机 Host：

```dotenv
# 单机首次启动
SELF_HOST_SITE_ADDRESS=http://localhost:43210
SELF_HOST_GATEWAY_ADDRESS=http://:80
SELF_HOST_HTTP_PORT=43210
SELF_HOST_HTTPS_PORT=43211

# 公网 DNS 已指向该主机，80/443 已放行
SELF_HOST_SITE_ADDRESS=https://training.example.com
SELF_HOST_GATEWAY_ADDRESS=https://training.example.com
SELF_HOST_HTTP_BIND=0.0.0.0
SELF_HOST_HTTP_PORT=80
SELF_HOST_HTTPS_BIND=0.0.0.0
SELF_HOST_HTTPS_PORT=443
```

Caddy 对显式 `http://` gateway 地址只提供 HTTP；对真实 HTTPS hostname 自动申请、续期证书并把 HTTP 重定向到
HTTPS。Caddy 官方说明 hostname 触发 automatic HTTPS，而显式 `http://` 禁用该行为；参见
[Caddy reverse proxy quick-start](https://caddyserver.com/docs/quick-starts/reverse-proxy) 与
[Caddyfile address semantics](https://caddyserver.com/docs/caddyfile/concepts)。证书状态持久化在
`data/gateway/data`，容器重建不会触发无意义的重新签发。

Gateway 只把健康检查、owner bootstrap、外部 auth/OAuth 供应商回调、MCP 和公开 uploads 直接转给 server，其余请求进入 client。
浏览器 API 与认证统一走 `/api/proxy` 同源 BFF；因此同一个预构建 client 镜像可以从 localhost 移到 LAN IP
或真实域名，无需把 operator 域名烘焙进 JavaScript bundle。Next 服务端请求使用私有
`http://server:3001`，不会 hairpin 到公网 gateway。Gateway 会覆盖写入 ingress-only 客户端 IP 头，
BFF 移除浏览器可控的后端 IP 头后才把该值转交给 server，供登录限流使用。

数据库、server 和 client 均不发布主机端口。只有 gateway 发布宿主端口，默认 HTTP/HTTPS 为
`127.0.0.1:43210` 和 `127.0.0.1:43211`；公网 HTTPS 必须像上例一样显式改 bind 和端口。可选 docs profile
默认仅绑定 `127.0.0.1:43212`，且默认关闭。只有受保护配置中的 `SELF_HOST_DOCS_ENABLED=true` 会让管理 CLI 显式加入
`--profile docs`，docs 随后成为 readiness 的必检服务；`.env.selfhost` 中的任意 `COMPOSE_*` 控制项都会被拒绝。
如果 HTTP host port 不是 80，public origin 可以带端口，而 gateway 仍用容器内
`http://:80` 监听。HTTPS 不同：`SELF_HOST_GATEWAY_ADDRESS` 与 public origin 必须完全一致；Caddy 会按其中的显式端口
监听，所以 Compose 把 `SELF_HOST_HTTPS_PORT` 同时用作 host port 与 container port（含 TCP/UDP）。例如
`https://training.example.com:8443` 必须配 `SELF_HOST_HTTPS_PORT=8443`，不能把 host 8443 固定转发到容器 443。
管理 CLI 在任何 Compose 操作前校验 public origin 的有效端口与对应 host port 一致，且拒绝
HTTP、HTTPS 或 docs listener 在相交 bind address 上复用同一端口。bind 必须是字面 IPv4/IPv6 address，
不接受会在不同 Docker/操作系统上产生歧义的 hostname。HTTP mode 的 gateway address 固定为
`http://:80`；对外非 80 端口只由 host mapping 承担，不能让 Caddy 改听容器内其他端口。

## 4. 健康语义

- `GET /api/health` 与 `GET /api/health/live`：进程 liveness，不访问外部依赖；
- `GET /api/health/ready`：同时验证 runtime capability 配置与 `SELECT 1` 数据库连接；
- readiness 失败返回 HTTP 503，只公开 `ready/unavailable`，不回显数据库 host、credential 或 driver error；
- server 启动前 migration 已成功，因此 ready 不能指向旧 schema。

检查入口：

```bash
curl --fail http://localhost:43210/api/health/ready
pnpm self-host -- status
pnpm self-host -- logs --service migrate --tail 200
```

`self-host doctor --json` 会通过配置的 public origin 请求同一 endpoint；HTTPS pass 同时表示
证书 hostname/信任链、对外端口、Caddy route 与 server readiness 均已实际通过。

完整命令、JSON schema、稳定 exit code 与 operation record 契约见
[Self-host 管理 CLI](./management-cli.zh.md)。

## 5. 数据与权限

所有 operator 数据都是 release 目录下的显式 bind mount；没有隐藏的匿名数据卷。一次性
`permissions` job 只创建声明过的 `data/*` 目录并把应用、cache 和 gateway 路径交给固定的
`10001:10001` runtime identity。PostgreSQL 仍由其官方 entrypoint 管理自身数据目录权限。

server、client、migration 和 gateway 使用只读 root filesystem、受限 `/tmp` 与
`no-new-privileges`；gateway 只保留绑定低端口所需的 `NET_BIND_SERVICE` capability。运行镜像不包含
package manager，启动过程中不会在线安装依赖。

PostgreSQL 固定为官方 `17.10-bookworm` multi-platform index digest；Caddy 固定为官方
`2.11.7-alpine` multi-platform index digest。版本与 digest 同时记录在
`docker/selfhost/compose-contract.json`，升级必须一起修改并通过契约测试。PostgreSQL 17.10 包含安全修复，
见 [PostgreSQL 17.10 release notes](https://www.postgresql.org/docs/17/release-17-10.html)；官方镜像来源分别为
[PostgreSQL Docker Official Image](https://hub.docker.com/_/postgres) 和
[Caddy Docker Official Image](https://hub.docker.com/_/caddy)。

## 6. 静态验证

```bash
pnpm selfhost:compose-contract
node --test scripts/selfhost/verify-compose-contract.test.mjs
pnpm selfhost:compose-smoke -- --mode=source
```

验证器会拒绝 migration 抢跑、mutable/unpinned 基础设施镜像、生产 secret 依赖、数据库直出端口、
client secret 注入、持久目录漂移、TLS verification 绕过和错误的源码 build override。

真实 smoke 使用随机 `SELF_HOST_PROJECT_NAME`、随机 secret、临时 `SELF_HOST_DATA_ROOT` 和非特权 host port；它不会 push
镜像或接触生产数据。脚本先验证 Compose config，再等待 PostgreSQL/migration/server/client/gateway，检查
readiness 与首页，重启 apps/server/client/gateway，二次执行 `up` 并确认完成的 migration 数量不变，最后检查
显式持久目录并清理。SH8 起，它还创建 activity/upload fixture，执行真实 streaming backup，停止源实例，再把 bundle
恢复到独立 project 和新数据目录，复核 owner 登录、activity 记录、文件字节与 readiness。失败时加
`--keep-on-failure` 才保留临时现场。

未显式保留现场时，smoke 会按逆序尝试每个测试 stack 的 stop、ownership 修复与 `down --remove-orphans`，再删除临时工作区。
清理保护从 `mkdtemp` 完成后立即生效，因此 release 物化或 `.env.selfhost` 写入失败也不会遗留 secret。所有清理都会执行；任一
非零命令或删除失败都使 smoke 失败，且测试主错误与全部清理错误通过 `AggregateError` 同时保留。

SH6 扩展 smoke 后，流程还会验证 `0600` bootstrap token、原子 owner claim、重复 claim 返回 409、
重启后仍为 `READY`、本机 no-SMTP 恢复撤销旧密码，以及新密码可登录。首次启动的人工命令、状态机和错误码见
[Self-host 首次启动、owner 与本机恢复](./first-boot-and-owner.zh.md)。

当前开发主机没有 Docker/Podman，因此 `docker compose config`、真实启动、重启、backup/restore 与 HTTPS 证书流程仍需在
clean-room runner 执行。静态通过不能替代这项证据。

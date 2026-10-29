# Self-host doctor、诊断工件与自助排障

本文定义 self-host v1 的只读诊断面。`doctor` 回答“当前实例哪里不满足契约”；`diagnostics` 在同一份
doctor 报告上生成可供支持分析的私有工件。两者不会修复状态、重启服务、拉取镜像或修改数据库。

## 1. 快速使用

在 release 目录执行：

```bash
./self-host doctor
./self-host doctor --json
./self-host diagnostics --output support-2026-10-17
./self-host diagnostics --tail 500 --service server --service client --json
```

源码工作树使用等价入口：

```bash
pnpm self-host -- doctor --json
pnpm self-host -- diagnostics --dry-run --json
```

`doctor` 在存在 blocking finding 时返回 exit 8 和 `SELF_HOST_DOCTOR_FAILED`，但不会提前退出：报告仍包含所有
可以执行的检查，无法执行的检查明确标记为 `skipped`。warning 不改变 exit code；它表示实例可继续运行，但上线、
备份或升级前仍应处理。

正式生成前先执行同参数的 `diagnostics --dry-run --json`。结果中的 `includedFields` 固定列出 `doctor`、
`configuration`、`logs`、`operations`，并明确 `operatorReviewRequired: true`；dry-run 不读取 Compose 日志，也不创建
诊断工件。

## 2. 报告契约

Doctor schema 位于 `schemas/self-host-doctor-report.schema.json`。每个 check 都有稳定字段：

- `code`：稳定检查标识，不等同于失败原因；
- `category`：release、host、configuration、security、runtime、storage、database、capability 或 recovery；
- `status`：`pass`、`warning`、`fail`、`skipped`；
- `errorCode`：失败或可操作 warning 的稳定原因码；
- `remediation.id`：自助处理路径；
- `details`：只含该检查的 allowlist 诊断字段。

`overall` 按 `fail > warning > pass` 确定，`counts` 必须与 checks 逐项重算一致。调用方不得解析英文 summary。

Doctor 覆盖以下边界：

| 范围                     | 主要检查                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| release / host           | release 文件、OS/架构、CPU、内存、DNS、Docker Engine 版本及 daemon OS/架构、Compose v2                  |
| configuration / security | 配置语法与权限、版本一致性、网络策略、public gateway/TLS/反向代理、image 签名、owner                    |
| runtime                  | Compose model、mandatory service 与 one-shot job readiness                                              |
| storage / database       | data root 标记与权限、磁盘/inode、PostgreSQL、migration inventory、PostGIS 非依赖声明                   |
| capability               | server runtime capability、required/optional 状态、开放地图连通性、local DEM provenance/tile            |
| recovery                 | incomplete lifecycle marker、实例 mutation lock、最新 verified backup/restore drill、最近失败 operation |

本地或 literal-IP origin 会跳过 DNS；Core Local 未启用公网地图时会跳过 provider probe。`skipped` 不是 `pass`，但也
不应因为能力按模式被明确关闭而制造假失败。

Public gateway 检查对 `SELF_HOST_SITE_ADDRESS` 的 `/api/health/ready` 执行 8 秒、64 KiB 上限的同 origin
GET，拒绝 redirect、非 JSON、超大 body 或任何非精确 `ready` payload。HTTPS 请求使用 Node 默认信任链与
hostname 校验；因此 pass 同时证明当前证书校验、public port、gateway route、reverse proxy 和 server readiness
都可用。报告不收录证书或远端错误原文，只返回稳定 code 与 allowlist 状态。

Host 检查把 OS 与架构作为一个发行元组验证，只接受 Linux `amd64`/`arm64`、macOS Apple Silicon 和 Windows
`amd64`。平台名称或架构单独出现在 allowlist 中不代表组合受支持，例如 macOS Intel 与 Windows ARM 都以
`SELF_HOST_HOST_PLATFORM_UNSUPPORTED` fail；CPU 或内存低于建议值在受支持宿主上仍只是 warning。

Docker Engine 检查同时读取 server version 和 daemon platform；daemon 必须是 Linux 且架构规范化后为 `amd64` 或
`arm64`。无法读取或解析 `docker info` 时 fail closed，但报告仅保留 version、OS、规范化架构、支持状态和是否匹配宿主，
不收录原始 Docker info。Compose 必须是可解析的 major ≥ 2 版本。支持的 daemon 架构与宿主不一致时给出 warning，以提示
模拟运行的性能与兼容性风险。

## 3. 常见自助路径

### repair-release-bundle / repair-self-host-configuration

1. 确认命令的 `--directory` 指向完整 release 目录，而不是源码子目录或符号链接；
2. 执行 `./self-host init --dry-run --json`；
3. 若只报告权限问题，执行 `./self-host init` 收紧 `.env.selfhost` 和 data root 权限；
4. 不要手工改 `.selfhost/current-release.json`、lifecycle marker 或 operation record。
5. `SELF_HOST_DOCTOR_OPERATION_LOCK` 为 warning 时表示实际 mutation 正在运行或处于两小时崩溃宽限；为 fail 时表示锁结构不可信。
   两种情况都不要手工删除锁；保留 diagnostics，让 owner 命令正常释放或由 CLI 在 PID 消失、字节复核与 strict exclusive
   reclaim record 均通过后原子接管。死亡回收者、超过 15 分钟、孤立或不匹配的 `.selfhost/operation.lock.reclaim` 同样是 fail，
   不得绕过。

### check-host-prerequisites / repair-runtime-state

1. 确认 `docker version` 与 `docker compose version` 在当前用户下成功；
2. 执行 `./self-host status --json`，先处理 `failures`，再处理 `waiting`；
3. 只在没有 incomplete restore/upgrade marker 时重跑原命令；
4. 不使用 `docker compose down -v`，该操作会破坏恢复边界。

### repair-security-boundary

1. 公网 origin 使用 HTTPS，LAN HTTP 仅作显式风险接受；
2. `SELF_HOST_SITE_ADDRESS` 的有效端口必须与对应 HTTP/HTTPS host port 一致；排查
   `SELF_HOST_DOCTOR_GATEWAY_UNREACHABLE`、`SELF_HOST_DOCTOR_GATEWAY_RESPONSE_INVALID` 或
   `SELF_HOST_DOCTOR_TLS_FAILED` 时不要跳过证书验证；
3. 正式 release 使用官方 namespace 下的 digest reference，并安装 Cosign 做签名认证；
4. owner 未 claim 时按 [首次启动与 owner](./first-boot-and-owner.zh.md) 完成本机 bootstrap；
5. 不把 `.env.selfhost`、bootstrap token、session cookie 或数据库 DSN 复制到 issue。

### repair-storage-state / repair-database-state

1. 保留至少 5 GiB 或 10% 的空闲空间；低于 512 MiB 是 blocking failure；
2. inode 少于 10,000 或剩余不足 5% 时 warning；少于 1,024 或剩余不足 1% 时 blocking failure；不报告 inode 的
   文件系统明确标记为 `skipped`，不能把它当作 pass；
3. 只允许 CLI 声明过、带 marker 的专用 data root；不要让 release root、用户主目录或文件系统根目录充当 data root；
4. migration mismatch 时停止升级/回滚尝试，保留 failed report 与 marker；
5. 不直接修改 `_prisma_migrations`，也不执行数据库 downgrade。

### repair-capability-state

1. 查看 `/api/runtime/capabilities` 对应的 doctor 摘要；required capability 不是 `enabled` 时 readiness 必须失败；
2. optional capability `misconfigured` 可降级，但应修复配置或明确关闭；
3. Core Local 的 maps provider 为 `none` 是合法状态；相对 local style/tile URL 会按 `SELF_HOST_SITE_ADDRESS`
   解析且只允许同源探测；Connected/Extended provider 不可达时检查 DNS、代理和上游状态。
4. `local-dem` 会检查私有数据根中的 `source.json`、配置 zoom 目录和最多 1024 个目录项内的一个合法瓦片样本；
   `SELF_HOST_DOCTOR_LOCAL_DEM_INVALID` 是 warning，不会破坏活动导入，但表示增强海拔不可依赖。

### verify-recovery-state

1. 每七天内至少保留一份 CLI 验证过的 backup；
2. 在隔离 clean target 上执行 restore drill，不在生产实例覆盖恢复；
3. 存在 incomplete marker 时遵循对应 failed report 的 declared recovery，不删除 marker 伪造完成；
4. recovery history 使用冻结的有界扫描：`data/backups` 顶层最多 1024 项且累计读取最多 64 MiB，
   `data/diagnostics` 顶层最多 4096 项且 restore report 累计读取最多 16 MiB，`.selfhost/operations` 最多 10,000 项且
   最近记录累计读取最多 2 MiB；任一项数或字节预算超限时不从不完整样本推断“最新”，而是返回
   `SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED` warning；
5. 可按显式 retention 把旧 verified backup 和已人工复核的 diagnostics 移到受控归档；不要手工编辑 lifecycle marker、
   upgrade report 或 operation record。operation history 超限时保留现场并通过支持流程处理；
6. 具体边界见 [备份与恢复](./backup-restore.zh.md) 与 [升级与回滚](./upgrade-rollback.zh.md)。

## 4. Diagnostics 工件

Diagnostics schema 位于 `schemas/self-host-diagnostics-bundle.schema.json`。默认写入已声明 data root 的
`diagnostics/`；data root 不可安全使用时退回 release 下的 `.selfhost/diagnostics/`。目录 mode 为 `0700`，工件
mode 为 `0600`，同名文件不会覆盖。

工件只包含：

- 完整 doctor report；
- allowlist 配置快照（不含 password、secret、token、cookie、credential 或 API key）；
- 最多 5000 行、每行最多 4096 字符的 bounded Compose 日志；
- 最近 20 条最小 operation record；
- privacy policy、redaction 计数和 contents SHA-256。

工件明确不包含数据库 dump、uploads、`.env.selfhost`、原始 lifecycle marker、bootstrap token、用户资料或任意目录
递归快照。内容先按当前配置的 exact secret value 脱敏，再按 credential label、Bearer、query parameter 和 DSN
形式二次脱敏。为了降低诊断日志中的身份泄露风险，邮箱会替换为 `[REDACTED_EMAIL]`，Linux、macOS 与 Windows
常见用户主目录路径中的用户名会替换为 `[REDACTED_USER]`；路径的其余部分保留，便于定位故障。发布前还会扫描
private key、JWT、GitHub token、AWS access key、未脱敏 credential assignment、connection password、邮箱与未匿名化
的常见用户主目录路径。扫描发现任何命中时返回 `SELF_HOST_DIAGNOSTICS_SECRET_SCAN_FAILED`，不写工件。
原子发布后，CLI 通过一个有界稳定句柄读取完整工件，并要求字节与准备发布的 Buffer 完全一致；schema、secret scan、返回的
`sizeBytes` 和 SHA-256 都消费这一个 Buffer，最后再次核对 device/inode/size/mtime/ctime 与私有权限。任何落盘漂移都会删除工件并
同步父目录后返回 `SELF_HOST_DIAGNOSTICS_VERIFY_FAILED`。删除前会再次核对目标仍是复验时观察到的 device/inode；若目标身份已变、
unlink 或目录同步失败，返回 `SELF_HOST_DIAGNOSTICS_CLEANUP_FAILED`；此时不能把清理视为已持久化，路径若仍存在必须按不可信工件
处置，禁止上传或分享。

读取 operation history 时同样遵守 10,000 项/2 MiB 上限；超限时 diagnostics 仍可生成，但 `operations` 为空，内嵌
doctor 通过 `SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED` 明确说明该摘要不完整，不会把任意目录顺序误报成“最近记录”。

自动脱敏不能证明工件不含所有业务敏感信息。日志仍可能包含 hostname、活动名称、非标准路径中的用户标识或
第三方错误正文，因此
`operatorReviewRequired` 永远为 `true`。上传前必须人工打开 JSON，检查 `contents.logs.lines` 和
`contents.configuration.settings`；必要时删除工件并用更窄的 `--service`/`--tail` 重新生成。

## 5. 提交支持问题

1. 记录 `./self-host --version`、宿主 OS/架构和 `doctor --json` 的 stable code；
2. 用最小 `--tail` 与 `--service` 生成 diagnostics；
3. 人工检查工件，不在公开 issue 粘贴 secret、token、cookie、完整 DSN、`.env.selfhost`、database dump 或 uploads；
4. 使用仓库的 “Self-host support” issue form，填写重现步骤、预期/实际结果和最近安全变更；
5. 仅在维护者提供私密渠道且确认需要后上传 diagnostics。公开 issue 默认只填写 bundle SHA-256 和 doctor code。

稳定原因码及默认 retry policy 见 [错误码目录](./error-catalog.zh.md)。

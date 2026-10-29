# Self-host 管理 CLI

本文定义稳定 operator 接口。CLI 是生命周期命令的唯一业务实现；Shell、
PowerShell、人工操作与 Agent 只负责传参和呈现，不直接复制 Compose 判断。

## 1. 入口

源码工作树：

```bash
pnpm self-host -- init
pnpm self-host -- start --source
pnpm self-host -- status --json
pnpm self-host -- doctor --json
pnpm self-host -- diagnostics --output support --json
pnpm self-host -- backup --dry-run --json
pnpm self-host -- upgrade /path/to/release-bundle --dry-run --json
```

薄封装分别位于 `scripts/selfhost/self-host.sh` 与 `scripts/selfhost/self-host.ps1`，两者都只调用
`scripts/selfhost/cli.mjs`。PowerShell 示例：

```powershell
pwsh -File scripts/selfhost/self-host.ps1 status --json
```

Agent/Codex 必须调用相同入口并优先使用 `--json`；变更命令应先执行 `--dry-run`。不得绕过 CLI 猜测
Compose project、文件路径或 readiness。签名发行包提供顶层 `self-host` / `self-host.ps1`，两者与源码入口共享
同一业务核心与 schema，不另建一套。

`--directory <release-dir>` 可以从其他工作目录管理明确指定的实例。目标必须是已经存在的真实目录，不能是
符号链接。所有 Compose 调用使用目标配置中的 `SELF_HOST_PROJECT_NAME`（默认 `trainingload-selfhost`），并固定使用
目标目录内的 `.env.selfhost` 与 Compose 文件。该名称是实例隔离边界：同一 Docker Engine 上的 clean restore 或
第二实例必须使用不同名称；CLI 只接受 1–63 位小写字母、数字、连字符或下划线，且首位必须为字母或数字。
`SELF_HOST_DATABASE_NAME` 与 `SELF_HOST_DATABASE_USER` 同样在调用 Docker 前限制为 1–63 位 URL-safe PostgreSQL
identifier，不能用 `/`、`@`、`:` 等连接 URL 结构字符改变数据库目标。

## 2. 命令语义

| 命令                 | 变更                                                | 幂等与后置条件                                                    |
| -------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `init`               | 生成受保护配置；声明并创建专用数据目录              | 不覆盖配置、不轮换 secret；重复执行只验证或收紧权限               |
| `doctor`             | 无状态变更；聚合 host/runtime/data/recovery 检查    | 不因单项失败提前退出；稳定 check code、severity 与 remediation    |
| `diagnostics`        | 生成私有 allowlist 支持工件                         | 先脱敏与 secret scan；同名不覆盖；doctor fail 仍可收集            |
| `start [--source]`   | 拉取缺失镜像或从源码构建并启动                      | 已 ready 时不调用 `up`；返回前再次验证全部 mandatory service      |
| `status`             | 无服务变更                                          | 返回结构化 service、health、failure、waiting 与 engine version    |
| `logs`               | 无服务变更                                          | 读取有限快照，不 follow；按配置 secret 与常见 credential 形式脱敏 |
| `backup`             | 短暂停止写入，生成 DB + uploads bundle              | 发布前逐文件校验；同名不覆盖；结束时恢复并验证服务                |
| `restore <backup>`   | 向新初始化的空 target 恢复并启动                    | 精确版本/schema；拒绝覆盖；失败 marker 阻止误启动并生成 report    |
| `upgrade <bundle>`   | 认证完整 release bundle、备份、按 digest 拉取并迁移 | 仅接受声明 source；成功需 migration 等价和 full readiness         |
| `rollback <version>` | 切回已保留的旧 application image                    | 仅接受升级报告声明的范围；数据库保持 forward-only                 |
| `stop`               | 停止 active service                                 | 不执行 `down`，保留 container、network 与全部数据；重复执行不变   |
| `owner-bootstrap`    | 为 LAN/公网模式从 stdin 创建 singleton owner credential | 要求 ready；容器内读取 token；成功后进入不可逆 READY 状态         |
| `owner-recovery`     | 从 stdin 替换 singleton owner credential            | 要求 ready；验证 owner email；成功后撤销 owner 全部 session       |
| `uninstall`          | 删除本实例 Compose container/network                | 默认保留配置和数据；重复执行不变；不使用 volume 删除              |

通用选项：

- `--dry-run`：执行解析、配置、权限、Docker/Compose 和当前状态等只读检查，但不修改配置、数据或服务；
- `--json`：输出 schema v1 JSON；human output 由同一个内部结果生成；
- `--directory <path>`：选择一个 release 实例；
- `start --source`：叠加 `compose.build.yml` 并从当前源码构建；其他命令按已验证的实例 project label 管理同一实例；
- `logs/diagnostics --tail <1-5000>`：每服务最多读取指定数量的日志；默认 200；
- `logs/diagnostics --service <name>`：可重复，只接受 Compose 契约内的服务名；
- `diagnostics --output <name>`：指定私有 JSON 工件名；不接受路径，同名不覆盖；
- `backup --output <name>`：指定 `data/backups` 下的 portable bundle 名称，不接受任意路径；
- `restore <backup-directory>`：相对路径从 invocation directory 解析，也可传绝对路径。
- `upgrade <release-bundle-directory>`：目录必须是完整签名发行包，含固定 inventory、管理 runtime、配置模板、`checksums.txt`、Cosign bundle、release manifest、SBOM、provenance 与逐镜像证据；
- `upgrade --accept-no-application-rollback`：目标 release 未声明安全 application rollback 时的显式风险接受，不改变 database rollback 为 unsupported 的事实；
- `rollback <previous-version>`：版本必须与本机已验证 upgrade report 中的 source 完全一致。
- `owner-bootstrap --email <owner-email> --name <owner-name>`：password 只允许经 stdin 传入，token 仅由容器内命令读取；CLI 拒绝交互式 TTY，不把 identity/password/token 写入结果或 operation record；Agent 不得代填 password/token。
- `owner-recovery --email <owner-email>`：密码只允许经 stdin 传入；CLI 拒绝交互式 TTY，不把 email/password 写入结果或 operation record；也用于在改变 bind 前把 loopback 无密码 Owner 升级为凭证账户；Agent 不得代填密码。
- `uninstall --delete-data --confirm-data-root <absolute-path>`：只有两个参数同时存在且确认路径与配置中的真实专用数据根完全一致时才删除数据；默认 `uninstall` 永远保留数据。实际递归删除前，CLI 会记录已确认目录的 device/inode，把它原子移入同一父目录下 operation-scoped 的隔离名，复核移入后的身份仍一致且原路径为空，再删除隔离目录。确认后发生路径替换会返回 `SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED`，替换内容不进入递归删除。
- 数据根不能是 filesystem root、release root、release 的祖先目录或任何已签名子树；CLI 会解析尚未创建目标的最近现存祖先，
  因此父目录 symlink 也不能把运行时写入绕进 `scripts/`、`docker/` 等签名路径。即使 marker 和确认路径有效也不会删除包含安装目录的父目录。

dry-run 仍会写一条最小 operation record，这是唯一允许的审计写入。`logs --dry-run` 不读取日志正文；
`backup/restore/upgrade/rollback/owner-bootstrap/owner-recovery/uninstall --dry-run` 只做只读检查，不 stop/start/down service、不创建 helper container、不写
bundle/target、不切换配置。`upgrade --dry-run` 仍会执行完整 release bundle 与 Cosign 签名认证，并读取数据库、uploads
用量和磁盘空间；它不会 pull image。

所有非 dry-run 的实例 mutation 共用 `.selfhost/operation.lock.json`：`init/start/backup/restore/upgrade/rollback/stop/owner-bootstrap/
owner-recovery/uninstall` 同一时刻只允许一个。锁在命令前以 exclusive atomic create 发布；释放时先以 exclusive hard-link
发布 owner 字节快照，复核主锁与快照后才依次 unlink，预占 snapshot 不能被覆盖。因此两个不同名称的 backup 也不能交错
quiesce/resume，backup 也不能与 restore/upgrade 同时运行。冲突返回
`SELF_HOST_OPERATION_IN_PROGRESS`，畸形或被替换的锁返回 `SELF_HOST_OPERATION_LOCK_INVALID`。只有 owner PID 已消失、开始时间超过
两小时且复核字节未变时才自动回收陈旧锁；回收者先以固定 `.selfhost/operation.lock.reclaim` strict record 做 exclusive
仲裁，record 绑定回收者 PID/operation、开始时间、旧锁 operation ID 与摘要，再把旧锁原子替换为自己的锁，锁路径全程不留
可抢占空窗。只有 record 仍匹配且回收者存活时返回可重试的 `SELF_HOST_OPERATION_IN_PROGRESS`；死亡回收者、残留或不匹配
record，以及超过 15 分钟的回收尝试，一律返回 `SELF_HOST_OPERATION_LOCK_INVALID`；不要手工删除。
`status/doctor/logs/diagnostics` 不取得 mutation lock，仍可用于观察和取证。

所有 Compose-backed 生命周期命令在解析 Compose model 或改变服务前，先按发行矩阵验证宿主，只接受 Linux
`amd64`/`arm64`、macOS Apple Silicon 和 Windows `amd64`；随后读取有界的 Docker/Compose version 与 daemon platform。
只接受 major ≥ 2 的 Compose 和 Linux containers backend 上的 `amd64`/`arm64`；不支持的宿主、Windows containers、
Compose v1、未知 daemon 架构或畸形输出均返回稳定错误，原始 daemon 输出不会进入 JSON 或 operation record。`init`
不启动 Compose；doctor 会把不支持的宿主作为独立 fail 保留在完整报告中，diagnostics 仍可用于取证。

Compose 子进程不会继承可覆盖实例配置的宿主变量：CLI 从实际 Compose 文件和 `.env.selfhost` 原始内容防御性提取插值名，并从
子进程环境移除这些名称及全部 `COMPOSE_*` 控制变量，使受保护的 `.env.selfhost` 和 Compose 默认值成为唯一配置来源；`PATH`、
`DOCKER_HOST` 等 Docker 连接环境继续保留。`.env.selfhost` 的未引用值和双引号值禁止 `$VAR`/`${VAR}` 二次插值；字面 `$`
必须放在完整单引号值中。CLI 对完整引号、受支持转义和行尾注释的解析与 Compose 相同，因此不会发生预检值通过后又被宿主 shell
改写的情况。稳定读取并校验后，CLI 把 env、基础 Compose 定义、可选 source overlay 与 Caddyfile 一次性复制到 `.selfhost` 下的
私有 operation 快照；快照版 Compose 将 gateway bind mount 改写为同一快照中 Caddyfile 的 long-form bind，宿主绝对路径不会
经过短语法的冒号切分，本次全部 Docker 调用不再读取原始运行输入路径。Upgrade/rollback 切换 image/version 时先重新校验
生成内容，再同步替换实例配置与 env 快照；命令结束时按已知摘要
复核并删除快照，内容漂移或清理失败返回稳定 filesystem error。可选 docs 服务只能用
`SELF_HOST_DOCS_ENABLED=true` 启用；CLI 会加入固定 `docs` profile，并在 start/status/backup/restore/upgrade/rollback 等
readiness 判断中要求 docs 健康。

备份格式、恢复失败边界与演练要求见 [备份与恢复](./backup-restore.zh.md)。
升级兼容窗口、迁移策略和应用回滚边界见 [升级与回滚](./upgrade-rollback.zh.md)。
Doctor 检查、诊断隐私边界与支持流程见 [Doctor 与 diagnostics](./doctor-and-diagnostics.zh.md)，稳定原因码见
[错误码目录](./error-catalog.zh.md)。

## 3. 结构化结果

结果 schema：`schemas/self-host-cli-result.schema.json`。每次有效命令返回以下稳定 envelope：

```json
{
  "schemaVersion": 1,
  "operationId": "00000000-0000-4000-8000-000000000000",
  "command": "status",
  "status": "completed",
  "ok": true,
  "exitCode": 0,
  "dryRun": false,
  "startedAt": "2026-10-17T00:00:00.000Z",
  "finishedAt": "2026-10-17T00:00:01.000Z",
  "releaseVersion": "1.1.14",
  "summary": "Self-host services are ready",
  "actions": [],
  "details": {},
  "error": null,
  "operationRecord": ".selfhost/operations/…json"
}
```

字段只在 schema major version 内做向后兼容扩展。调用方必须以 `ok`、`exitCode`、`error.code` 和明确的
`details` 字段作判断，不能解析 human 文本。

## 4. 稳定 exit code

| code | 分类         | 含义                                                                           |
| ---: | ------------ | ------------------------------------------------------------------------------ |
|    0 | success      | `completed`、`planned` 或 `unchanged`                                          |
|    2 | usage        | 未知命令、选项或越界参数                                                       |
|    3 | config       | 配置、bundle、权限或 Compose model 无效                                        |
|    4 | prerequisite | 宿主/daemon 平台不受支持，或 Docker Engine、Compose v2、升级所需 Cosign 不可用 |
|    5 | command      | 外部命令执行失败或返回不可解析结果                                             |
|    6 | conflict     | 并发初始化等状态冲突；可在重新读取状态后重试                                   |
|    7 | filesystem   | 不安全路径、数据目录接管拒绝或 audit 持久化失败                                |
|    8 | unhealthy    | 变更已执行但 readiness/stop 后置条件未满足                                     |
|   10 | internal     | 未分类内部失败；不应由调用方自动扩大操作范围                                   |

## 5. Secret 与 operation record

CLI 不输出生成的 auth/database secret。Docker 错误和日志先按当前配置中的敏感值做精确替换，再按
password、token、authorization、cookie、API key、URL query 与 PostgreSQL DSN 形式做二次脱敏。

每次有效命令以 exclusive create 写入 `.selfhost/operations/<timestamp>-<uuid>.json`：

- 目录 mode `0700`，文件 mode `0600`；
- 同名记录不能覆盖；
- 只含 command、状态、exit code、时间、release version、action code 与 error code；
- 不含 summary、error message、service details 或日志正文；
- schema 位于 `schemas/self-host-operation-record.schema.json`。

如果 audit record 无法持久化，整个调用以 exit 7 失败；不能把“动作成功但没有记录”报告成成功。若此前命令也失败，顶层错误仍为
`SELF_HOST_OPERATION_RECORD_FAILED`，原命令的无敏感 `code`、`exitCode`、`retryable` 会保留在 `details.commandFailure` 与失败 action。
若主命令已经失败，而 Compose 输入快照清理或 operation lock 释放随后也失败，CLI 保留主错误作为 `error`，并把每个二次失败
写入 `details.secondaryFailures` 与失败 action；operation record 通过对应 action code 保留可观察性，不把残留敏感快照或锁静默吞掉。
Restore/upgrade/rollback 的失败 containment 同样检查 stop、marker/snapshot cleanup 与 required failed report：后续失败若不改变
顶层错误则作为 secondary failure；若 durable cleanup/report 故障必须成为顶层错误，原始命令失败反向作为 secondary failure 保留。

## 6. 配置与网络预检

`init` 使用 exclusive atomic publish 创建 `.env.selfhost`，默认 mode `0600`；Compose 命令发现 group/other
权限时拒绝继续，并要求重新执行 `init` 修复。重复 key、placeholder secret、短 secret、`latest` image、非法 bind、
越界/非整数端口、同一 bind 上的 HTTP/HTTPS 端口冲突、越界 bootstrap token TTL、非 semantic version、错误 HTTPS
gateway、schema 外字段和会触发 Compose 二次插值的值都会在调用 Docker 前失败。初始化模板与 release metadata 的读取上限为
1 MiB；配置中的
`SELF_HOST_VERSION` 必须与安装目录记录的 release 精确一致。唯一例外是 `rollback`：失败升级/回滚可能有意留下配置已切换、
current-release 尚未提交的状态，因此它改由受校验的 marker 与 upgrade report 证明修复路径。HTTP、HTTPS 与可选 docs
端口范围为 1–65535；bootstrap token TTL 范围为 600–604800 秒。

安装目录一旦存在 `release-manifest.json`，它就是权威 release metadata，必须在上限内通过完整 manifest 校验；损坏、超大或
不完整时不得静默回退到源码 `package.json`。只有没有 release manifest 的源码工作树才使用 package version。

网络规则与 server 启动门一致：公网 origin 默认必须是 HTTPS；LAN HTTP 会返回显式 warning；公网 HTTP
只有设置 `SELF_HOST_ALLOW_INSECURE_HTTP=true` 才允许，并持续返回高风险 warning；非 loopback bind 不能继续
使用 localhost public origin。

管理核心的同目录原子创建/替换会在失败后关闭句柄并删除私有临时文件。若该清理也失败，返回文件系统失败并保留原始写入错误
作为 aggregate cause；可能含 secret 或 lifecycle 状态的 `.tmp` 不能被静默忽略，应先运行 `doctor --json` 并人工检查实例私有目录。

## 7. 验证

```bash
node --test scripts/selfhost/management-core.test.mjs
pnpm selfhost:compose-contract
pnpm test:selfhost-image-supply-chain
```

测试覆盖 schema、human/JSON 同源结果、sequential idempotency、dry-run、配置权限、数据目录接管拒绝、
公网网络策略、端口/TTL 边界、日志脱敏、不支持的宿主元组、Docker 缺失/错误平台/畸形输出、start/stop 后置条件、doctor
聚合、diagnostics fail-closed、错误码目录、append-only record 和 Bash/PowerShell 薄封装。

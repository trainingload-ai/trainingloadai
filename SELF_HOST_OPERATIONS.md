# Trainingload.ai Self-host v1 运维 Runbook

本文适用于已经从完整签名 release bundle 安装的实例。Linux、macOS 与 WSL2 使用 `./self-host`；Windows PowerShell
把同一命令替换为 `.\self-host.ps1`。所有自动化只判断 JSON 的 `ok`、`exitCode`、`error.code` 与 `details`，不解析展示文本。

## 1. 值班基线

每次接管实例先记录 release version、宿主 OS/架构和下列只读结果：

```bash
./self-host status --json
./self-host doctor --json
```

若返回 `SELF_HOST_HOST_PLATFORM_UNSUPPORTED`，不要绕过门禁或直接调用 Compose；将实例迁移到发行矩阵声明的
Linux `amd64`/`arm64`、macOS Apple Silicon 或 Windows `amd64` Docker Desktop 宿主后再恢复生命周期操作。

建议至少每日执行 `status`，每周执行 `doctor` 与 verified backup，每个 release 前在隔离 target 做 restore drill。监控宿主
可用磁盘、PostgreSQL 目录、uploads、backup 保留量和容器内存；不要只监控 container 是否 `running`。

任何会改变实例状态的命令必须先用完全相同的参数执行 `--dry-run`。不要手工调用 `docker compose` 复制生命周期逻辑，
不要执行 `docker compose down -v`，不要删除 lifecycle marker 来绕过保护。

实际变更命令由 `.selfhost/operation.lock.json` 串行化。出现 `SELF_HOST_OPERATION_IN_PROGRESS` 时，保留正在运行的命令并用
`status`、`doctor` 或 `logs` 观察，不要并行重试；出现 `SELF_HOST_OPERATION_LOCK_INVALID` 时保留锁和 diagnostics 供检查，
不要手工删除。CLI 只会在 owner PID 已消失且超过两小时安全窗口后，以 `.selfhost/operation.lock.reclaim` strict exclusive
record 绑定回收者 PID/operation 与旧锁摘要，再原子替换字节未漂移的陈旧锁；死亡回收者或遗留 record 会 fail closed，交由
diagnostics/support 处理。回收 record 最多存活 15 分钟，即使 PID 仍存在，超时也视为无效而不会自动删除。

## 2. 启停、状态与日志

```bash
./self-host start --dry-run --json
./self-host start --json
./self-host status --json
./self-host logs --tail 200 --service server --service client --json
./self-host stop --dry-run --json
./self-host stop --json
```

`start` 只有在 migration 完成、mandatory services ready 且健康检查通过后才成功。`stop` 保留 container、network 和全部
持久数据。日志是有限快照且自动脱敏；仍不得把完整日志默认发布到公开 issue。

需要移除运行资源时，使用管理命令而不是手工执行 Compose：

```bash
./self-host uninstall --dry-run --json
./self-host uninstall --json
```

默认卸载只删除本实例的 container 与 network，保留 `.env.selfhost`、`.selfhost` 和整个数据目录，因此可以重新安装或恢复。
只有已经完成并异地保存 verified backup、明确决定不可逆删除全部本地数据时，才允许同时给出删除开关与精确绝对路径确认：

```bash
data_root='/absolute/path/to/trainingload-data'
./self-host uninstall --delete-data --confirm-data-root "$data_root" --dry-run --json
./self-host uninstall --delete-data --confirm-data-root "$data_root" --json
```

CLI 会重新解析配置、验证专用 data-root marker、拒绝额外顶层文件，且必须在 Compose 资源完全移除后才删除目录。它不会删除
release bundle 或 `.env.selfhost`；路径不完全匹配、使用相对路径或缺少双重参数时都会失败。

## 3. 备份与保留

```bash
./self-host backup --output weekly-<yyyy-mm-dd> --dry-run --json
./self-host backup --output weekly-<yyyy-mm-dd> --json
```

只有 `backup-result.json` 显示成功、manifest/checksum 完整的目录才可进入保留策略。完成后：

1. 把 bundle 复制到受访问控制、加密且与宿主独立的故障域；
2. 记录 bundle SHA-256、release version 和保留到期日；
3. 在隔离的新 target 执行 restore drill；
4. 只有新备份已异地且演练成功，才按显式 retention 删除旧备份。

单个 backup v1 最多包含 100,000 个 upload 文件、100,006 个总文件、100,000 个子目录和 64 层目录。doctor 最多扫描
`data/backups` 的 1024 个顶层项/64 MiB metadata、`data/diagnostics` 的 4096 个顶层项/16 MiB restore report；超过时返回
`SELF_HOST_DOCTOR_HISTORY_LIMIT_EXCEEDED`，不会从部分目录推断最新备份或恢复报告。应先把旧 verified backup 移到异地
归档，并在删除本地副本前复验归档；diagnostics 仅在人工复核和不再需要支持取证后清理。不要手工修改
`.selfhost/operations`、`.selfhost/upgrades` 或 lifecycle marker。

不要备份正在写入的 `data/postgres` 文件树代替管理 CLI。详细格式与排除项见
[BACKUP_RESTORE.md](./BACKUP_RESTORE.md)。

## 4. 隔离恢复演练

目标必须是新解压的同版本签名 release、使用独立端口和 project name，且权威数据为空：

```bash
./install.sh --no-start --json
./self-host restore /secure/path/to/backup --dry-run --json
./self-host restore /secure/path/to/backup --json
./self-host doctor --json
```

核对 owner、至少一个活动和一个 upload，记录 restore report 后停止隔离实例。失败时保留 report 与 incomplete marker，
不要向失败 target 继续写入，也不要手工清空 marker 后重试。

## 5. 升级窗口

1. 下载目标 release 的 archive、checksum 与 signature bundle；按 `SELF_HOSTING.md` 在解压前验证外层签名和 digest。
2. 阅读目标 release manifest、已知限制、migration inventory、supported source 与 rollback 声明。
3. 保留当前实例、目标 bundle 和最近一次 verified off-host backup。
4. 依次运行 source controller compatibility dry-run、target controller dry-run 和实际升级：

```bash
instance='/absolute/path/to/current-instance'
target='/absolute/path/to/trainingload-selfhost-<target-version>'
"$instance/self-host" upgrade "$target" --directory "$instance" --dry-run --json
"$target/self-host" upgrade "$target" --directory "$instance" --dry-run --json
"$target/self-host" upgrade "$target" --directory "$instance" --json
"$target/self-host" doctor --directory "$instance" --json
```

目标 bundle 是升级后的 management controller，必须和实例一起保留。不要把目标文件覆盖进旧 bundle。完整边界见
[UPGRADE.md](./UPGRADE.md)。

## 6. 升级失败与 application rollback

先收集只读证据：

```bash
./self-host doctor --json
./self-host diagnostics --output failed-upgrade --json
```

仅当 upgrade report 明确声明 source version 可做 application rollback 时，使用执行升级的 target controller：

```bash
"$target/self-host" rollback <exact-source-version> --directory "$instance" --dry-run --json
"$target/self-host" rollback <exact-source-version> --directory "$instance" --json
```

这不会降级数据库。若 report/marker 被修改、旧 digest image 不存在、存在 contract migration 或 rollback 自身失败，停止尝试，
保留现场，并从经过验证的 backup 向新 target 恢复。

## 7. Owner 初始化与会话

服务 ready 后从 localhost 页面输入用户名进入 onboarding。数据库中只有一个 Owner，不使用邮箱、密码或邮件恢复。
会话失效后重新访问本地 `/setup` 即可为同一个 Owner 建立会话。排障先执行 `doctor --json`，不要修改数据库中的 Owner 标识。

## 8. 远程访问

保留默认 loopback 绑定，使用 SSH 隧道访问。自建代理必须处理外部身份认证与 HTTPS；公共 Client 不包含 Cloud 登录页面。

## 9. 常见故障处置

### 数据库不可用

1. 运行 `status --json` 与 `doctor --json`，确认是数据库容器、磁盘、权限还是 migration 故障；
2. 不要暴露 PostgreSQL host port，不要在未备份时手工修改数据库；
3. 修复宿主资源或配置后，先 `start --dry-run --json`，再 `start --json`；
4. 若存在 incomplete lifecycle marker，按对应 restore/upgrade report 处理，普通 start 不应绕过它。

### 磁盘不足

1. 停止新的导入和升级；保留 PostgreSQL、uploads、最近 verified backup 与 lifecycle records；
2. 同时检查 `SELF_HOST_DOCTOR_DISK` 与 `SELF_HOST_DOCTOR_INODES`；剩余 inode 枯竭时，仅增加字节容量并不能恢复写入；
3. 清理前区分 authoritative、operator-managed 与 derived 数据；只允许按文档清理 cache/diagnostics/过期 backup；
4. 不删除 `data/postgres`、`data/uploads`、`.selfhost/current-release.json` 或 incomplete marker；
5. 扩容后运行 `doctor --json`，再按 dry-run → actual 的顺序恢复服务。

### 权限错误

1. 不要递归 `chmod 777`；先运行 `doctor --json`；
2. 对尚未启动或契约内路径，运行 `./self-host init --dry-run --json` 审阅计划，再运行 `./self-host init --json`；
3. 若路径存在 symlink、未知文件或不属于本实例的 data-root marker，停止并迁移到独立目录，不要强行接管。

### Connected provider 超时

Provider 失败不得破坏 core readiness。先确认核心数据仍可读取和写入，再检查 provider URL、许可、attribution、DNS 和
网络策略。需要隔离外部依赖时切回契约允许的 disabled/local provider，并在修改配置后按 dry-run → start 验证。

## 10. 诊断与支持交接

```bash
./self-host diagnostics --output support-<yyyy-mm-dd> --tail 500 --service server --service client --json
```

分享前必须人工打开 JSON，检查日志与配置摘要，不分享 `.env.selfhost`、bootstrap token、owner 密码、provider key、数据库
dump 或用户 uploads。公开 issue 只给 stable error code、宿主/架构、release version 与 diagnostics SHA-256；完整工件只通过
维护者指定的私密渠道传输。

稳定错误与 remediation 见 `ai_docs/self-hosting/error-catalog.zh.md`。产品边界见
[SELF_HOST_KNOWN_LIMITATIONS.md](./SELF_HOST_KNOWN_LIMITATIONS.md)。

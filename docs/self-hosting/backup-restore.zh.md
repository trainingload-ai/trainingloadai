# Self-host 备份与恢复

本文定义 self-host v1 的 versioned backup bundle 与 clean-target restore。备份成功不是“命令生成了文件”，
而是 bundle 结构、manifest 和每个文件 checksum 都通过验证；最终完成仍要求 Docker clean-room restore drill。

## 1. 创建备份

```bash
pnpm self-host -- backup --dry-run --json
pnpm self-host -- backup --output before-upgrade-1-1-13
```

`--output` 是 `data/backups` 下的 portable 名称，不是任意 filesystem path。未指定时使用 release version、
timestamp 与 operation ID 生成唯一名称。目标、staging 或 lock 已存在时拒绝覆盖。

备份要求实例当前 ready。实际顺序为：

```text
preflight + disk check + bounded uploads tree scan
→ stop gateway/client/server（PostgreSQL 保持健康）
→ pg_dump --format=custom
→ 以受限 helper 复制 /data/uploads
→ 写 manifest / non-secret config / secret references / result
→ 生成并逐文件验证 SHA-256
→ atomic rename 发布 bundle
→ 恢复并验证全部 mandatory services ready
```

停止 server 后，数据库和 uploads 不再有产品写入者；数据库没有发布 host port，因此这构成 v1 的一致性边界。
若 quiesce 或后续步骤失败，CLI 会尝试恢复 service。未验证的 staging 只使用 `.partial-*` 名称且不会被当作
备份；已验证 bundle 即使在 service resume 失败时也保留，便于恢复和诊断。
收尾时 CLI 会验证 `.lock` 仍由当前 operation 持有，再删除 lock 并同步 backups 目录。staging、lock 或目录同步清理失败返回
`SELF_HOST_BACKUP_CLEANUP_FAILED`；若已有主备份/恢复服务错误，主错误保持不变，清理错误进入 `details.secondaryFailures`、
失败 action 与 operation record，不能静默留下阻塞后续备份的状态。preflight 后若同名路径被并发占用，返回
`SELF_HOST_BACKUP_ALREADY_EXISTS`，且只清理本 operation 已确认创建的 staging/lock，不递归删除未知占用者的路径。

Linux 上 runtime uploads 属于 UID 10001，宿主 operator 不一定能直接读取。CLI 使用 Compose 已固定 digest 的
`permissions` helper 以 root 读取，并区分 rootful/rootless Docker 的 ownership 映射；Bash/PowerShell 不复制
这段逻辑。dry-run 只在现有 apps/server/postgres 容器内执行只读检查，不创建 helper container。

## 2. Bundle v1

```text
backup-v<version>-<timestamp>-<id>/
├── backup-manifest.json
├── backup-result.json
├── checksums.txt
├── configuration.json
├── secret-references.json
├── database.dump
└── uploads/
```

`backup-manifest.json` 的 schema 位于 `schemas/self-host-backup-manifest.schema.json`，包含：

- app release、config schema 与 source revision；
- PostgreSQL logical size、dump size/hash、已完成 Prisma migration ID/checksum；
- self-host singleton、user、activity 的恢复前 core count；
- uploads 文件数与总字节数；
- 一致性方法、checksum 算法和 exact-release restore 约束。

`configuration.json` 仅使用显式 allowlist；任何 key 名看起来像 password/token/secret，或值恰好等于当前 secret，
都会被排除。`secret-references.json` 只保存 `{name, present}`，不保存值。bundle 不包含：

- `.env.selfhost` 或任何 credential；
- `data/operations/bootstrap-token`；
- cache、elevation dataset、diagnostics；
- Caddy certificate/private key state。

bundle 内只允许普通文件和目录；symlink、device、FIFO、path traversal、重复 checksum、未登记文件、内容篡改和
不安全配置字段都会让验证失败。为避免恶意或异常目录放大内存、递归栈和 checksum 解析成本，v1 同时冻结以下上限：

- uploads 最多 100,000 个普通文件；完整 bundle 最多 100,006 个普通文件；
- 完整树最多 100,000 个子目录，目录深度最多 64 层；
- 单个 JSON metadata 文件最多 1 MiB，checksum inventory 最多 16 MiB。

超限 bundle 不会被创建或恢复；不能通过手工删 checksum 行、改 manifest 或拆分同一个 bundle 绕过。应先减少单实例
uploads 文件数，或把数据按受支持的数据迁移方案拆到独立实例。Backup 在停服务前通过容器内流式目录读取验证同一
文件数、目录数和深度上限；复制后的宿主树与最终 checksum 验证再次执行相同边界，竞态或漂移返回稳定 backup error。
目录 mode 为 `0700`，文件 mode 为 `0600`。

## 3. 恢复到新目录

恢复不会覆盖原实例。准备同一 release 的新 bundle 目录，先初始化 target，再执行：

```bash
pnpm self-host -- init --directory /srv/trainingload-restore
pnpm self-host -- restore /path/to/backup-v1 \
  --directory /srv/trainingload-restore \
  --dry-run --json
pnpm self-host -- restore /path/to/backup-v1 \
  --directory /srv/trainingload-restore
```

clean target 的 `.env.selfhost` 必须使用不同的 `SELF_HOST_PROJECT_NAME`（例如
`trainingload-selfhost-restore`），避免把源实例的 retained container 误判为目标实例；源实例与恢复实例不能同时
绑定同一 host port，因此切换验证前先停止源实例。restore 仍拒绝目标 project 下的任何已有 container。

restore preflight 必须同时满足：

1. bundle 的全部 checksum、manifest 与 secret boundary 通过；
2. target release version、`.env.selfhost` version 与 config schema 精确匹配；
3. target 没有 Compose container，postgres/uploads/operations/gateway TLS authoritative 目录为空；
4. 可用空间大于 `verified bundle + max(2×logical DB, 4×dump) + uploads + 256 MiB`；
5. target 配置和 data-root 权限满足普通 CLI 安全门。

target 自己生成新的 auth/database secret；备份不覆盖 secret。写入阻断 marker 后、启动任何 target service 前，CLI 会把
已通过预检的 bundle 逐文件稳定复制到 target `operations` 下的私有有界快照，重新验证完整 bundle，并要求 backup ID、文件数、
总字节数和排序后的 checksum inventory 与首次验证完全一致。后续 `pg_restore` 和 uploads copy 只读取该快照，因此源路径在
预检后被替换、改写或重新封装都不能改变实际恢复输入。

恢复只启动空 PostgreSQL，streaming 执行
`pg_restore --clean --if-exists --exit-on-error --no-owner --no-acl`，随后比较 migration inventory 与 core count，
再从同一快照复制 uploads 并在容器内逐项校验 SHA-256。uploads 验证后必须删除私有快照并同步其父目录，之后才运行
migration/full Compose readiness，并再次比较数据库状态。

## 4. 失败边界与报告

任何 target mutation 之前，CLI 先 exclusive create `.selfhost/restore-incomplete.json`。只有数据库、uploads、
migration、core count 和完整 readiness 全部通过，且不可变的 completed report 已持久化后才删除。completed report
写入失败时 marker 保持有效；marker 清理异常时 CLI 会尽力重新建立 marker，并按失败流程停止服务。进程崩溃或恢复失败时：

- stop target service，并校验 stop 结果；若 stop 也失败，将 `SELF_HOST_STOP_FAILED` 作为结构化 secondary failure 与
  audit action 保留，不能静默吞掉 containment 失败；
- 尽力删除仅用于本次恢复的私有输入快照；若删除或父目录同步失败，返回
  `SELF_HOST_RESTORE_SNAPSHOT_CLEANUP_FAILED` 并保持 target 阻断；此前的恢复错误仍作为 secondary failure 保留；
- 保留部分数据供诊断，不假装可以继续；
- `start` 看到 marker 后稳定退出 6；
- 在 `data/diagnostics/restore-*.json` 写失败 report；若失败 report 本身无法持久化，顶层返回
  `SELF_HOST_RESTORE_REPORT_FAILED`，此前的恢复错误仍作为 secondary failure 保留。

成功与失败 report 都符合 `schemas/self-host-restore-report.schema.json`。失败 target 不支持原地“试着继续”；应保留
现场并在新的 clean target 重试。手工删除 marker 不等价于恢复成功。

## 5. 兼容边界

Backup v1 的直接 restore 是 exact-release 操作。旧版本备份必须先恢复到其声明 release，再通过已验证 upgrade
路径前进，不能把 restore 隐式当作 database migration。这样 image rollback、application upgrade 与 database
downgrade 三个风险边界不会混在一个命令里。

## 6. 验证

```bash
node --test \
  scripts/selfhost/backup-artifact.test.mjs \
  scripts/selfhost/management-core.test.mjs
pnpm test:selfhost-image-supply-chain
pnpm selfhost:compose-smoke -- --mode=source
```

无 Docker 环境可以验证 artifact、schema、streaming、dry-run、fault injection、marker 与 mocked lifecycle；不能把
这些结果当作真实 PostgreSQL dump/restore、UID mapping 或 core journey restore drill。

# Self-host 备份与恢复

权威持久数据是 PostgreSQL 与 `data/uploads`；cache、thumbnail 和其他派生数据不构成恢复成功。只使用管理 CLI 创建
与验证备份，不直接复制运行中的 PostgreSQL data directory。

## 创建备份

```bash
./self-host backup --output nightly-2026-10-17 --dry-run --json
./self-host backup --output nightly-2026-10-17 --json
```

CLI 会检查 readiness 与磁盘空间，短暂 quiesce application writers，使用 `pg_dump` custom format，复制 uploads，记录
migration 与核心 record count，生成逐文件 checksum，并在发布 bundle 前完整复验。无论成功或失败都会尝试恢复服务；
resume 不 ready 会令整个操作失败。

备份默认位于已声明 data root 的 `backups/<name>/`。它包含恢复所需数据库与用户 uploads，必须像生产数据一样加密、
限制访问并复制到独立故障域。`backup-result.json` 的 `verified=true` 不是异地备份或 restore drill 的替代品。

## 恢复到 clean target

恢复只允许目标版本完全匹配、已 `init`、权威数据库与 uploads 为空的新实例目录。不要在原实例上覆盖恢复。

在目标实例启动或恢复前，由操作者将原实例的 `SELF_HOST_AUTH_SECRET` 和 `SELF_HOST_INTEGRATION_SECRET`
放入目标 `.env.selfhost`。这两个值用于解密数据库中的认证密钥和 Provider/AI 凭据，必须沿用原值。
更换 project name、data root 和数据库密码不要求更换这两个密钥。密钥不包含在数据备份中；应把原配置保存到独立、
加密的凭据备份中。只有数据库和 uploads、却丢失这两个密钥，不能保证认证与已保存连接可恢复。
Agent 不读取或代填这些值，正式恢复由操作者在宿主本机完成。

```bash
cd /path/to/clean/trainingload-selfhost-<exact-version>
./self-host init --dry-run --json
./self-host init --json
./self-host restore /secure/path/to/backup --dry-run --json
./self-host restore /secure/path/to/backup --json
```

CLI 会先验证 manifest、checksum、版本、migration、record count、路径和空间，再写 incomplete marker。恢复失败会停止
application service、保留 marker 和诊断 report；普通 `start` 会继续被阻止，直到按报告完成安全处理。

## Restore drill

至少每个 release window 在隔离 project name 和独立 data root 中完成一次真实恢复：

1. 使用新的 release 目录、`SELF_HOST_PROJECT_NAME` 和 data root；
2. 恢复后运行 `status --json` 与 `doctor --json`；
3. 登录、读取历史活动和附件，核对核心 record count；
4. 记录 restore report，随后停止隔离实例；
5. 不删除源备份，直到保留策略允许。

没有成功 restore drill 的备份策略不能视为可恢复。

# Self-host 升级与回滚

本文定义 self-host v1 的 forward-only 升级契约。这里的“回滚”只表示切回经过声明和验证的旧 application
image；数据库不执行 destructive downgrade。Backup、application rollback 与 database rollback 是三个不同能力，
不能互相替代。

## 1. 操作入口

管理核心消费一个本地完整签名 release bundle 目录。目标 bundle 先由当前可信 CLI dry-run 认证；认证通过后由目标版本 CLI
作为 management controller 管理既有 instance directory：

```bash
./self-host upgrade /path/to/trainingload-selfhost-<target> --dry-run --json
/path/to/trainingload-selfhost-<target>/self-host upgrade \
  /path/to/trainingload-selfhost-<target> \
  --directory /path/to/installed-instance --dry-run --json
/path/to/trainingload-selfhost-<target>/self-host upgrade \
  /path/to/trainingload-selfhost-<target> \
  --directory /path/to/installed-instance --json
/path/to/trainingload-selfhost-<target>/self-host rollback 1.2.0 \
  --directory /path/to/installed-instance --dry-run --json
```

SH10 的 installer 与顶层 wrapper 调用同一管理核心，不能复制升级判断。下载/选择目标 bundle 仍由 operator 或上层
Agent 显式完成，不允许 CLI 暗中选择版本。目标主机必须有 Docker Engine、Compose v2 和固定信任边界下可用的
Cosign。相对 bundle 路径以命令 invocation directory 为基准，而不是实例目录。升级不原地覆盖签名管理文件；目标 bundle
必须保留，并作为升级后常规命令与 rollback 的 controller，始终用 `--directory` 指向实例。

## 2. Release 与迁移契约

机器契约包括：

- `docker/selfhost/release-policy.json` 与 `schemas/self-host-release-policy.schema.json`：release kind、精确
  source/rollback 版本、schema epoch 和迁移策略；
- `schemas/self-host-release-manifest.schema.json`：digest-bound image、完整 migration inventory 和供应链证据；
- `docker/selfhost/release-bundle-contract.json` 与 `schemas/self-host-release-bundle-manifest.schema.json`：可安装文件、
  entrypoint、权限和 bundle manifest；
- `docker/selfhost/compose-contract.json`：独立递增的 `composeSchemaVersion`；
- `schemas/self-host-upgrade-report.schema.json`：升级/回滚生命周期记录。

当前前 103 个 Prisma migration 冻结为 self-host v1 baseline，baseline release 固定为 `1.1.13`。
`20261019090000_self_host_ai_configuration` 是第一个后续 `expand` migration。此后每个 migration
必须在 release policy 中精确声明：

- `expand`：先增加兼容结构；
- `backfill`：在兼容结构间迁移数据；
- `contract`：删除旧结构，只能在相应 expand 至少经过两个 minor 后发布。

构建会校验 migration 目录、顺序、逐文件 SHA-256、release 归属和完整 inventory digest。缺失声明、改写历史
migration、倒序 release 或过早 contract 都会阻止 release manifest 生成。

每个目标 release 精确列出 `supportedSourceVersions`；不是“任意 N-2”。政策层限制 source 与目标属于同一 major，
且最多跨两个 minor。`applicationRollbackTo` 必须是该 source 集合的子集。初始 self-host v1 没有伪造旧版兼容数据，
因此 `1.1.13` 的两个列表为空；从真实后续 release 开始积累可演练的兼容矩阵。

Application rollback 还要求本机 source 的三个 image setting 已经是 digest reference。SH10 release builder 直接把
已认证 manifest 的 digest 写入配置模板；正式 installer 不解析 tag。直接从源码构建或仍使用 mutable tag 的实例不能
成为安全 rollback source，只能显式接受 `--accept-no-application-rollback` 后前进。

## 3. Evidence 认证与 preflight

Upgrade 在任何配置或服务变更前执行：

1. 拒绝 symlink、非常规文件、额外/缺失 checksum entry、非 portable path、权限漂移和超限 metadata；
2. 用 Cosign bundle、固定 GitHub workflow identity 和 OIDC issuer 认证 `checksums.txt`；
3. 校验 release manifest、三类 image index、SBOM、provenance、image signature payload 与 result；
4. 校验 source/target version、config schema、Compose schema、database epoch 和当前 migration checksum；
5. 拒绝 downgrade、未声明 source、历史 migration drift，以及声称可跨 contract rollback 的 manifest；
6. 读取 database/uploads 用量，并为 pre-upgrade backup、256 MiB 安全余量与 2 GiB image pull 余量检查磁盘。

Bundle schema v1 冻结一组必需 runtime baseline files；签名 manifest 可以增加文档/schema/证据文件，但不能删除基线或改变其
mode。这样旧 controller 能认证 additive 新版，而目标 controller 又能承载新的管理修复；跨 config/Compose/database schema
epoch 的变更仍被 v1 upgrade 拒绝。

信任根固定为 `https://github.com/Buerber/trainingloadai`、对应 workflow identity 和
`ghcr.io/buerber/trainingloadai/` image namespace。仅校验一份可重算的普通 checksum 不算通过。

`--dry-run` 会完成上述只读 preflight，包括 cryptographic signature verification，但不会 backup、pull、写 marker、
切换配置或重启服务。

## 4. 升级事务边界

实际升级顺序固定为：

```text
ready source
→ authenticated preflight
→ quiesced and verified backup
→ pull every target image by digest
→ inspect RepoDigests
→ persist incomplete marker
→ atomically switch only version/image settings
→ compose up + migration
→ full readiness
→ exact migration inventory equality
→ persist current release + immutable report
→ remove marker
```

旧 image 不被删除，backup 保留在 `data/backups`。升级不会自动修改站点地址、端口、provider、secret 或其他
operator 配置。成功 report 位于 `.selfhost/upgrades/upgrade-*.json`，包含 source/target descriptor、backup、
before/after/target/pending migration、application rollback 能力与 `databaseRollback: "unsupported"`。
每份 report 最多 1 MiB；rollback 最多验证 1024 个目录项和累计 64 MiB 的 report。验证逐份进行，只保留第一个按时间倒序
匹配的候选，但仍继续验证其余范围内 report；任一篡改、项数或累计字节越界均返回
`SELF_HOST_UPGRADE_STATE_INVALID`，不会从被截断或部分可信的集合选择 rollback 依据。

如果目标没有声明安全 application rollback，默认拒绝升级。只有 operator 明确传入
`--accept-no-application-rollback` 才能继续；这不会产生数据库降级能力。

## 5. 失败与恢复

一旦写入 `.selfhost/upgrade-incomplete.json` 或切换配置，任何失败都会停止 gateway/client/server，保留 PostgreSQL、
旧 image、backup、marker 和 failed report。普通 `start` 会稳定返回 `SELF_HOST_UPGRADE_INCOMPLETE`，避免把半升级实例
误判为 ready。停止动作会校验 Docker 返回值；若 containment stop 也失败，主升级/回滚错误保持不变，
`SELF_HOST_STOP_FAILED` 作为结构化 secondary failure 与 audit action 保留。若 required failed report 无法持久化，顶层返回
`SELF_HOST_UPGRADE_REPORT_FAILED`，此前的升级或回滚错误仍作为 secondary failure 保留。不要手工删除 marker。

若 report 声明 application rollback，可运行精确 source version 的 `rollback`。CLI 会重新校验 report、当前 migration
与 contract 边界、旧 image 是否仍在本机，然后原子切回旧 application image；数据库 migration 保持升级后的状态。
回滚启动失败后 marker 仍保留，且即使配置已切回旧版本，重复同一 rollback 也能安全恢复。成功前后 migration
inventory 必须完全不变。

以下情况必须从诊断或 clean restore 路径处理，而不是强行 rollback：

- release 未声明 application rollback；
- target 引入了 source 不兼容的 contract migration；
- 本地 upgrade report/marker 被修改或无法读取；
- 旧 image 已被删除；
- 当前 migration 不属于目标 release 或 checksum drift；
- backup 或数据库本身损坏。

## 6. 验证

```bash
node --test \
  scripts/selfhost/migration-policy.test.mjs \
  scripts/selfhost/release-artifact.test.mjs \
  scripts/selfhost/upgrade-plan.test.mjs \
  scripts/selfhost/management-core.test.mjs
pnpm test:selfhost-image-supply-chain
pnpm selfhost:image-supply-chain
```

单元与 fault-injection 测试不替代真实旧版 image、真实 PostgreSQL migration、registry/Cosign 和 Docker runtime
演练。退出门禁必须在 Docker-capable clean-room runner 上执行真实旧版到当前版升级，再执行声明范围内的 application
rollback。

# Trainingload.ai Self-host v1 已知限制

本文只列出已经接受、不会破坏核心数据正确性的产品边界。未通过的 P0/P1、缺失的发布证据或尚未完成的跨平台验收不是
“已知限制”，而是 RC 阻塞项，不能借本文豁免。

## 部署拓扑

- v1 是单实例、单 PostgreSQL 的 Compose 部署，不提供内置高可用、自动 failover、跨节点调度或零停机升级。
- 应用镜像只发布 `linux/amd64` 与 `linux/arm64`。macOS 与 Windows 通过 Docker Desktop 运行 Linux containers，
  不发布原生 Darwin/Windows container image。
- 默认只绑定 `127.0.0.1`。LAN 或公网暴露需要 operator 显式配置；外部代理必须另行提供身份验证与 HTTPS，公共 Client 没有凭证登录。
- v1 不自动配置外部 load balancer、DNS、对象存储生命周期、异地备份或宿主防火墙。

## 数据、备份与恢复

- 备份是 PostgreSQL logical dump 加用户 uploads，不是宿主磁盘快照。cache、diagnostics、bootstrap token、local DEM 数据和 secret 值不进入 backup。
- 恢复只允许写入新初始化且权威数据为空的 target，并要求精确 release version；不支持原地覆盖恢复。
- operator 必须把已验证 backup 复制到独立故障域，并定期在隔离 target 做 restore drill。
- local DEM 和外部 provider 状态需要按各自来源单独备份或重建。
- 单个 backup v1 最多包含 100,000 个 upload 文件、100,006 个总文件、100,000 个子目录和 64 层目录；超限实例必须先按
  受支持的数据迁移方案降低单实例文件规模，不能跳过 manifest/checksum 验证。

## 升级与回滚

- 数据库迁移是 forward-only；`databaseRollback` 固定为 `unsupported`。
- application rollback 只切回 release manifest 明确声明且本机仍保留的 digest image，数据库不会降级。
- 兼容窗口最多跨同一 major 的两个 minor，但实际可升级 source 仍必须逐版本写入
  `supportedSourceVersions`；“位于 N-2”本身不代表可升级。
- 升级会短暂停止写入并重启服务，不承诺零停机。目标没有声明 application rollback 时默认拒绝升级。

## 可选能力

- Core Local 不依赖商业地图、R2、SMTP、AI、支付或遥测；仅允许同源 local maps/local DEM，其余可选 provider 关闭。
- Connected/Extended 模式可由 operator 配置开放地图、BYOK AI 和 local DEM；provider 的可用性、配额、许可、数据处理
  条款和费用不由本发行物保证。
- 签名 v1 发行配置面固定使用 LOCAL storage，并固定关闭支付、天气、第三方同步、Agent API、Public Demo、社交登录和服务端遥测。公共版本不加载官方遥测 SDK 或项目 ID。
  应用 runtime schema 中存在这些 capability 不代表 `.env.selfhost` 支持它们；operator 的唯一机器契约是
  `schemas/self-host-instance-config.schema.json`。
- `osm-raster` 不是无条件的生产 CDN。高流量实例应使用满足自身容量和许可要求的 provider，并保留 attribution。
- 离线地图与 local DEM 数据不随基础 release bundle 分发；operator 需自行准备合法数据源。

## 运维与支持

- v1 没有内置自动 backup scheduler、自动清理策略或自动升级；应由宿主 scheduler 调用受支持的管理入口。
- `doctor` 与 diagnostics 覆盖已声明的主要故障，但 diagnostics 即使通过 secret scan，也必须人工检查后才能分享。
- recovery/audit history 采用冻结的项数与累计字节预算；backup、diagnostics、operation 或 upgrade report 目录越界时会
  显式 warning 或 fail closed。v1 不提供自动 retention，也不允许手工编辑 lifecycle/audit 记录来绕过上限。
- JSON 的稳定 `error.code`、`exitCode` 和 schema 是自动化接口；human-readable 文本不承诺兼容。
- 资源基线是验收上限，不是所有数据规模的容量承诺。持续增长的实例必须监控宿主磁盘、PostgreSQL、uploads 和 backup
  保留量，并在接近阈值前扩容。

完整日常与故障操作见 [SELF_HOST_OPERATIONS.md](./SELF_HOST_OPERATIONS.md)。安全安装入口见
[SELF_HOSTING.md](./SELF_HOSTING.md)。

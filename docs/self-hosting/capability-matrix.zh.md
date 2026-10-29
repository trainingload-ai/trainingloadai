# Self-host v1 capability matrix

本矩阵是 SH0 的人工审阅入口；完整环境变量、URL literal 和写文件调用点见 `inventory/`。`Required` 指
`core-local` 是否必须，不能据此推断 Extended 模式的业务重要性。

| Capability         | Owner                                               | Required | 默认 provider     | 启动校验                              | 降级与用户语义                                                                                                                                  | 健康 / error code         | 备份影响                                  |
| ------------------ | --------------------------------------------------- | -------: | ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------- |
| Database           | `PrismaModule`                                      |       是 | PostgreSQL 17     | `DATABASE_URL`、连接、migration       | 不可降级；readiness 失败                                                                                                                        | `SELF_HOST_DB_*`          | 一致性 dump，结构化权威源                 |
| File storage       | `StorageModule`                                     |       是 | `local`           | root 存在、目录、可读写               | 签名 v1 固定 LOCAL，不构造 R2 client；runtime 的 R2 能力不在 operator instance schema 中                                                        | `SELF_HOST_STORAGE_*`     | LOCAL 备份 `/data/uploads`                |
| Authentication     | `AuthModule`                                        |       是 | local credentials | auth secret、base URL、trusted origin | 签名 v1 固定关闭社交登录；本地 owner 登录保留                                                                                                   | `SELF_HOST_AUTH_*`        | 用户、session 数据在数据库；secret 不入包 |
| Maps               | runtime registry / client MapLibre                  |       否 | `none`            | provider、URL、attribution            | Core Local 无底图仍显示路线/起终点/比例尺；Connected 推荐无 Key 的 OpenFreeMap；外部 style 失败回退 route-only                                  | `SELF_HOST_MAP_*`         | 配置快照；tiles/cache 不备份              |
| Elevation          | `ElevationModule`                                   |       否 | `none`            | local DEM manifest/zoom/sample        | v1 operator 仅开放 local DEM；保留导入文件原始海拔，缺覆盖不破坏导入                                                                            | `SELF_HOST_ELEVATION_*`   | local DEM 只记录外部数据引用              |
| Mail               | `MailModule`                                        |       否 | `none`            | SMTP 完整组                           | 隐藏邮件 OTP/邀请；owner 初始化和本机恢复可用                                                                                                   | `SELF_HOST_MAIL_*`        | 配置引用，不保存 SMTP secret              |
| AI                 | `AiModule` / review workers                         |       否 | `none`            | provider、key、model 同组             | owner 可在 Client 配置；不得在构造期创建无凭据 client；AI 开启且 billing 关闭时由 operator 直接承担 provider 成本，不创建 SaaS 订阅、积分或欠费 | `SELF_HOST_AI_*`          | 内容和加密 secret 在 DB；API 不返回原文   |
| Billing            | `SelfHostBillingModule`                             |       否 | `none`            | v1 Compose 固定 `none`                | 独立构建不包含 Managed 支付模块或 SDK，不显示购买入口，账户删除使用本地 lifecycle adapter；operator schema 不开放支付凭据                       | `SELF_HOST_BILLING_*`     | 默认无影响                                |
| Telemetry          | server instrumentation / apps/client/docs analytics |       否 | `none`            | apps/server/client/docs 三端固定关闭  | `TELEMETRY_ENABLED` 只接受 `false`；不构造 exporter，不编译 browser token，不发送遥测                                                           | `SELF_HOST_TELEMETRY_*`   | 默认无影响                                |
| Weather            | `WeatherModule`                                     |       否 | `none`            | v1 Compose 固定 `none`                | 不生成天气快照，活动导入继续；operator schema 不开放 WeatherKit 凭据                                                                            | `SELF_HOST_WEATHER_*`     | 已有 DB 快照随 DB                         |
| Intervals.icu      | Intervals API-key integration                       |       否 | personal API key  | capability 固定开放，用户自行连接     | 仅开放用户级 API Key；OAuth/webhook 关闭；Key 使用独立实例 secret 加密；按用户选择执行同步与导出                                                | `SELF_HOST_INTEGRATION_*` | DB 保存密文；实例 secret 不入备份         |
| Other integrations | integration modules                                 |       否 | `none`            | v1 Compose 固定关闭                   | 隐藏连接入口；worker 不轮询；不注册 webhook；operator schema 不开放 provider credential                                                         | `SELF_HOST_INTEGRATION_*` | 默认无新增 token                          |
| Public demo        | `PublicDemoModule`                                  |       否 | `disabled`        | v1 Compose 固定关闭                   | 普通 self-host 不加载 demo 数据                                                                                                                 | `SELF_HOST_PUBLIC_DEMO_*` | 默认无影响                                |
| MCP / agent API    | `AgentCapabilitiesModule`                           |       否 | `disabled`        | v1 Compose 固定关闭                   | v1 不暴露 agent capability 入口                                                                                                                 | `SELF_HOST_AGENT_*`       | 默认无新增 audit 数据                     |
| Background workers | owning feature module                               |   条件式 | local queue in DB | 依赖对应 capability                   | capability 关闭时 worker 不 claim 任务                                                                                                          | `SELF_HOST_WORKER_*`      | 状态随 DB；临时文件不备份                 |

## 基线缺口状态

SH2 已关闭无 AI key 构造失败、默认遥测 exporter、self-host billing 校验和 capability 驱动 UI；
SH3 已关闭隐式 Mapbox 地图/海拔、远程默认缩略图和 attribution/tile policy 缺口；SH4 已建立
固定基础镜像、non-root runtime、双架构 smoke、SBOM/provenance/signature 与不可变 tag 契约；SH5 已建立
独立 Compose、migration gate、依赖感知 readiness、同源 BFF 与 Caddy HTTP/HTTPS 入口。剩余工作不再是
未知 owner，而是后续阶段的明确门禁：

1. `self-host doctor` 主动验证同源 local style/tile URL、local DEM manifest/zoom/sample、数据根权限与磁盘（SH7/SH9）；
2. tiles 和 DEM 继续作为 operator 管理的外部大数据引用，不进入基础镜像与默认备份（SH4/SH6）；
3. Docker 不可用的当前主机仍无法关闭容器重建、SH4 双架构执行、SH5 clean-machine Compose 和完整
   Core Local journey 门禁（`B-SH0-001` / `B-SH4-001` / `B-SH5-001`）。

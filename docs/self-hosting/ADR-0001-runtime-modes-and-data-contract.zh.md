# ADR-0001：自托管运行模式与数据边界

- 状态：Accepted
- 日期：2026-10-17
- 适用版本：self-host v1
- 决策范围：配置、数据、外部网络和降级语义

## 背景

现有单体应用把生产 SaaS 的 R2、Mapbox、AI、支付、邮件、遥测和第三方同步配置与核心运行路径混在
同一进程中。把所有环境变量都留空并不能得到可用的本地产品：启动阶段仍可能构造云客户端，数据库
元数据也可能记录成与实际文件位置不一致的 provider。

## 决策

同一组不可变应用镜像支持三个配置模式，不创建三套代码分支：

| 模式         | 核心出站网络                       | 地图                      | 可选能力                 | 默认用途               |
| ------------ | ---------------------------------- | ------------------------- | ------------------------ | ---------------------- |
| `core-local` | 默认无出站；核心旅程不依赖公网     | `none`                    | owner 可显式开启 BYOK AI | 离线、局域网、数据主权 |
| `connected`  | 只允许用户显式配置的 provider      | 推荐 OpenFreeMap，可配置  | 按项启用                 | 普通个人部署           |
| `extended`   | 按发行配置面开放的 capability 配置 | 开放、自建或商业 provider | BYOK AI、SMTP、本地 DEM  | 高级部署               |

模式只是配置 preset。每项 capability 仍有独立 provider 和状态，不能由模式名隐式开启凭据或远程调用。
`core-local` 保证“不配置云服务也可启动并完成核心旅程”，不表示必须拒绝 owner 主动选择的 AI 出站请求。
一旦 owner 开启 BYOK AI，该 capability 就是显式的联网例外，UI 和文档必须明确这一点。

### 签名 v1 的 operator 配置面

应用 runtime 保留 R2、支付、天气、第三方同步、Agent API、Public Demo、社交登录和遥测 capability，以便托管部署及后续
版本演进；但签名 v1 release Compose 没有完整暴露这些凭据、browser build inputs 或数据生命周期，因此不能把 runtime 能力
误写成当前 operator 支持。v1 的 `.env.selfhost` 只开放 LOCAL storage、maps、local DEM、SMTP、BYOK AI 和部署/网络设置，
并由 `schemas/self-host-instance-config.schema.json` 与管理 CLI 双重约束；其他 capability 在 Compose 契约中固定关闭。

`schemas/self-host-config.schema.json` 是解析后的应用 runtime schema，不是 `.env.selfhost` schema。两者分离使应用能力模型可以
演进，同时避免 operator 写入无效或只在部分进程生效的字段。

### 权威数据

- PostgreSQL/PostGIS 是结构化数据的唯一权威源。
- `STORAGE_STRATEGY=LOCAL` 时 `/data/uploads` 是文件的唯一权威源。
- `STORAGE_STRATEGY=R2` 只有在完整凭据通过启动校验后才启用；`/data/cache/storage` 只是可删除缓存。
- `/data/cache`、系统临时目录和 DuckDB 中间文件不进入备份，也不能成为数据库记录的唯一副本。
- `/data/backups` 与 `/data/diagnostics` 是用户主动生成的操作产物，不由应用核心路径隐式清理。

### 失败语义

- required capability 不可用：readiness 为失败，进程给出稳定 error code。
- optional capability 未配置：状态是 `not_configured` 或 `disabled`，进程继续启动。
- optional capability 运行失败：只关闭对应操作，不影响活动导入、查询、登录和本地文件读取。
- provider 配置不完整：拒绝“半启用”；不得静默回退到另一个云 provider。

### 配置优先级

1. owner 在 self-host Client 中保存的实例配置；
2. 签名部署配置（`.env.selfhost`）；
3. 所选模式的版本化默认值；
4. 应用安全默认值。

不读取生产 Compose 的隐含值，不从已有云凭据猜测 provider，不让客户端直接猜测服务端环境变量。
Owner 管理的 AI key 使用实例 auth secret 派生 key 加密后存入 PostgreSQL；API 不返回原文。恢复时无法解密只会关闭 AI 并
要求 owner 重新输入，不影响核心服务启动。

## 结果

正面结果：一套镜像可以覆盖离线和联网部署，provider 可替换，备份边界明确。代价是需要 capability registry、
配置 schema 和逐项启动校验；这属于一次性结构成本，能避免后续每个集成重复实现开关与错误语义。

## 不采用的方案

- 为三种模式维护三套 Compose 和代码分支：长期必然漂移。
- 保留 R2/Mapbox/AI 默认值，只在报错时降级：无法证明无云启动，也会留下错误元数据。
- 把 `/tmp` 或容器工作目录纳入备份：会把缓存误当权威数据，增加恢复不确定性。

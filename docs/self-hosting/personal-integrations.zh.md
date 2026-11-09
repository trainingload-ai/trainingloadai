# 个人平台连接

状态：Self-host **已支持** Garmin Personal API；**不开启** COROS MCP。最后更新：2026-11-09。

产品口径：Self-host 用 Garmin Personal API 连接 Garmin；闭源/托管产品另行提供 Garmin Developer API。Self-host 不以 Electron 桌面壳作为交付形态宣传。本文记录实现细节与验收门禁，不把模拟测试当成真实厂商验收。

## 范围

| 连接                | 产品状态 | 已落地的源码                                                                                                                                  | 说明 |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Garmin Personal API | Self-host 已支持 | 全球/中国固定地区、Key 换原始 JWT、本人资料与稳定 ID 验证、活动 ZIP 导入与变更复核、历史/增量任务、健康原文和权威范围投影 | 账号页连接；只读；不新增宿主环境变量 |
| COROS MCP           | Self-host **不开启** | 源码中仍有模块与工具目录，但不作为 Self-host 可用能力提供或文档宣传 | 无受支持的授权/同步路径 |
| Garmin Developer API | 闭源/托管产品 | 不在本开源 Self-host 组合中装配 | 与 Personal API 分流，见 Self-host vs Cloud 文档 |

以下 COROS 实现笔记仅供源码对照；不表示 Self-host 已开启该能力。

2026-11-01 一致性补强：写入增加数据库内容去重键，发送前严格校验未过期租约；读回比较请求中的全部字段、有序步骤和日期。`UNKNOWN` 只进行退避只读对账，最多自动检查 20 次，也可手动“重新核对”，不会再次发送。

高级预览可携带 `localWorkout: { id, revision }`，预览、确认和执行校验本地 revision 与内容快照。远端读回成功与 `PlanWorkoutExternalMapping` 在同一事务落库。手工厂商参数绑定不是本地 IR 无损转换证据，因此记录 `CONFLICT`、`localContentVerified=false`，不能伪标 `SYNCED`。完整课程 mapper 仍需真实工具 schema。

COROS 活动按日从 20 条开始，在实时 schema 允许范围内扩大请求，应用最多接受 1,000 条/日；仍饱和时显式报告不完整。活动详情变化会使旧文件缓存失效并重新导入。撤销来源必须经过两次相隔至少 30 分钟的完整日期检查，且限定到本人账号的 source UID；其他来源由既有生命周期服务接管。

COROS 健康来源独立保存到 `ImportSourceObject`，不随连接和任务删除。有明确日期及单位的受支持字段通过统一健康服务投影；来源缺失值按权威范围重建，未知结构保留来源并报错，不计为投影成功。合成样例验证不代替真实厂商字段验收。

## Garmin 自查补强（2026-11-01）

- 契约核对基于 [Garmin 官方 OpenAPI 1.0.0](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)，不套用非官方 Connect 接口样例。`UserSettingsDTO` 无用户 ID，连接时另读已鉴权 `UserDailySummaryDto.userProfileId`；缺少稳定 ID 时拒绝建立连接，不拿显示名或未验证 JWT claim 代替身份。
- `dailysummaries` 使用 `data[]` 中的 V2 嵌套字段；睡眠使用直接 `DailySleepDTO`；体重使用 `dailyWeightSummaries[].latestWeight.weight`，单位已经是 **kg**。所有每日健康对象核对日期；体重的前后相邻记录仅供原始查询，不投影到当天。
- 六组定期健康读取独立记录结果。原文及读取状态按账号、日期和内容 hash 保存至版本化 `ImportSourceObject`，不随连接/任务删除。成功识别的资源通过统一健康服务按账号/日/指标范围替换；明确空数据可撤销该范围旧指标。403/404、未知结构和日期冲突不清旧指标，其他成功资源仍可导入，整体任务报告部分失败。限流立即停止后续请求并等待厂商规定时间。
- 活动每页 99 条、升序发现，保存当天累计 ID，只有完整尾页后才检查缺失。重复/重叠页或达到 100 页安全边界时报不完整，不做删除推断。上游未提供原子分页快照，因此不宣称分页结果具备事务一致性；来源撤销还要求两次相隔 30 分钟的完整检查及详情接口明确 404，活动日期变化或权限错误不会被当成删除。
- 已成功来源在新的同步中重新检查详情和原始文件。相同来源 UID 复用既有导入/实体化流程；原始文件 SHA-256 单独保留，明确的远端摘要修改参与 canonical 来源版本，避免 FIT 未变时漏掉名称、距离和时长修改。多运动文件不把整场汇总复制到每个子项目。
- 401 最多换 token 重试一次，已经被另一 worker 换新的 token 直接复用；403 与 404 不会触发整连接授权失效。请求限制所选固定 origin，不接受绝对 URL、跨域 URL 或重定向。断开使用连接版本 CAS；Garmin 旧密文损坏也能本地断开。
- 排队中的活动/健康任务在执行时重新检查方向开关和凭据版本；健康任务时区变化后须重新发起。已经交给通用导入流水线的文件仍可能完成。
- 同步检查点、缓存提交和健康落库前校验租约未过期；过期 worker 停止写入，由统一恢复流程接管。按账号撤销来源同时覆盖文件解析产生的 `#0`、`#1` 等课段 UID，避免只撤销外层记录而漏掉实际来源。
- **Garmin Personal API 只供 Self-host Owner 使用。** 公共 `AppModule` 不装配个人连接模块；只有 `SelfHostAppModule`/Self-host scheduler 装配。Cloud capability 强制禁用，后台 worker 在 Cloud 不注册轮询、不调度、不读取任务，Garmin 路由额外使用 `SelfHostOwnerGuard`。前端同时校验部署类型和 capability，Cloud 不展示入口、不请求个人连接状态；私有 Cloud 继续使用其原有 Garmin 接入。

模拟回归与官方契约核对均不能替代本人 Key 的真实端到端验证。签名发行与镜像更新仍按 Self-host 发布流程推进。

## 连接生命周期与并发复查（2026-11-01）

- 来源、任务、健康投影、发送去重和本地远端映射均使用“地区 + 厂商账号 ID”识别账号；不同地区的相同数字 ID 不共用状态。界面仍显示厂商原始账号 ID。
- 断开以事务清空凭据、禁用连接并取消未发送任务，不删除发送账本。已成功和结果不明的发送保留去重键，运行中发送转为 `UNKNOWN`；同账号重新授权后仅核对远端结果。每次重新授权生成新的授权版本，即使厂商返回相同 token，也不会使旧授权任务重新有效。
- COROS 文件预算按地区/账号保留滚动 24 小时预约。断开、重新授权、切换账号及进程重启不清额度。额度预约与连接替换先锁同一连接行，避免并发覆盖元数据。
- 发送完成事务按“连接行 → 任务行”顺序加锁，并在事务内重新确认当前连接有效且账号匹配；断开或切换账号后，晚到结果不能被记为成功或创建错误映射。可用的晚到回执仍保存在 `UNKNOWN` 账本中。
- 父同步任务部分失败后，界面继续轮询尚未完成的子任务；新导入活动和健康天数变化都会刷新相关查询。未保存的设置变更会阻止立即同步，并提示先保存，避免按旧设置执行。
- Garmin 和 COROS 的交互 API 均要求 Self-host Owner。COROS 匿名 OAuth 回调独立控制器装配，仍校验短期单次 state；它不继承交互 API 的 Owner guard。

## 模块与存储

- `PersonalIntegrationsModule` 只在 `SelfHostAppModule` 和其调度组合中装配。
- `PersonalConnectionService` 拥有账号连接、state、加密凭据和刷新；OAuth 的 verifier 同样使用密文。
- `PersonalSyncService` 负责发现、下载与检查点，复用 `ImportBatchService`、Source Adapter、Trackswap、Canonical materializer 和 `HealthDataIngestService`。
- `PersonalWriteService` 只验证、预览、确认和发送，不启动模型。预览最多有效 15 分钟；已发出的未知结果不自动重试。
- `PersonalWorkerService` 使用数据库任务、单连接运行唯一约束和租约恢复。统一第三方调度器负责定期发现，worker 的轮询仅消费已持久化任务。
- 状态查询从子任务账本计算已导入数，即使父任务发现过程失败，后续完成的导入也会反映在界面。连接替换在数据库事务内检查凭据版本并取消旧任务，过期授权回调不能覆盖新的连接。
- Core migration `0022_personal_integrations` 增加来源枚举与 `t_personal_provider_job`。不修改已发行迁移；实例升级沿正式管理入口执行，不手工降级数据库。
- 凭据继续使用 `EXTERNAL_PROVIDER_CREDENTIAL_SECRET` 对应的既有实例集成密钥和兼容旧记录的 AES-256-GCM `v1` 信封。

新增宿主变量和 secret：**0**。地区、IANA 时区和方向开关由 Owner 在连接界面保存。不得把 Key/token 填入公开环境示例。

## API 和能力

Owner API 前缀为 `/api/garmin-personal` 和 `/api/coros-mcp`。浏览器通过同源 BFF 访问。状态、设置、同步、任务查询和断开均校验当前用户；COROS 回调仅凭短期单次 state 绑定原 Owner。

独立 capability 为 `garmin-personal-api-key`、`coros-mcp`。它们不会打开总 `third-party-sync`。厂商授权失效返回连接错误，不用应用会话的 HTTP 401 表达。

Garmin 只读；营养和经期不进入定期同步，单独高级读取需要明确确认。COROS 默认不允许写入。固定 allowlist 不包含删除操作，也不把远程工具描述拼入 AI prompt。

COROS 课程/计划/路线参数通过当前 `tools/list` schema 校验。复杂预览 JSON 上限 2 MiB；BFF 和专用 Server body parser 一致，其余请求保持原有限额。

## 外联和持久数据

- Garmin 只访问所选 `personal.connectapi.garmin.com` 或 `.cn`，不跨区重试。
- COROS 只在所选官方地区发现元数据、注册、授权、换 token、撤销及调用 `/mcp`。
- FIT 签名下载不携带 MCP token，固定解析后的公共 IPv4，拒绝私网/特殊地址与重定向；下载链接不持久化、不写日志。
- Garmin 活动发现按所选整段 `startDate`–`endDate` 做 offset 分页（每页最多 99），不再按天扫列表。缺失观察在完整窗口分页结束后进行；COROS 仍按天。
- COROS 活动发现从官方默认 20 条起步，按实时 schema 允许范围扩大；仍达上限时显式报告不完整，不静默当作全部记录。
- ZIP 限条目数量、总解压大小、压缩比和文件类型；拒绝路径穿越、symlink、嵌套归档与歧义原始文件。
- 数据库备份包含任务、检查点、额度和凭据密文；uploads 仍按现有备份流程保存。恢复凭据需要原集成密钥。
- 断开事务清除凭据、禁用连接并取消未发出的任务；保留活动、健康事实、发送回执、内容去重键和账号额度。运行中的发送变为 `UNKNOWN`，重新授权后只读核对；不会因删除账本而重复发送。删除账号时才级联删除账本。已经交给统一导入流水线的文件不承诺停止。
- 新接入不会自行向 AI 发送数据。只有通过明确日期、单位和指标契约校验的健康事实才能参与每日投影；厂商恢复评分不覆盖本地模型。

## 发布前必须完成

2026-11-01 本机验证：Client/Server/Docs 生产构建通过；Server Self-host **42 组 277 项**、Client **22 组 134 项**通过。覆盖官方 Garmin DTO、同文件摘要编辑、分页完整性、账号来源撤销、健康部分失败、租约过期、方向/时区变更、断开重连、滚动预算、地区隔离、晚到回执，以及 Cloud 的 capability、worker、界面隔离和真实模块装配图检查。

浏览器使用固定 API 样例检查 **12 组**桌面/手机、浅色/暗色、新连接/已连接、结果不明只读核对和未保存设置场景：没有页面脚本错误或横向溢出，小屏内容可滚动、底部操作可达。这是页面与交互检查，不是真实厂商端到端验证。前一轮 Core 迁移 **9 项**隔离测试证据保留；本次复查未修改 schema/migration。

Self-host 当前产品范围以 Garmin Personal API 为准；COROS MCP 保持关闭，不作为发布阻塞项。签名镜像与发行包节奏仍按既有 Self-host 发布流程。

1. Garmin Personal API：真实 Key 完成发现、下载、导入与去重；区分「发现」与「已导入」。
2. 账号页连接态：桌面/手机、浅色/暗色、错误与刷新。
3. Client/Server 类型检查、构建、Self-host DI 与迁移回归。
4. Docs EN/ZH 与能力矩阵口径一致：支持 Garmin Personal API；不开启 COROS MCP；托管侧写明 Garmin Developer API。
5. COROS MCP 若日后重新启用，再单独完成 OAuth、schema、写入读回与健康投影验收；当前不启用。

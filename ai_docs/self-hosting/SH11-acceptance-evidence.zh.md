# SH11 跨平台与非功能验收证据

日期：2026-10-18

revision：本阶段提交生成后以 git revision 为准。

## 当前结论

SH11 的可执行矩阵、fail-closed 汇总门禁、报告 schema、故障注入、安全审计和 runner 信任边界已实现；仓库内静态契约与
合成证据通过。当前环境没有 Docker，且尚无一对可用的当前/上一版正式签名 self-host release 与专用 macOS/Windows runner，
所以 8 格真实矩阵尚未执行。SH11 退出门禁保持未通过，不能把实现完成表述为跨平台验收完成。

## 交付映射

| 门禁             | 实现/证据                                                                                                            | 当前状态                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 四平台双模式     | Ubuntu amd64、Linux arm64、macOS arm64、Windows/WSL2 × Core Local/Connected，共 8 格                                 | workflow 合约通过                |
| 签名输入         | 外层 archive checksum signature + 内层 bundle signature + exact version/revision                                     | fault test 通过                  |
| 持久 runner 安全 | checkout 前认证；认证阶段不解包；临时根唯一且 only test-owned cleanup                                                | 合约测试通过                     |
| 核心用户旅程     | 同源 proxy GPX 上传、异步 READY、列表/详情、route layer、本地双主题缩略图、含海拔导出                                | runner 已实现                    |
| 数据生命周期     | 完整核心旅程经 restart、recreate、clean restore、safe uninstall/reinstall、signed upgrade、application rollback 重验 | runner 已实现                    |
| 故障注入         | DB stop + doctor/diagnostics、network disconnect、zero-free-space、permission、provider timeout                      | runner 已实现                    |
| 默认安全         | runtime UID/rootfs/caps/no-new-privileges/DB port inspect + Compose 静态契约                                         | 单元/静态通过                    |
| 镜像漏洞门禁     | 精确 digest 的 3×2 Docker Scout SARIF；fixable critical/high finding 必须为零                                        | 合约/合成通过，registry 执行阻塞 |
| 非功能基线       | 时间阈值、20-sample P95、2 GiB memory/data growth 上限、逐平台 8/16 GiB disk preflight                               | schema/逻辑通过                  |
| 全矩阵闭环       | 8 报告及环境记录逐格重验、精确覆盖、self-contained checksums、GitHub OIDC aggregate signature                        | 合成测试通过                     |
| 破坏性边界       | 不使用 `down -v`/`--volumes`；只删除校验后的随机测试目录                                                             | 机器门禁通过                     |

## 关键不变量

1. Workflow 只能手工从当前 `v<version>` tag 触发，`GITHUB_SHA` 必须等于输入的当前 release revision。
2. 持久 self-hosted runner 在任何 checkout 前完成 archive checksum、Cosign exact identity 与 manifest binding 验证；验签前从
   稳定句柄冻结外层 checksum，Cosign 返回后逐字节复核，archive 在 `tar -tzf`/`tar -tvzf` 与 manifest 流式读取前后都必须命中
   签名摘要。链接、special file、超限 metadata 或 bootstrap JavaScript 语法漂移均 fail closed；checkout 后的解包器再独立复验。
3. 当前和上一版都必须是完整签名 release；没有 prior release 时 upgrade/rollback 不允许 skip 或 mock。
4. 每个 cell 必须覆盖其 mode 的全部 P0/P1；failed/missing/duplicate/extra report 均使 finalizer 失败。
5. Aggregate artifact 只有在 matrix job 整体成功后生成，并由 acceptance workflow 的 tag identity 签名。
6. 所有测试数据、owner credential、bootstrap token、Compose namespace 与端口都属于随机 synthetic workspace；首次 claim
   必须先执行同参数 dry-run，再经统一 `owner-bootstrap` 管理命令完成；该 claim 路径只在容器内读取 token，password 只走 stdin；
   harness 仅为权限与 replay 断言读取 synthetic token，dry-run、结果与报告都不包含 identity 或 secret。
7. fixture 必须由公开上传 API 创建，禁止用 SQL/容器文件直写替代；故障恢复后必须再次验证登录、活动 API、路线、缩略图、导出与
   migration count，而不只检查容器状态。
8. Connected provider 场景让 fixture 接受连接但不响应，至少等待 7 秒，证明命中 timeout 路径而非 connection-refused 快路径。
9. PostgreSQL 已被 Compose 观察到但不健康时，doctor 的数据库检查必须是 `fail` 而不是 `skipped`；错误码必须已登记，
   diagnostics 必须经 dry-run、secret scan、checksum 和 schema 复验后才可作为该 cell 的支持证据。
10. safe uninstall 必须删除本实例 container/network、保留配置和持久数据、重新启动后重验核心旅程；任何 `-v/--volumes` 都使门禁失败。
11. Release evidence 必须包含并签名覆盖六份零 finding SARIF；缺格、阳性 finding、digest/checksum 漂移均拒绝进入验收输入。
12. acceptance runner 与 Compose smoke 复用管理 CLI 的环境隔离器；Compose YAML 和实际 `.env.selfhost` 值中的插值变量
    都从宿主环境移除，`COMPOSE_*` 不能改变被验收的 data-root、image、provider、project 或 profile，Docker 连接环境继续保留。
13. 首次安装和 clean restore 目标初始化都通过同一 helper 复用 `--no-start` 参数：先追加 `--dry-run` 并确认
    `status=planned`、`dryRun=true`，再执行原参数；静态门禁拒绝参数漂移、漏预演或绕过 helper。
14. acceptance contract v2 为全部 17 个场景声明必须进入报告的稳定语义证据；runner 自检和最终 8 格汇总都会拒绝
    release 验签、安装、owner claim、核心旅程、持久化、备份恢复、升级回滚、故障恢复、安全、资源或卸载重装语义被削弱的报告。
15. runtime security 报告必须精确覆盖 7 项 contract evidence，包含服务集合、DB 无宿主端口和两类 capability allowlist；
    缺项、重复、额外项、非 pass 或 details 漂移都会使单格与最终汇总失败。可选 docs profile 继续由 Compose 静态契约覆盖。
16. 动态场景证据必须与报告 release 和 measurements 交叉一致：安装/升级/回滚版本、restart/recreate migration count、
    diagnostics SHA-256、资源 P95 以及 Connected provider 至少 7 秒 timeout 均由最终汇总复验；五项生命周期耗时必须大于零。
17. `environment.json` 的 Docker/Compose 版本由 runner 和 finalizer 复用管理核心解析器双重验证；Docker 版本必须有界合法，
    Compose 必须为 major 2 或更高，`availableBytes` 必须是最多 20 位的正整数字符串，不能用任意非空文本或超大整数
    冒充受支持 runtime。
18. runner 在每次写报告前使用已知 synthetic email/password/bootstrap token 做精确扫描并叠加高置信通用模式；finalizer 对原始
    report/environment 再独立扫描，RC 下载后验证器对签名 aggregate 继续重扫。任何 private key、token、连接密码、email 或
    宿主用户路径命中都会阻止签名汇总或下载验证通过。
19. macOS 与 Windows cell 的 `dockerOperatingSystem` 必须明确识别为 Docker Desktop；runner 与 finalizer 共用同一有界校验，
    避免只凭 host/daemon 架构就把其他 runtime 误记为 contract 规定环境。Windows WSL2 继续由受信任 runner label 约束。
20. runner 只从单一已验证的非 symlink 普通文件句柄读取 release preparation、Compose 与 `.env.selfhost`，单文件上限
    1 MiB；diagnostics 上限 32 MiB，且磁盘文件字节数必须与管理 CLI 返回的 `sizeBytes` 精确一致；打开前后身份、长度或
    时间戳变化都会失败。
21. Acceptance aggregate 下载验证先在 10,000 文件、10,000 目录、64 层和 64 MiB 累计预算内复制到随机私有工作目录；
    复制只读取打开时声明的文件长度，拒绝中途增长/缩短，并在复制后重验精确 path/type/size inventory 与累计预算；aggregate
    验签、checksum、8 格报告/环境和 contract 语义复验全部只读取该快照。Cosign 调用前冻结 checksum payload 原始字节，返回后
    必须逐字节一致再按该 payload 重算完整 inventory；来源目录或验签回调期间的工作副本变化都不能改变本次结论。
22. Aggregate finalizer 对每格 report/environment 只读取一次，并把完成 schema、secret、release/runtime 与场景语义校验的同一
    Buffer 以 exclusive create 写入随机私有 staging，单项摘要也直接来自该 Buffer；完整 manifest 与 checksum 生成后才以同目录
    atomic rename 发布最终目录。验证失败只清理本次 staging，进程中断不会暴露可被误认作正式 gate 的半成品目录，也不能在验证后
    重新打开可变 runner artifact，把另一组字节纳入签名 aggregate。
23. Runner 复制已认证 release 时不得使用无界递归复制：先冻结最多 10,128 文件、100,000 目录、64 层、32 MiB 单文件和
    512 MiB 累计树清单，再以清单中的精确大小和 POSIX mode 逐文件稳定复制；复制后重新核对 path/type/size/mode，失败时删除
    部分目标。RC acceptance/release 快照复用同一原语，并额外执行各自 evidence tree 约束。
24. Release preparation record 与 `environment.json` 先写入同目录随机临时普通文件，完成权限收紧和 `fsync` 后才 exclusive
    publish；每个场景都会更新的 `acceptance-report.json` 只允许 atomic replace 既有普通文件并拒绝 symlink。即使 runner 被中断，
    `always()` 上传步骤也只能看到上一份完整 JSON 或不存在的最终路径，不能看到被截断的证据。
25. Acceptance/RC release preparer 在外层验签后冻结 archive 摘要，并在 `tar -tzf/-tvzf` 检查完成后、`tar -xzf` 解包完成后
    分别重算；任一步骤期间 archive 漂移都会在执行 bundle 内代码或发布解包目录前失败，不能用另一份内层已签名 bundle 替代外层
    签名实际绑定的 archive。
26. Runner 最终清理必须检查 tile fixture stop、每个 test-owned Compose project 的 `down` 与随机工作区删除结果。任何失败都把
    cell report 改为 failed 并使 matrix job 非零退出；失败 report 写入错误和原始场景错误必须进入 aggregate error，不能留下
    `passed` report 后静默污染持久 runner。
27. 内层 release evidence 的 Cosign 回调结束后，不只重验 verifier 私有快照；还会对待发布的实际解包目录重验签名子树、全部
    checksum、checksum/signature bundle 摘要与文件 mode。回调期间改写 installer 或其他源文件，不能借“快照 A 已验签”执行
    “目录 B”的内容。
28. Acceptance report/environment、aggregate、release 与 RC 证据复用的 artifact staging/replace 原语，在主发布失败后仍必须检查
    打开句柄关闭和同目录 `.partial` 删除；只忽略已不存在的临时文件。二次清理失败必须连同原始发布错误聚合抛出并带稳定
    filesystem code，不能让 runner 或 finalizer 把含敏感信息或未完成证据的残留文件静默留在持久工作区。
29. Release bundle、acceptance aggregate、外层 archive preparation、内层 release evidence snapshot、RC assembly 与下载后验证的
    staging/work 目录使用同一清理失败聚合原语。所有 required cleanup 都会执行；主验证/装配错误与每个删除错误同时保留，
    成功路径的清理失败也会使 gate 非零退出，不能由 `catch` / `finally` 覆盖更早故障。
30. 权限、网络与数据库故障注入必须在执行破坏性步骤前挂接 required recovery；恢复命令失败时 gate 必须失败，且主场景错误与恢复
    错误以同一 `AggregateError` 保留。数据库停止后的不健康等待也位于恢复保护内，不能因等待超时把测试实例静默留在故障态。
31. HTTP/HTTPS 端口必须在同一窗口完成预留并逐个释放。端口申请失败时仍释放所有已监听 server；多个 close 失败全部保留，且申请
    主错误与关闭错误聚合返回，不能由 `Promise.all` 的首个 rejection 隐藏其余清理故障。

## 已完成的本地验证

- acceptance contract、workflow、runner 和 aggregate gate machine validator：通过；
- report/manifest JSON schema 与 8 格合成汇总：通过；
- 缺格、错误 release identity、archive tamper、symlink archive、签名/checkout 顺序、mutable action、fail-open mutation：均按预期失败；
- 同时端口占位、provider hang fixture、清理边界：单元通过；
- Compose security contract 与 image supply-chain workflow contract：通过；
- safe uninstall/reinstall runner、默认保留数据和孤儿网络清理回归：通过；
- 首次安装与 clean restore 的同参数 installer dry-run 顺序、计划状态和防漂移 fault tests：通过；
- 报告场景证据 contract、runner/finalizer 强制校验及降级 fault tests：通过；
- runtime security contract 的精确覆盖、details 绑定和缺项/降级 fault tests：通过；
- release/measurement 动态证据交叉校验、正耗时与 provider timeout 下限 fault tests：通过；
- Docker/Compose runtime 版本双重解析与 Compose v1 降级 fault test：通过；
- runner 精确 secret scan、finalizer 独立通用扫描与 identity 泄漏 fault test：通过；
- 下载后签名 aggregate 的 secret 重扫与有界磁盘字节解析 fault tests：通过；
- macOS/Windows Docker Desktop runtime 绑定与共享校验单元测试：通过；
- runner metadata/Compose/config/diagnostics 有界普通文件读取与 size mismatch fault tests：通过；
- acceptance aggregate 与完整 RC 的有界快照、验签期间来源替换 fault tests：通过；
- acceptance release 与 RC evidence 的有界树复制、累计预算、逐文件大小和 mode 回归：通过；
- 漏洞证据的 3×2 覆盖、阳性 finding、symlink 与 checksum 漂移 fault tests：通过；
- 全部 `scripts/selfhost/*.test.mjs`：以当前 revision 的 CI 汇总为准（本地最新完整运行全部通过）；
- `git diff --check` 与 workflow/Compose YAML parse：通过。

## 未通过门禁与 blocker

- `B-SH11-001`：当前开发 host 不提供 Docker Engine/Compose；真实 install/restart/recreate/backup/restore/upgrade/fault/security
  runner 与 registry CVE scan 无法在本机执行。
- `B-SH11-002`：没有证据表明带约定 labels 的专用 macOS Apple Silicon 与 Windows 11 Docker Desktop/WSL2 runner 已连接并完成
  受信任仓库隔离配置。
- `B-SH8B-002`：尚无可诚实用于旧版 → 当前版演练的上一版正式签名 self-host release；不得自行伪造 prior artifact。
- `B-SH10-001`：clean-room installer 的环境级验证仍依赖首个真实签名 release 与 Docker-capable host。

这些 blocker 不妨碍继续实现 SH12 的 RC 冻结与证据验证机制，但会阻止 SH11、SH12 和 self-host v1 总完成定义被标记为通过。

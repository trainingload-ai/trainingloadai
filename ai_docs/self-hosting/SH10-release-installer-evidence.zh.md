# SH10 可安装发行包与 Agent 部署契约证据

日期：2026-10-18

revision：本阶段提交生成后以 git revision 为准。

## 交付映射

| 门禁           | 实现/证据                                                                             | 状态                         |
| -------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| 完整发行物     | 版本化 bundle contract、固定 inventory/mode、32 MiB 单文件与 512 MiB 累计预算         | 单元通过                     |
| 供应链绑定     | release manifest、逐镜像证据、所有运行文件由一份签名 checksum inventory 覆盖          | tamper/path/mode fault 通过  |
| digest 配置    | builder 把 apps/server/client/docs image 精确 digest 写入配置模板                          | 单元通过                     |
| 跨平台入口     | `install.sh` / `install.ps1` 与 `self-host` / `self-host.ps1` 只委托同一 Node 核心    | 合约测试通过                 |
| 安装 preflight | Node/宿主元组、Cosign、bundle signature、共享 init plan；已有实例再验 start plan      | dry-run/fault injection 通过 |
| 安装生命周期   | installer 委托既有 `init` → `start`，不复制 Compose/readiness 判断                    | mocked lifecycle 通过        |
| 机器接口       | install result schema、稳定 exit code、包括 usage failure 的纯 JSON 输出              | schema 测试通过              |
| 配置边界       | instance schema 与 resolved runtime schema 分离；未知/no-op operator 字段 fail closed | schema/CLI 合约测试通过      |
| Agent 安全边界 | bundle 自带 `AGENTS.md`；dry-run 优先；owner secret 必须由用户本机处理                | 合约测试通过                 |
| 可复现归档     | 固定排序、commit timestamp、uid/gid；CI 构建两份归档并逐字节比较                      | workflow 合约通过            |
| 用户文档       | 根 `SELF_HOSTING.md`、`UPGRADE.md`、`BACKUP_RESTORE.md` 随 bundle 发布                | inventory 测试通过           |

## 关键不变量

1. 正式部署输入只能是完整签名 release bundle；源码目录和单独 image evidence 不是等价发行物。
2. `checksums.txt` 覆盖除其自身和 Cosign signature bundle 外的全部发布文件；验证器拒绝缺失、额外、重复、非 portable path、symlink、checksum drift 与权限漂移。
3. Bundle 允许安装后出现声明的 `.env.selfhost`、`data/` 和 operation state，但这些运行态内容永远不能代替或遮蔽已签名发布文件。
4. 安装器在 bundle 验证通过前不创建配置、数据或容器；`--dry-run` 调用共享 `init` planner 验证模板、已有配置与 data-root，
   但以内部分支禁止 operation record，不创建 `.env.selfhost`、`.selfhost`、数据或容器。已有实例通过 init 检查时还会复用
   `start --dry-run` 完成 Compose/readiness plan；新实例因配置尚未落盘只报告 start planned。
5. `--no-start` 只用于先生成受保护配置，不降低宿主平台、bundle、Node 或 Cosign 验证；真正 start 仍走统一管理 CLI。
6. Installer 不读取、不打印生成的 secret；唯一 owner bootstrap 通过统一管理 CLI 在用户本机完成，容器内读取 token，密码只走
   stdin，Bash/PowerShell 结果与 audit 都不包含 identity/password/token；Agent 不得索取、生成、读取或代填 password/token。
7. 升级入口与首次安装验证相同的完整 bundle，不再接受仅包含底层 evidence 的目录。
8. Release root 的 Shell/PowerShell 文件不含业务判断，避免四套入口随时间产生语义漂移。
9. Bundle schema v1 冻结 required runtime baseline；签名 manifest 可增加文件但不能删除基线或漂移 mode，避免旧 verifier
   因新版新增文档/schema 而拒绝合法升级。
10. 需要立即启动时，Installer 对 Docker/Compose 输出做有界解析，只接受 Compose major ≥ 2 与 Linux
    `amd64`/`arm64` daemon；Windows containers、Compose v1、未知架构、畸形 info/version 必须在调用 `init` 前失败，
    且原始输出不进入 JSON 结果。
11. Installer 在调用 Cosign、读取 bundle 或初始化前按 Node platform/architecture 拒绝发行矩阵外的宿主；macOS Intel、
    Windows ARM 与未知 OS 使用非 retryable 的稳定 prerequisite code，不把“换宿主”错误描述成可重试 daemon 故障。
12. Release builder 在复制每个源码/证据文件前执行 32 MiB 单文件与 512 MiB 累计预算检查；安装验证器在 checksum hashing
    与 Cosign 前对完整签名集合执行相同检查。超限输入不能依赖最终 tarball 上限兜底。
13. Acceptance/RC 在解包已认证 release archive 前解析 tar 的 portable path、regular/directory 类型和声明展开大小；
    任一文件超过 32 MiB 或累计超过 512 MiB 时不执行 extraction。
14. 安装后的 bundle 根目录最多接受 1024 个顶层条目；签名 inventory 外仅允许 `.env.selfhost` regular file 和真实运行时目录。
    未声明普通文件、symlink、special file 或 entry flood 在内层验签前失败，自定义 data-root 仍可作为独立真实目录使用。
15. `init` 对 data-root 同时校验词法路径与 prospective physical path；目标尚未创建时也从最近现存祖先解析 symlink，禁止
    运行态目录通过外部别名落入 `scripts/`、`docker/` 等签名子树。
16. Installer 后续委托的 Compose 生命周期以已验证的实例 `.env.selfhost` 为唯一插值配置源，Docker 消费其私有 operation
    快照；隔离器同时扫描 Compose YAML 与 `.env.selfhost` 内容，宿主同名变量与 `COMPOSE_*` 不能覆盖 data-root、image、
    provider、project 或 profile，Docker 连接变量不受影响。
17. Release contract、manifest、checksum inventory、实际文件树与 tar 类型清单共享 portable path collision 检查；解包或签名前
    拒绝大小写不敏感、Unicode NFKC 等价以及“文件同时作为父目录”的冲突，避免同一工件在 Linux、macOS、Windows 上落成
    不同文件树。
18. Acceptance/RC 先把 archive、checksum 与 signature bundle 复制到随机 staging；外层哈希/验签、tar 清单、解包和内层验签
    全部只消费该快照，身份绑定通过后再原子发布解包目录。Archive 在 tar 清单检查完成后、解包完成后都必须再次命中外层签名
    绑定的摘要，来源 artifact 或 staging archive 在验证期间被替换都不能改变实际验收的字节。
19. Release builder、archive snapshot 与 acceptance/RC evidence copy 共享固定长度 copy primitive：`lstat` 与打开句柄的
    device/inode/size 必须一致，只读取打开时长度，拒绝短读、尾随增长、短写和非 exclusive destination；失败时只清理本次创建的
    partial file，不删除既有路径。
20. Release/backup/bundle verifier 的 metadata 解析和 SHA-256 不再采用 `lstat` 后按路径二次打开；每次读取与摘要计算都校验
    同一句柄的 device/inode/size/mtime/ctime 前后状态，迁移 SQL inventory 也复用相同的稳定摘要实现。
21. 内层 release evidence verifier 在任何 hashing、Cosign 或 evidence 语义判断前创建随机私有有界快照；单文件 32 MiB、
    累计 512 MiB、文件数和 exact-tree 约束在复制时再次执行。Bundle verifier 将首次读取的 release/bundle manifest 与配置模板
    原始字节摘要绑定回快照内签名 inventory，杜绝“内容按 A 校验、签名按 B 验证”。
22. Checksum inventory 使用同目录临时普通文件完成写入、权限收紧与 `fsync`，再以 atomic rename 替换既有普通 checksum；
    symlink、目录或 special-file 目标一律拒绝，进程中断不会把已存在的完整 inventory 截断成半成品。
23. 内层验签快照同时冻结 checksum 与 Cosign bundle 摘要；验签返回后，bundle verifier 对实际解包源重新执行 runtime-root、签名
    子树 exact inventory、累计大小、逐文件 checksum、两份签名工件摘要与 mode 校验。Cosign 回调期间改写 `install.sh`、manifest、
    checksum 或 signature bundle 都会在 installer 入口被调用前失败。
24. `schemas/self-host-instance-config.schema.json` 是 `.env.selfhost` 唯一 operator 机器契约；它与管理 CLI 的 51 个 allowlist
    key 及 Compose 插值面逐项相等。`schemas/self-host-config.schema.json` 只描述解析后的应用 runtime。签名 v1 把 R2、支付、
    天气、除 Intervals.icu 个人 API Key 外的第三方同步、Agent API、Public Demo、社交登录和遥测固定关闭，未知字段与看似开启但无法完整工作的设置在 Docker 前
    fail closed。
25. `.env.selfhost` parser 与 Compose 共享的语法子集显式处理完整引号、转义和行尾注释，并禁止未引用/双引号值中的
    `$VAR`/`${VAR}`。字面 `$` 只能放在完整单引号值中；这样 CLI 做路径、secret 与 provider 校验的字节和 Compose 实际注入的
    字节一致，宿主环境不能在预检后改写实例值。
26. 每次 management operation 将稳定读取且已校验的 `.env.selfhost`、基础 Compose 定义、可选 source overlay 与 Caddyfile
    复制到 `.selfhost` 下的私有、operation-scoped 快照。快照 Compose 以 long-form bind 只挂载同目录 Caddyfile，避免宿主
    绝对路径中的盘符或冒号被短语法误切分；Docker 不再打开原始运行输入；upgrade/rollback 切换时同步替换已重新校验的 env
    快照。结束清理前复核已知摘要，内容漂移或残留未知条目均
    fail closed，避免“校验 A、执行 B”。
27. Bundle verifier 将已通过签名与 source-tree 复核的 checksum inventory 传入 installer 的共享 init/start planner；模板、
    Compose 与 Caddyfile 的稳定读取结果必须命中该 inventory。验签返回后发生的路径改写会在任何 Docker 调用或配置落盘前返回
    `SELF_HOST_RELEASE_STATE_INVALID`。普通独立 lifecycle 不伪造这份 authenticated context。
28. Release bundle builder 与内层 evidence verifier 的 staging/snapshot 目录清理不得覆盖主失败：主操作失败而目录删除也失败时，
    两者进入同一带 filesystem code 的 `AggregateError`；主操作成功但 required cleanup 失败时仍整体失败。发行流程不能把未清理
    的部分 bundle 或已验签私有快照静默留在 runner。
29. Release/backup/bundle 的有界读取、固定长度复制与目录 `fsync` 必须在所有路径关闭每个句柄；双句柄复制不能只报告第一个
    close 失败。主 read/write/sync 错误与全部句柄清理错误以同一 `AggregateError` 保留，确保 checksum 和发布耐久性故障都可取证。
30. 镜像层扫描器的临时工作区属于 required cleanup。扫描或外部工具失败且工作区删除也失败时，两者必须聚合保留；扫描成功但
    删除失败时供应链 gate 仍非零退出，不能由 `finally` 的删除异常覆盖真正的扫描故障。

## 已执行验证

- 全部 `scripts/selfhost/*.test.mjs`：以当前 revision 的 CI 汇总为准（本地最新完整运行全部通过）；
- `pnpm selfhost:agent-contract`：3/3 通过；
- `node --test scripts/selfhost/instance-config-contract.test.mjs`：4/4 通过；
- `pnpm selfhost:compose-contract`：6 个 required service、1 个 optional profile 通过；
- `pnpm validate:deployment-config`：288 个 contract key、284 个 runtime key 一致；
- `node scripts/precommit-deployment-config.mjs`：通过；
- `pnpm selfhost:image-supply-chain`：3 个镜像角色、2 个架构、10 个 pinned action 通过；
- `pnpm selfhost:error-catalog:check`：通过；
- 定向 fault injection：checksum tamper、执行位漂移、symlink、路径穿越、macOS Intel、Windows ARM、未知宿主 OS、缺少
  Cosign、Docker 缺失、Windows containers、Compose v1、未支持 daemon 架构、畸形 Docker/Compose 输出、readiness
  失败、输出覆盖全部 fail closed；
- `pnpm selfhost:compose-smoke -- --mode=source`：按设计以 exit 77 / `B-SH8A-001` 跳过。

## 当前 blocker

`B-SH10-001`：当前 host 没有 Docker/Podman，无法在真实 clean machine 上从已签名归档执行 installer dry-run、首次
`init` → image pull → migration → readiness → owner claim → backup 的完整链路，也无法实测 Windows Docker Desktop / WSL2
入口。CI workflow 已定义同一 bundle 的签名、installer dry-run 和双归档复现门禁，但未经实际发布运行的 workflow 不能
伪装成已完成的外部证据。

该 blocker 不阻止继续实现 SH11，但在 Docker-capable clean-room 与首个真实 release artifact 存在前，SH10 的环境级退出
门禁和 self-host v1 总体 Definition of Done 都保持未通过。SH8 的 `B-SH8B-002`（不存在可诚实演练的旧 self-host
release）也继续保留。

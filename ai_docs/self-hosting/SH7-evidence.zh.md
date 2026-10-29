# SH7 管理 CLI 证据

日期：2026-10-18

revision：本阶段提交生成后以 git revision 为准。

## 交付映射

| 门禁                   | 实现/证据                                                                                                                               | 状态                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 生命周期命令           | `init/start/status/logs/stop/uninstall/backup/restore/upgrade/rollback/doctor/diagnostics/owner-bootstrap/owner-recovery` 共用单一 core | 单元与进程测试通过           |
| JSON output schemas    | result v1 与 operation-record v1 Draft 2020-12 schema                                                                                   | Ajv 契约测试通过             |
| 幂等                   | init 不轮换 secret；ready start 与 stopped stop 不再变更                                                                                | 单元测试通过                 |
| dry-run                | 只读 preflight；不写配置/数据/服务，只保留最小 audit                                                                                    | 单元测试通过                 |
| operation records      | exclusive create、`0700/0600`、最小字段、无 message/details/log                                                                         | schema 与 collision 测试通过 |
| mutation serialization | 实例级 exclusive lock 覆盖 10 个实际变更命令；陈旧锁经宽限、PID/字节复核、strict reclaimer record 仲裁后原子接管                        | 并发/陈旧/畸形测试通过       |
| secret boundary        | 生成值不输出；Docker error/log 双层脱敏；源码运行数据被 Git 忽略                                                                        | 单元与进程测试通过           |
| 入口收敛               | Bash、PowerShell、人工文档与 Codex contract 均调用同一 Node CLI                                                                         | 静态契约测试通过             |
| Compose 实机           | 本机没有 Docker/Podman                                                                                                                  | `B-SH7-001`                  |

## 关键不变量

1. `.env.selfhost` 只能由 exclusive atomic create 首次发布；重复 init 不覆盖或轮换 secret。
2. 数据根目录不能是 filesystem/release root 或签名子树；词法路径与尚未创建目标的 physical path 均检查父目录 symlink，
   无 marker 的非空目录含无关条目时在写配置前拒绝接管。
3. Bash、PowerShell、human 和 JSON 只做同一结果的不同呈现，不分别实现 Compose 状态机。
4. start 返回成功前必须二次确认 mandatory services ready；stop 不删除 container 或数据，并确认无 active service。
5. operation record 同名不能覆盖；record 写失败会把整个调用降为稳定 exit 7。
6. dry-run 唯一写入是最小 audit record，不创建 `.env.selfhost`、`data` 或改变 service。
7. 公网 HTTP、bind/origin 错配和权限过宽在调用 Compose 前失败；LAN/显式公网例外保留 machine-readable warning。
8. `data/operations` 只保存 server bootstrap secret；`owner-bootstrap` 只让容器内命令读取 token，CLI audit 使用宿主
   `.selfhost/operations` 且不记录 owner identity/password/token，两种信任边界不混用。
9. `uninstall` 始终执行不带 `-v/--volumes` 的 `compose down --remove-orphans`，默认保留配置、audit 和全部数据；删除数据必须
   同时提供 `--delete-data` 与解析后完全相等的绝对 `--confirm-data-root`，并先通过 ownership/allowlist 检查。确认目录的
   device/inode 会绑定到 operation；递归删除只作用于原子移入同父目录隔离名后再次通过身份复核的目录。路径替换测试证明
   replacement 与原目录均不会被误删，并返回稳定 `SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED`。
10. HTTP/HTTPS/docs 端口、同 bind 端口冲突与 bootstrap token TTL 在任何 Docker 调用前完成统一范围校验，返回稳定
    config failure，而不是等待 Compose 或应用启动后才暴露。
11. 所有 Compose-backed 命令在解析 model 或改变服务前验证有界 Docker/Compose version、Compose major ≥ 2 与 Linux
    `amd64`/`arm64` daemon；Compose v1、错误平台和畸形输出 fail closed，且不进入结果或 audit record。
12. 初始化模板与 release metadata 均有 1 MiB 上限；配置版本必须与已安装 release 精确一致，普通生命周期在 Docker 前
    fail closed。已存在但无效的权威 release manifest 不得回退到 package version；`rollback` 是唯一版本漂移例外，由严格
    marker + upgrade report 证明有意的中间不一致并完成修复。
13. Compose 子进程移除实际 Compose 文件及 `.env.selfhost` 值引用的全部宿主插值变量和所有 `COMPOSE_*` 控制变量；实例
    `.env.selfhost` 与声明默认值具有唯一配置权，`DOCKER_HOST` 等连接环境仍保留。
14. 首次 owner claim 与 recovery 都走同一管理 CLI：密码只继承 stdin、拒绝 TTY，identity/password/token 不进入结果或 audit；
    Bash、PowerShell 与 acceptance 使用同一 `owner-bootstrap` 行为。
15. 管理入口读取 marker、release metadata、`.env.selfhost`、Compose 定义和初始化模板时只使用一个已验证文件句柄；打开前后
    必须保持普通文件身份、精确长度与时间戳不变，增长、缩短、symlink 或路径替换均 fail closed，并映射到既有稳定错误码。
    `.env.selfhost`、Compose 定义与 Caddyfile 随后复制到私有 operation 快照；快照 Compose 只挂载同目录的 Caddyfile，Docker
    不再按原路径二次读取这些运行输入。快照内容漂移或无法安全清理返回 `SELF_HOST_CONFIG_SNAPSHOT_FAILED` /
    `SELF_HOST_CONFIG_SNAPSHOT_CLEANUP_FAILED`。
16. `--version` 只从最多 1 MiB 的稳定普通文件读取 release metadata，拒绝 symlink、超限或非 semver 值；无有效 metadata 时
    返回 `unknown`，不能让未验证 bundle 文件造成无界内存读取。
17. 所有实际 mutation 在读取 release state 或调用 Docker 前先取得 `.selfhost/operation.lock.json`；active owner 返回
    `SELF_HOST_OPERATION_IN_PROGRESS`，畸形/漂移锁返回 `SELF_HOST_OPERATION_LOCK_INVALID`。status/doctor/logs/diagnostics 保持
    可观察，避免锁住故障取证；不同 backup 名称不能绕过实例级互斥。陈旧锁回收先用固定 strict record 绑定回收者 PID/operation 与
    旧锁摘要、仲裁唯一回收者，再原子替换旧锁，不能以 rename 暴露无锁空窗；死亡或超过 15 分钟的回收者必须被 Doctor 判为
    fail。
18. 正常释放锁先 exclusive hard-link owner snapshot，再复核两条路径并 unlink；预占 `.released-*` 只能让释放 fail closed，不能被
    rename 覆盖。
19. 主命令失败后若 Compose 输入快照清理或 operation lock 释放也失败，CLI 保留原始主错误码，同时把二次失败写入
    `details.secondaryFailures`、失败 action 与持久化 operation record；含敏感配置的残留快照和卡住的锁不能静默丢失。
20. 若 operation record 本身无法持久化，顶层仍返回强制的 `SELF_HOST_OPERATION_RECORD_FAILED`；此前命令若也失败，其无敏感
    `code`、`exitCode`、`retryable` 保留在 `details.commandFailure` 与失败 action，避免 audit 故障遮蔽实际运行故障。
21. 管理核心以及 backup/acceptance/release 共用的 artifact 发布原语，在 exclusive atomic create 或 atomic replace 主写入失败后，
    必须继续关闭打开的句柄并删除同目录私有临时文件；`ENOENT` 仅表示临时文件已不存在。close/unlink 再次失败时以携带原始
    错误的 `AggregateError` fail-closed，并映射为文件系统失败，不能把可能含配置 secret、锁、lifecycle 状态或发布证据的残留
    `.tmp` / `.partial` 静默遗留。
22. 流式子进程必须尝试关闭全部已打开的输入与输出文件句柄，不能因第一个 close 失败跳过其余句柄。若子进程或前置文件操作也
    失败，句柄清理错误以保留原始错误的 `AggregateError` 返回；若子进程成功但 close 失败，调用方仍收到失败结果，不能把
    未完成收尾的 dump/restore 文件当作成功产物。
23. 管理状态目录 `fsync`、有界证据读取/复制、artifact 文件同步与 release bundle 目录同步共用句柄清理原语；它会尝试关闭
    全部已打开句柄，并在 read/write/sync 与一个或多个 close 同时失败时聚合保留全部原因。文件系统错误码映射保持 fail-closed，
    不能由 `finally` 的最后一个 close 覆盖更早故障。

## 验证命令

```bash
node --check scripts/selfhost/management-core.mjs
node --check scripts/selfhost/cli.mjs
node --test scripts/selfhost/management-core.test.mjs
pnpm test:selfhost-image-supply-chain
pnpm selfhost:compose-contract
pnpm validate:deployment-config
node scripts/precommit-deployment-config.mjs
pnpm selfhost:compose-smoke -- --mode=source
```

management core 定向测试与全量 self-host Node 门禁均以当前 revision 的 CI 汇总为准。deployment config、Compose contract、
image supply-chain、inventory、Prettier、diff check 与 precommit 均通过。

最后一条在当前 host 预期稳定退出 77，并记录
`SKIP B-SH7-001 (includes unresolved B-SH6-001 and B-SH5-001): Docker Engine with Compose v2 is unavailable`。该 blocker
表示真实 container lifecycle 尚无本机证据，不能用 mocked runner 测试代替。

## 阶段判断

SH7 的代码、schema、入口收敛、静态与无容器测试完成；真实 Docker start/status/logs/stop/uninstall 仍由
`B-SH7-001` 阻塞。保留 blocker 后可进入 SH8，self-host v1 总体 DoD 尚未完成。

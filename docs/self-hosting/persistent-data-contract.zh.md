# Self-host v1 持久数据契约

## 目录

| 主机 release 目录                          | 容器目录                | 分类                        | Owner                  |           备份 |                                      可清理 |
| ------------------------------------------ | ----------------------- | --------------------------- | ---------------------- | -------------: | ------------------------------------------: |
| `data/postgres`                            | PostgreSQL data dir     | authoritative               | PostgreSQL             |             是 |                                          否 |
| `data/uploads`                             | `/data/uploads`         | authoritative               | `StorageModule`        |             是 |                                          否 |
| `data/cache`                               | `/data/cache`           | derived cache               | provider / query cache |             否 |                        是，停止相关写操作后 |
| `data/elevation`                           | `/data/elevation`       | operator dataset            | elevation provider     |       单独管理 |                              可重新挂载来源 |
| `data/backups`                             | helper `/state/backups` | versioned bundle            | management CLI         |     本身是备份 |                            需显式 retention |
| `data/diagnostics`                         | `/data/diagnostics`     | redacted artifact           | management CLI         |             否 |                                          是 |
| `data/operations`                          | `/data/operations`      | bootstrap/restore transient | apps/server/management CLI  |             否 |               生命周期完成后删除 token/快照 |
| `data/gateway/data`                        | `/data` (Caddy)         | TLS state                   | gateway                |       单独管理 |                      否，证书与本地 CA 状态 |
| `data/gateway/config`                      | `/config` (Caddy)       | derived config              | gateway                |             否 |                                          是 |
| `.selfhost/operations`                     | 不挂载                  | operator audit              | management CLI         | 取决于保留策略 |                          仅按显式 retention |
| `.selfhost/upgrades`                       | 不挂载                  | upgrade/rollback report     | management CLI         | 取决于保留策略 |                          仅按显式 retention |
| `.selfhost/current-release.json`           | 不挂载                  | installed release state     | management CLI         |   应随实例保留 |                 仅由成功 lifecycle 原子更新 |
| `.selfhost/*-incomplete.json`              | 不挂载                  | failure containment marker  | management CLI         |   临时控制状态 |              仅由成功 restore/rollback 清除 |
| `.selfhost/operation.lock.json`            | 不挂载                  | instance mutation mutex     | management CLI         |             否 |           由 owner 命令释放或安全回收陈旧锁 |
| `.selfhost/operation.lock.reclaim`         | 不挂载                  | stale-lock reclaim record   | management CLI         |             否 | 仅由完成回收的 CLI 删除；残留时 fail closed |
| `.selfhost/operation.lock.json.released-*` | 不挂载                  | lock release snapshot       | management CLI         |             否 | 仅在 owner 字节复核后删除；不得覆盖未知文件 |

系统临时目录中的 Parquet、压缩包、下载块和 DuckDB 文件属于 `ephemeral`；进程或主机重启后允许丢失，
但任何数据库 ready 状态都不能只指向这些路径。

## 文件写入规则

1. object key 必须是 portable relative path；绝对路径、空段、`.`、`..`、Windows drive path 和 NUL 被拒绝。
2. 写入前逐层检查父目录，拒绝符号链接跳出 storage root。
3. 权威写入与 backup/acceptance/release evidence 发布采用同目录私有临时文件、`fsync`、atomic rename，再同步父目录；数据库
   pointer 只能在写入完成后提交。主写入失败后仍必须关闭句柄并删除临时文件；该清理失败需连同原始错误一起 fail-closed，不能
   静默遗留可能含 secret、lifecycle 状态或未完成证据的 `.tmp` / `.partial`。
4. `LOCAL` 和 `R2` 的权威边界互斥：LOCAL 不初始化 R2；R2 的 `/data/cache/storage` 可随时重建。
5. 权威路径和缓存路径不能配置为同一目录。
6. `ENOSPC`、`EACCES`、只读 filesystem 和 checksum mismatch 必须保留原始错误分类，供 `doctor` 映射稳定 code。
7. 静态资源服务只允许公开 namespace；私有文件必须走鉴权读取接口。
8. `data/operations/bootstrap-token` 是短期 secret，不得进入 backup、diagnostics 或 CLI audit；`owner-bootstrap` 只让
   容器内命令读取该文件，CLI 的 redacted operation record 只写入宿主 `.selfhost/operations`，不与 server-writable secret
   目录混用。
9. `data/.trainingload-selfhost-data-root.json` 声明目录已由 operator 专用于本实例；没有 marker 的非空目录
   只有在顶层条目全部属于既有 self-host 契约时才能被 `init` 接管。
10. 实例内 data-root 不能位于已签名 release 子树、`.selfhost` 或 `.env.selfhost` 下；边界校验同时使用词法路径和
    prospective physical path，因此即使目标尚未创建，也不能通过父目录 symlink 绕入签名子树。默认 `./data` 与其他独立顶层
    目录可用，也可使用实例外绝对路径。这样运行时写入不会让 bundle 的精确签名子树失效。
11. backup bundle 只包含 PostgreSQL logical dump、uploads、非 secret 配置、secret 名称引用、manifest、结果与
    checksums；`.env.selfhost`、bootstrap token、cache、elevation、TLS private state 和 diagnostics 不进入 bundle。
12. `.selfhost` lifecycle state 必须是 `0600` regular file 和 `0700` directory；marker、current release 和 report
    在被信任前执行 strict schema 校验，不能靠手工编辑解除 restore/upgrade block。成功 report 先于 marker 删除持久化；
    删除后的目录同步失败时必须原子重建原 marker 并 fail closed。
13. 可移植 backup 树最多包含 100,000 个 upload 文件、100,006 个总文件、100,000 个子目录和 64 层目录；doctor
    对 backup/restore/operation history 分别只扫描 1024/4096/10,000 个顶层项并累计读取 64/16/2 MiB，
    upgrade/rollback 最多接受 1024 个 report-directory 项和 64 MiB report。所有上限由 `v1-contract.json` 交叉校验，
    越界时显式 warning 或 fail closed，不能静默截断。
14. Release bundle 的每个签名文件最多 32 MiB、完整签名集合最多 512 MiB；builder 在复制前、verifier 在 hashing/Cosign
    前执行累计记账，防止最终 archive 门禁生效前先耗尽磁盘或读取资源。
15. 安装后的 release root 最多扫描 1024 个顶层条目；签名文件、`.env.selfhost` 与 `.selfhost` 以外只接受真实目录作为
    潜在自定义 data-root。未声明普通文件、symlink 与 special file 不属于运行时状态，验证时 fail closed。
16. `init/start/backup/restore/upgrade/rollback/stop/owner-bootstrap/owner-recovery/uninstall` 共用实例级 exclusive mutation
    lock；不同备份名也不能绕开。锁是 `0600`、有界、严格 schema 的原子发布文件，冲突在任何 Docker 或数据变更前返回稳定
    exit 6。进程消失后仍保留两小时安全窗口，超过后只有确认 PID 不存活且锁字节未漂移才允许回收；固定 strict reclaim record
    原子仲裁唯一回收者，并绑定其 PID/operation/time 与旧锁 operation ID/digest，再原子替换旧锁，锁路径不出现空窗。畸形锁、
    死亡回收者、超过 15 分钟的回收或残留/不匹配 record 一律 fail closed，不得手工删除绕过。
17. 锁释放不用可覆盖目标的 rename：先以 exclusive hard link 发布 owner snapshot，重读主锁与 snapshot 的精确字节后才 unlink 主锁；
    snapshot 路径已存在或任一字节漂移时保留主锁并返回稳定 release failure，不能覆盖未知/取证文件。
18. Release、acceptance 与 RC 的私有 staging/work/snapshot 目录属于 required cleanup；主装配或验证失败后仍逐项删除。删除失败
    与主错误聚合保留并标记 filesystem failure，不能由 `catch` / `finally` 覆盖原始原因；成功路径存在清理失败时同样 fail closed。
19. 私有文件的稳定读取、复制和 `fsync` 必须尝试关闭全部已打开的文件/目录句柄；读写或同步已失败时，任何 close 失败都追加到
    原始错误而不是覆盖它。双句柄复制保留两个 close 失败，清理错误统一携带可映射的 filesystem code。

## 当前实现状态

- 已完成：LOCAL 默认、`/data/uploads`、R2 cache 分离、对象 key 归一、路径逃逸/符号链接拒绝、buffer/source/multipart 原子发布。
- 已完成：新对象按 `public/`、`private/` 物理分区，仅 `public/` 暴露到 `/uploads/`；旧无前缀 key 仅保留内部兼容读取。
- 已完成：现有 Compose 的 backend named volume 统一挂载 `/data`。
- 已完成：独立 self-host Compose 将 PostgreSQL、uploads、cache、elevation 和 gateway state 显式绑定到
  release 目录 `data/*`；apps/client/docs build cache 也只写入 `data/cache`。`data/operations` 以 `0700`
  挂给 server，首次启动 token 以 `0600` 原子写入且 owner 初始化后删除。
- 已完成：管理 CLI 在宿主创建 `data/backups` 与 `data/diagnostics`，容器 permissions job 不再取得这两个
  operator 目录的 owner；CLI 审计、upgrade report、current release 和 incomplete marker 写入独立的 `.selfhost`。
- 已完成：所有实际 mutation 由 `.selfhost/operation.lock.json` 串行化，避免 backup quiesce 与其他生命周期交错；status、doctor、
  logs 和 diagnostics 仍可在操作期间只读取证据。
- 已完成：磁盘满/配额/只读/权限稳定错误码；数据库 metadata 默认 dry-run 且经 size + checksum 验证的安全 reconcile。
- 待完成：真实容器 recreate 测试（当前 host 无 Docker，必须由 clean-room runner / CI 出具证据）。

原始写入点清单由 `pnpm selfhost:inventory` 生成到 `inventory/persistent-writes.json`。

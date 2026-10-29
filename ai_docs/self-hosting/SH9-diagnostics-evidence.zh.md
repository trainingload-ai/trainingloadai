# SH9 Doctor、诊断与支持证据

日期：2026-10-18

revision：本阶段提交生成后以 git revision 为准。

## 交付映射

| 门禁                  | 实现/证据                                                         | 状态                                    |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| aggregated doctor     | 版本化 check/report 契约；依赖失效不提前退出；稳定 severity/count | 单元与集成测试通过                      |
| host/runtime/database | host、DNS、Docker/Compose、service、PostgreSQL、migration、owner  | mocked lifecycle 通过；真实 Docker 阻塞 |
| capability/provider   | runtime capability 与开放地图 provider probe                      | Core Local 和 failure path 通过         |
| recovery              | lifecycle marker、backup freshness、restore drill、recent failure | 集成测试通过                            |
| diagnostics           | allowlist JSON、0600、bounded logs、operation summary、SHA-256    | schema 与 tamper 测试通过               |
| privacy safety        | secret、邮箱与主目录用户名脱敏；发布前 privacy scan；fail closed  | fault injection 通过                    |
| stable errors         | 单一机器目录、生成的人类文档、代码 literal coverage               | drift 测试通过                          |
| support workflow      | 自助文档、隐私边界、GitHub issue form                             | 已实现                                  |

## 关键不变量

1. Doctor 的 failure 不阻止其他独立检查；不能因 Docker 缺失而丢失 host、config、storage 或 recovery 证据。
2. `skipped` 与 `pass` 分离；按 mode 明确关闭的 optional capability 不制造假失败。
3. Diagnostics 只能从 allowlist 结构构建，不能递归打包 release/data root。
4. 工件在 atomic publish 前完成 schema、contents checksum 与 secret scan；扫描失败不落盘。
5. 工件始终要求人工复核；自动脱敏不被描述为绝对匿名化。
6. 同名 diagnostics 不覆盖，operation record 仍保持 append-only。
7. 可返回的 management error/warning 必须存在机器目录；文档由同一来源生成并在测试中防漂移。
8. 邮箱以及 Linux、macOS、Windows 常见用户主目录路径中的用户名在生成时被替换；即使攻击者重算 contents
   checksum，校验器仍拒绝重新引入的原始身份数据。
9. `diagnostics --dry-run --json` 在写入前公开固定的四类 included field 和人工复核要求，且不创建工件。
10. Doctor 对启用的 `local-dem` 主动验证 provenance manifest、zoom 目录与 bounded tile sample；失败是 cataloged
    warning，不把可选增强能力误升格为核心 readiness failure。
11. Doctor 通过 public origin 对 `/api/health/ready` 做 8 秒/64 KiB 的 no-redirect probe；HTTPS pass 必须同时
    通过默认证书信任链、hostname、gateway route、reverse proxy 与精确 readiness payload 校验。
12. Docker Engine pass 必须同时取得 server version 与有效 daemon platform；daemon 仅接受 Linux 上的
    `amd64`/`arm64`，原始 `docker info` 不进入报告，宿主与 daemon 架构不一致时显式 warning。
13. 字节容量与 inode 容量使用两个独立 check；低 inode fault 即使仍有充足字节也必须 blocking fail，文件系统不提供
    inode 统计时只能 `skipped`，不能伪造 pass。
14. Host OS/架构按发行矩阵元组验证；Linux `amd64`/`arm64`、macOS Apple Silicon、Windows `amd64` 之外均为
    cataloged fail。受支持宿主上的 CPU/内存不足仍保持 warning，避免把建议资源值误作硬性最低值。
15. Backup、restore 与 operation history 分别限制为 1024/64 MiB、4096/16 MiB 与 10,000/2 MiB；项数或累计读取
    字节越界时 doctor 返回 cataloged warning 且不从部分样本推断最新记录。Diagnostics 仍可生成，但不携带不可信的
    operation 子集。
16. Doctor 的 JSON history source 只从同一个已验证普通文件句柄读取；字节预算按该句柄最终确认的长度消费，读取期间发生
    symlink、身份、长度或时间戳变化即拒绝该 source，不能把预检文件与实际解析文件分离。
17. Diagnostics 原子发布后只做一次有界稳定读取；落盘字节必须与待发布 Buffer 完全一致，schema/secret 复验、`sizeBytes` 与
    SHA-256 全部基于该 Buffer，最后再核对文件身份与私有权限，不能返回“校验 A、摘要 B”。
18. 发布后复验失败的 diagnostics 只能在 device/inode 仍匹配已观察身份时删除，并必须同步父目录。身份漂移、unlink 或同步失败
    返回 `SELF_HOST_DIAGNOSTICS_CLEANUP_FAILED`，不能静默留下可被误当成可信支持证据的工件。

## 已执行验证

- `node --test scripts/selfhost/doctor-core.test.mjs scripts/selfhost/diagnostics-artifact.test.mjs scripts/selfhost/error-catalog.test.mjs scripts/selfhost/management-core.test.mjs`：以当前 revision 的 CI 汇总为准（本地最新完整运行全部通过）；
- `pnpm test:selfhost-image-supply-chain`：以当前 revision 的 CI 汇总为准（本地最新完整运行全部通过）；
- `pnpm selfhost:compose-contract`：6 个 required service、1 个 optional profile 通过；
- `pnpm validate:deployment-config`：288 个 contract key、284 个 runtime key 一致；
- `node scripts/precommit-deployment-config.mjs`：通过；
- `pnpm selfhost:image-supply-chain`：3 个镜像角色、2 个架构、10 个 pinned action 通过；
- `pnpm selfhost:error-catalog:check`、相关文件 Prettier 与 `git diff --check`：通过；
- 正常 mocked lifecycle：doctor schema-valid、无 fail、runtime capability/database checks 通过；
- Docker unavailable fault：doctor 返回 exit 8，但仍生成 ≥20 个完整 check；
- unsupported host fault：macOS Intel 返回 `SELF_HOST_HOST_PLATFORM_UNSUPPORTED`，但 doctor 仍完成其余独立检查；
- Docker daemon platform fault：非 Linux/`amd64|arm64`、畸形 info 或不可信 version 输出均 fail closed，原始输出不泄漏；
- inode fault：字节空间充足但仅余 100 inode 时返回 `SELF_HOST_DOCTOR_INODES_INSUFFICIENT`；
- diagnostics secret fault：private key marker 返回 `SELF_HOST_DIAGNOSTICS_SECRET_SCAN_FAILED` 且目标文件不存在；
- diagnostics post-publish drift/cleanup fault：正常删除返回 `SELF_HOST_DIAGNOSTICS_VERIFY_FAILED`；删除失败返回
  `SELF_HOST_DIAGNOSTICS_CLEANUP_FAILED` 并保留不可信路径供 operator 处置；
- error catalog：90+ stable code 唯一、源码 emitted literal 全覆盖、生成文档一致。
- `pnpm selfhost:compose-smoke -- --mode=source`：按设计以 exit 77 / `B-SH8A-001` 跳过。

## 当前 blocker

`B-SH9-001`：当前 host 没有 Docker/Podman，无法在真实 Compose stack 上验证 Docker/Compose version、容器内
capability endpoint、PostgreSQL query、Cosign image signature、真实日志与 provider network probe。

该 blocker 不阻止进入 SH10 Agent 部署契约，但在 Docker-capable clean-room gate 完成前不能关闭 self-host v1 总体 DoD。

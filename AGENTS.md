# Public core development

Use the declared package exports. Keep single-owner Self-host independent of Managed Cloud. Run boundary checks, tests, and both relevant builds.

## Self-host 实例管理

部署任务先判断当前目录类型：

- 签名 release bundle：必须先完整阅读 `SELF_HOSTING.md`；首次部署先执行 `./install.sh --dry-run --json`
  （Windows 使用 `.\install.ps1 --dry-run --json`），只有 bundle signature、宿主前置条件和计划全部通过后才能执行不带
  `--dry-run` 的 installer；
- 源码仓库：只有开发、验证或明确要求从源码运行时，才使用 `pnpm self-host -- <command> --json`；不得把源码工作树
  当作正式 release bundle；
- 已安装实例：常规命令在当前可信 management bundle 使用 `./self-host <command> --directory <instance> --json`，Windows
  PowerShell 使用 `.\self-host.ps1 <command> --directory <instance> --json`。升级先用当前实例 CLI 对目标签名 bundle
  dry-run；验证通过后改用目标 bundle 的 wrapper，以 `--directory` 指向实例并再次 dry-run、执行升级及声明范围内的回滚。

初始化、启动、查看、读取日志、备份、恢复、升级、回滚、诊断或停止统一调用上述管理入口。唯一例外是
`SELF_HOSTING.md` 明确给出的本机 owner bootstrap command；Agent
不得索取、生成、读取或代填 owner 密码/bootstrap token，必须停在该步骤并让用户在宿主本机完成。

日常值班、故障和支持交接先阅读 `SELF_HOST_OPERATIONS.md`。RC evidence package 是审核容器，不是可直接运行的实例目录；
部署其中的 release archive 仍须按 `SELF_HOSTING.md` 先验证 RC 外层、release archive 外层和 release bundle 内层三层证据。

- 不要自行拼接 `docker compose` 命令或复制状态判断；
- `init`、`start`、`stop` 等变更操作先执行同参数的 `--dry-run`；
- 首次部署只接受 exact-version bundle；必须验证 `checksums.txt`、Cosign identity 和 `checksums.bundle.json`，不得使用
  `--skip-verify`、临时改 manifest 或复制另一个版本的签名文件；
- 自动化只依据 JSON 的 `ok`、`exitCode`、`error.code` 与 `details`，不解析 human-readable 文本；
- 不读取、输出或转述 `.env.selfhost` 中的 secret；
- 目标目录已有未知文件、未声明 data root 或 lifecycle marker 时停止；不得覆盖、清空或“修复”用户数据；
- `restore` 只能指向新初始化且权威数据为空的 target，不能用手工删除 marker 或改 manifest 的方式绕过保护；
- `upgrade` 必须使用完整、已签名的 release bundle 目录；`rollback` 只允许升级报告声明的 application rollback，绝不手工降级数据库；
- 失败时先保留 stable error code，运行 `doctor --json`；需要支持工件时再运行 `diagnostics --json`，人工检查后才可分享；
- 禁止执行 `docker compose down -v`、删除 volume/data、暴露 PostgreSQL、把公网域名或 TLS 风险接受当作默认值；
- 只有在开发或验证管理 CLI/Compose 本身时，才可直接调用底层测试与 Compose 契约工具。

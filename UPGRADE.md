# Self-host 升级与应用回滚

升级输入必须是目标版本的完整、签名 release bundle 目录。不要只改 `.env.selfhost` 的版本或 image tag。

## 升级

### 旧版首次升级的管理元数据过渡

从未升级过的 `1.1.15` / `1.1.17` 实例可能没有 `.selfhost/current-release.json`。这两个版本的 CLI 从原始
release manifest 读取镜像时漏了 `migrate`，源预检因此可能返回 `SELF_HOST_UPGRADE_STATE_INVALID`。
不要修改签名包、配置中的镜像或手工写入状态文件。

先保留当前实例的 verified backup，并确认没有未完成的 restore/upgrade。使用 **1.1.18 或后续完整签名管理包**执行：

```bash
instance='/path/to/installed-instance'
target='/path/to/trainingload-selfhost-1.1.18'
"$target/self-host" init --directory "$instance" --dry-run --json
"$target/self-host" init --directory "$instance" --json
```

只有 dry-run `ok: true`、计划包含 `INITIALIZE_RELEASE_STATE` 且没有其他待执行的配置或数据修复动作时，才执行对应实际命令。
若还有其他修复动作，先按运维流程解决并重新 dry-run，不把它们混入元数据过渡。该入口会重新验证旧实例的完整签名
bundle，要求旧配置的版本和三个镜像与签名 manifest 完全一致，再以 exclusive publish 创建缺失的 release-state。
已有 state 不会被覆盖；配置、secret、数据库、uploads、运行版本和容器均不因这个过渡而改变。
任何签名、镜像、生命周期或并发冲突都必须停止并运行 `doctor --json`，不能借此接管未知实例。

完成后仍须按下面顺序重新执行**源 CLI dry-run、目标 CLI dry-run、实际升级**，不能跳过旧版预检。

### 常规升级顺序

1. 下载并解压目标 release bundle，不要覆盖当前运行目录；
2. 先用当前实例的可信 CLI 对目标 bundle 执行兼容性 dry-run；
3. 该验证通过后，改用目标 bundle 的 CLI，以 `--directory` 指向当前实例并再次 dry-run；
4. 确认 source/target、pending migration、磁盘、备份和 application rollback 声明；
5. 用目标 bundle 的同一入口执行实际升级。

```bash
instance='/path/to/installed-instance'
target='/path/to/trainingload-selfhost-<target>'
"$instance/self-host" upgrade "$target" --directory "$instance" --dry-run --json
"$target/self-host" upgrade "$target" --directory "$instance" --dry-run --json
"$target/self-host" upgrade "$target" --directory "$instance" --json
```

CLI 会验证完整 bundle checksum、Cosign identity、image digest、SBOM/provenance、版本兼容窗口和 migration inventory；
随后自动创建已验证备份、拉取 immutable image、运行 forward migration 并检查 full readiness。升级只更新实例状态中的
版本和三个 application image，不读取目标 bundle 的 secret，也不覆盖 operator 网络设置。目标 bundle 是升级后的管理
controller，必须与实例目录一起保留；日常命令使用 `"$target/self-host" <command> --directory "$instance" --json`。这种分离避免
在运行中覆盖已签名管理文件，同时让修复后的目标 CLI 真正参与升级与后续运维。

Windows PowerShell 使用同一顺序：

```powershell
$Instance = 'C:\Trainingload\instance'
$Target = 'C:\Trainingload\trainingload-selfhost-<target>'
& "$Instance\self-host.ps1" upgrade $Target --directory $Instance --dry-run --json
& "$Target\self-host.ps1" upgrade $Target --directory $Instance --dry-run --json
& "$Target\self-host.ps1" upgrade $Target --directory $Instance --json
```

目标 release 没有声明 application rollback 时，只有明确审阅风险后才能传
`--accept-no-application-rollback`。这不会让数据库 downgrade 变成可用。

## 失败与恢复

升级开始变更前会写 incomplete marker。失败时保留 marker、旧 image、备份和 report，并阻止普通 `start` 伪造成功。
不要删除 marker、改 report、改 `_prisma_migrations` 或手工降级数据库。先运行：

```bash
./self-host doctor --json
./self-host diagnostics --output failed-upgrade --json
```

按 report 声明的 source version 执行 application rollback：

```bash
"$target/self-host" rollback <exact-source-version> --directory "$instance" --dry-run --json
"$target/self-host" rollback <exact-source-version> --directory "$instance" --json
```

Rollback 只切回升级前保留的 application image，数据库保持 forward-only。只有 release policy 明确声明、旧 image
仍可验证且 migration inventory 与失败后状态兼容时才允许。

第一份 self-host v1 release 没有可诚实声明的旧 self-host source；在第二个真实 release 与 Docker clean-room 演练
完成前，不应把临时改版本号当作升级/回滚证据。

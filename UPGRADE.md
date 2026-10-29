# Self-host 升级与应用回滚

升级输入必须是目标版本的完整、签名 release bundle 目录。不要只改 `.env.selfhost` 的版本或 image tag。

## 升级

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

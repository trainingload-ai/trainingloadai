# Self-host 跨平台发行验收矩阵

本流程只认证完整、已签名、固定版本的 release bundle。源码工作树启动、单个平台 smoke、容器处于 `running` 或单独一份
成功报告，都不能替代完整发行门禁。

## 门禁边界

一次有效验收固定绑定以下输入：

- 当前 release 的 GitHub Actions run ID、40 位 source revision 和 semantic version；
- 一个不同的、兼容窗口内的上一版签名 release，用于真实 upgrade 与 application rollback；
- 当前 release tag 上的 `.github/workflows/selfhost-acceptance.yml`；workflow revision 必须等于当前 release revision；
- 4 个平台 × 2 种模式共 8 个不可跳过的 matrix cell。

Workflow 只能通过 `workflow_dispatch` 手工触发，不响应 pull request、fork、push 或定时事件。持久 self-hosted runner 在 checkout
任何 release 代码前，先由 workflow 内的固定脚本验证 archive checksum、Cosign identity、OIDC issuer、归档路径和
`release-manifest.json` 的 version/revision 绑定。Checksum 从有界稳定句柄冻结，Cosign 返回后逐字节复核；archive 在 `tar -tzf`、
`tar -tvzf` 与 manifest 流式读取后再次命中签名摘要，链接和 special file 会被拒绝。认证阶段只从 archive 标准输出读取 manifest，
不把 archive 解压到文件系统；静态门禁会编译检查这段 bootstrap JavaScript。

## 平台与 runner

| platform ID           | 宿主与容器架构                             | GitHub runner labels                                                   |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `ubuntu-amd64`        | Ubuntu 24.04 / `linux/amd64`               | `ubuntu-24.04`                                                         |
| `linux-arm64`         | Ubuntu 24.04 ARM / `linux/arm64`           | `ubuntu-24.04-arm`                                                     |
| `macos-apple-silicon` | macOS Apple Silicon / Docker Desktop arm64 | `self-hosted, macOS, ARM64, selfhost-acceptance, docker-desktop`       |
| `windows-11-wsl2`     | Windows 11 / Docker Desktop WSL2 amd64     | `self-hosted, windows, x64, selfhost-acceptance, docker-desktop, wsl2` |

专用 macOS/Windows runner 必须满足：

- Docker Desktop 已启动并处于 Linux containers 模式，Compose v2 可用；
- Node.js 由 pinned `actions/setup-node` 安装，Cosign 由 pinned installer 安装；
- 至少 16 GiB 可用磁盘，runner 用户可创建和删除其唯一临时目录；GitHub-hosted Linux cell 的契约门槛为 8 GiB；
- 不保存生产 `.env.selfhost`、数据库、bootstrap token、registry credential 或用户备份；
- 同一 runner 一次只执行一个 job，失败后仍允许 `always()` evidence upload 与 test-owned 临时目录清理；
- runner 的标签只授予受信任仓库，不接收 fork/PR 代码。

## 覆盖内容

两种模式均通过公开产品入口执行 Core Local 核心旅程：owner 登录后经同源 Next proxy 上传一份包含路线与原始海拔的 GPX，等待
异步导入达到 `READY`，再读取活动列表、详情和路线图层，下载本地 light/dark 缩略图，并导出仍含海拔的 GPX。该 fixture
不能通过 SQL 直写或容器内手工写文件代替。Connected 额外使用本地开放瓦片 fixture，校验运行时 attribution/tile policy，
并验证 provider 请求达到真实超时后只降级为 warning、核心 readiness 仍正常。

| 类别     | 强制场景                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------- |
| 供应链   | archive 外层签名、bundle 内层签名、版本与 revision 绑定                                                  |
| 首次使用 | fresh install、管理 CLI 一次性 owner bootstrap、bootstrap replay 拒绝、登录、真实 GPX 上传与异步导入     |
| 核心旅程 | activity list/detail、route layer、本地 light/dark 缩略图、原始海拔导出、LOCAL source file               |
| 持久性   | restart、force recreate 后重复完整核心旅程、migration 数量不漂移                                         |
| 数据安全 | versioned backup、新目录 clean restore、旧签名版本升级、声明范围内 application rollback                  |
| 故障注入 | 数据库不可用 + doctor/diagnostics、server network disconnect、磁盘不足、上传权限、provider timeout       |
| 非功能   | 20 次 readiness latency、容器 memory、安装/fixture/restore 后磁盘用量                                    |
| 默认安全 | non-root、read-only rootfs、`cap_drop: ALL`、capability allowlist、no-new-privileges、数据库不发布到宿主 |

时间上限分别为 fresh install 900 秒、restart 180 秒、recreate 300 秒、restore 900 秒、upgrade 1200 秒；20 次
readiness probe 的 P95 不得超过 1500 ms。任一 P0/P1、schema、安全项、阈值或 matrix cell 失败，aggregate gate 均不存在。

Idle mandatory containers 的总内存上限为 2 GiB；初装权威数据上限为 1 GiB；synthetic fixture 增量及 clean restore 与源数据的
偏差各不超过 128 MiB。这些是首版回归上限，不是容量规划承诺；后续只能通过版本化 contract 和真实证据调整。

## 触发

先从同一仓库取得当前与上一版 `Self-host images` workflow 的成功 run ID。当前验收 workflow 必须从当前版本 tag 触发，例如：

```bash
gh workflow run selfhost-acceptance.yml \
  --ref v1.1.16 \
  -f release_run_id='<current-run-id>' \
  -f release_revision='<current-40-char-sha>' \
  -f release_version='1.1.16' \
  -f previous_release_run_id='<previous-run-id>' \
  -f previous_release_revision='<previous-40-char-sha>' \
  -f previous_release_version='1.1.15'
```

不要用任意 branch ref 代替 tag；workflow 会同时检查 `GITHUB_REF=refs/tags/v<version>` 与
`GITHUB_SHA=<release_revision>`。

## 证据与验证

每个 cell 总会尝试上传 `selfhost-acceptance-<platform>-<mode>`，便于诊断失败。只有 8 格全部成功时，hosted finalizer 才会：

1. 按 report schema 重新校验每份报告；
2. 要求平台、模式、run ID、当前/上一 release identity 和 archive digest 完全一致；
3. 重新执行场景覆盖、阈值与默认安全断言；
4. 汇总 8 份报告、8 份 Docker/Compose/架构/磁盘环境记录、acceptance contract 与三个 schema；
5. 生成 `acceptance-manifest.json` 和 `acceptance-checksums.txt`；
6. 用当前 tag 上的 acceptance workflow OIDC identity 签名 checksum inventory；
7. 上传 `selfhost-acceptance-gate-<revision>`，保留 90 天。

数据库故障期间必须得到 cataloged `SELF_HOST_DOCTOR_DATABASE_FAILED`，经同参数 dry-run 后生成并复验私有 diagnostics；
bundle 必须保留 fault doctor、通过 secret scan、要求 operator review，恢复后再重验完整核心旅程。

下载 aggregate artifact 后，先验证 exact identity，再验证全部文件：

```bash
version='1.1.16'
identity="https://github.com/trainingload-ai/trainingloadai/.github/workflows/selfhost-acceptance.yml@refs/tags/v$version"
cosign verify-blob \
  --bundle acceptance-checksums.bundle.json \
  --certificate-identity "$identity" \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  acceptance-checksums.txt
sha256sum -c acceptance-checksums.txt
```

最后确认 manifest 的 `status=passed`、`requiredCells=8`、`passedCells=8`、workflow revision、两版 release identity 与准备
发布的 RC 完全一致，并确认每个 cell 都有 `core-user-journey=pass`。缺少 aggregate artifact 等同于门禁失败；不得从若干单格报告
手工拼出“通过”结论。

## 清理与失败处理

测试实例只位于随机 `mkdtemp` 工作区，Compose project name 和 host ports 每格唯一。清理只停止并移除这些 test-owned container，
不执行 volume 删除；随后删除经过 parent/basename 校验的 runner temp 目录。tile fixture stop、Compose `down` 或工作区删除任一失败时，
runner 会把 cell report 改为 failed 并以非零状态退出；若原场景已失败，原错误与清理错误都会保留在抛出的 aggregate error 中。
失败 report 无法持久化时同样不能吞掉该错误。故障时保留单格 report，但不会生成签名 aggregate gate。
如果需要排查，先看 report 的 stable scenario 和 message，再看该 runner 的日志；不要复用或修改报告来绕过 finalizer。

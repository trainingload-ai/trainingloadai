# Trainingload.ai Self-host

公开镜像和签名 bundle 只由发行 CI 生成。下述安装流程适用于已经通过供应链门禁的精确版本；源码验收见文末。

本文件是签名 release bundle 的部署入口。不要从源码目录手工拼接生产 Compose；下载与目标版本完全一致的
`trainingload-selfhost-<version>` bundle，校验后在解压目录内安装。

## 前置条件

- 目标宿主：Ubuntu 24.04 `amd64`、Ubuntu 24.04 `arm64`、macOS Apple Silicon + Docker Desktop，或
  Windows 11 + Docker Desktop 的 WSL2/Linux containers backend；
- Node.js 22 或更高版本；
- Docker Engine 与 Docker Compose v2；
- 支持 `verify-blob --bundle` 的 Cosign，用于验证 bundle 的 keyless signature；
- Core Local 最低建议 2 CPU、2 GiB 内存，至少保留 5 GiB 可用磁盘。

正式标记为 self-host v1 RC 前，同一签名 release 必须在上述四个平台的 Core Local 与 Connected 两种模式完成
8 格验收；GitHub-hosted Linux cell 至少保留 8 GiB、专用 Docker Desktop runner 至少保留 16 GiB 可用磁盘。产品运行
最低值和发布验收余量是不同约束。

Release bundle 自带固定 digest 的 application image、Compose、operator instance schema、解析后 runtime schema、管理 CLI、
文档、SBOM、provenance 与签名证据。Installer 先按 Node platform/architecture 拒绝不在上述四类目标环境内的宿主；
`--no-start` 不绕过该发行边界。
随后在任何配置或容器变更前验证 `checksums.txt` 和 `checksums.bundle.json`，验证失败不会继续。需要立即启动（未指定
`--no-start`）时，同一 preflight 还会读取有界的 Docker server version、Compose version 与 daemon platform；只接受
major ≥ 2 的 Compose 和 Linux containers backend 上的 `amd64`/`arm64`。macOS Intel、Windows ARM、Windows
containers、Compose v1、未知架构或畸形输出会在 `init` 前 fail closed，且不会把原始 daemon 输出写入结果。
初始化模板、release metadata 与运行配置均按 1 MiB 上限读取；`.env.selfhost` 的 `SELF_HOST_VERSION` 必须与已安装
release metadata 精确一致，否则初始化和普通生命周期命令会在调用 Docker 前拒绝继续。

## 运行组成与数据目录

自托管只有 PostgreSQL、一次性权限初始化、一次性迁移、Server 和 Client 五个 Compose 服务。
Server、Client、migrate 是同一版本的三张镜像。Docs 独立构建，不进入镜像、Compose、profile 或就绪检查；不运行 Caddy。

浏览器只访问 Client 的 `http://localhost:43210`。Next BFF 在私有 Compose 网络代理 API、上传、Cookie 和流式响应。
PostgreSQL 与 Server 不发布宿主端口。Server 入口为 `SelfHostAppModule`。

默认专用数据目录为 `./data`，包含 PostgreSQL、上传、缓存、elevation 和运维记录。
首次安装前可设置 `SELF_HOST_DATA_ROOT=/absolute/dedicated/path`。不要公开数据目录或把实例配置提交到 Git。
管理 CLI 会拒绝文件系统根、release 目录、未声明的已有目录和不安全的符号链接。

## Linux / macOS / WSL2

先验证 archive checksum 的 release-workflow signature，再验证 archive 本身。以下三份文件必须来自同一 release artifact：

```bash
version='<exact-version>'
archive="trainingload-selfhost-$version.tar.gz"
identity="https://github.com/trainingload-ai/trainingloadai/.github/workflows/selfhost-images.yml@refs/tags/v$version"
cosign verify-blob \
  --bundle "$archive.sha256.bundle.json" \
  --certificate-identity "$identity" \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$archive.sha256"
sha256sum -c "$archive.sha256"
tar -xzf "$archive"
```

进入最终 release 目录后：

```bash
cd trainingload-selfhost-<version>
./install.sh --dry-run --json
./install.sh --json
```

Installer dry-run 会复用正式 `init` planner 验证签名模板、已有配置和 data-root，但不会创建配置、审计目录、数据或容器；
已有实例还会执行共享的 `start --dry-run` 检查。验签得到的 checksum inventory 会绑定 planner 实际读取的模板与 Compose，验签后路径内容发生变化会失败。只有该结果 `ok: true` 才能继续实际安装。

默认安装器生成受保护的 `.env.selfhost`、声明 `./data`、拉取固定 digest 镜像并等待全部 mandatory service ready。
若要先审阅非 secret 配置：

```bash
./install.sh --no-start --dry-run --json
./install.sh --no-start --json
# 只修改 .env.selfhost 中本文明确支持的设置
./self-host start --dry-run --json
./self-host start --json
```

`.env.selfhost` 的机器契约是 `schemas/self-host-instance-config.schema.json`；CLI 会拒绝 schema 外的拼写错误、生产专用变量
和当前发行物不支持的 capability。`schemas/self-host-config.schema.json` 描述 Compose 注入容器后的应用 runtime 配置，不能拿来
给 `.env.selfhost` 增加字段。未引用值和双引号值不允许 `$VAR`/`${VAR}` 二次插值；需要字面 `$` 时使用完整单引号值。CLI
按与 Compose 一致的受限语法解析引号、转义与行尾注释，再隔离宿主环境。每次命令会把已稳定读取并校验的 env 与 Compose 定义复制到 `.selfhost` 下的私有 operation 快照；
Docker 不再打开这些原始输入，结束时验证内容后删除，避免预检与执行读取不同文件。
任何修改后都先运行同参数的 lifecycle command `--dry-run --json`。

## Windows 11 + Docker Desktop / WSL2

Windows 11 自带的 `tar.exe` 可解压同一 `.tar.gz`。先验证外层签名与 digest：

```powershell
$Version = '<exact-version>'
$Archive = "trainingload-selfhost-$Version.tar.gz"
$Identity = "https://github.com/trainingload-ai/trainingloadai/.github/workflows/selfhost-images.yml@refs/tags/v$Version"
cosign verify-blob `
  --bundle "$Archive.sha256.bundle.json" `
  --certificate-identity $Identity `
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' `
  "$Archive.sha256"
$Expected = ((Get-Content "$Archive.sha256" -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$Actual = (Get-FileHash $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) { throw 'Release archive checksum mismatch' }
tar.exe -xzf $Archive
```

解压到最终目录后：

```powershell
Set-Location trainingload-selfhost-<version>
.\install.ps1 --dry-run --json
.\install.ps1 --json
```

后续命令使用 `.\self-host.ps1 <command> --json`。Docker Desktop 必须运行 Linux containers；不要把数据目录放在
临时下载目录或会自动清理的路径。

## 首次 Owner

默认只绑定 `127.0.0.1`。服务 ready 后打开 `http://localhost:43210`，在双栏初始化页面输入用户名，创建唯一 Owner 并进入 onboarding。
不需要邮箱、密码、注册或 OAuth。服务端使用事务和数据库唯一约束拒绝第二个用户，环境变量也不能开启多用户注册。
已有 Owner 时，会话失效后恢复同一个本机会话，不创建新用户。

无凭证访问依赖 loopback 绑定、loopback site origin 和严格同源请求。远程访问推荐 SSH 端口转发：保持应用监听 localhost，
在访问设备把远端 `43210` 转发到本机 `43210`。如果自行添加外部反向代理，应在代理侧完成身份验证与 HTTPS；当前公共网页不提供凭证登录。
不要直接把无密码实例发布到公网。

Owner 显式确认账号删除后，异步流程清理该账号的数据；完成后实例回到用户名初始化页。历史备份和实例配置不会因账号删除而自动清理。

```bash
./self-host doctor --json
./self-host backup --output first-verified-backup --json
```

## Intervals.icu API Key

Self-host 只开放 Intervals.icu 个人 API Key 连接。Owner 可在首次引导的“导入活动”步骤，或在
“账号 → 第三方连接 → Intervals.icu”中填写自己的 Key 并选择同步方向；不需要 Intervals.icu OAuth client、
redirect URI 或 webhook。Intervals.icu OAuth
以及 Strava、Polar、COROS、Suunto、Wahoo、Garmin 和其他第三方连接入口保持隐藏，对应服务端路由仍受
`third-party-sync` capability 拒绝。

用户 Key 只提交到本地 `server`，使用安装器生成的 `SELF_HOST_INTEGRATION_SECRET` 通过 AES-256-GCM
加密后保存到 PostgreSQL，后续只返回末四位。这个能力需要 Server 主动访问 `intervals.icu`，因此不是纯离线能力；
API Key 不应写入共享 `.env.selfhost`。官方认证约定是 HTTP Basic，用户名固定为 `API_KEY`，密码为个人 Key，
Server 的 Intervals.icu client 已按该格式发送。

备份包含 PostgreSQL 中的 Key 密文，实例密钥需在安全位置单独保存。恢复数据库时同时恢复原始认证和集成密钥，
已有凭据才能继续解密；管理工具不会打印或导出这些密钥。完整流程见 [备份恢复](BACKUP_RESTORE.md)。

## 在 Client 中配置 AI

Owner 首次引导的最后一步会直接提供自有 AI 配置，而不是显示 Trainingload.ai 云端供应商授权页；跳过后仍可在
“设置 → 自托管 AI”中选择 OpenAI、DeepSeek、OpenRouter、阿里云百炼
（DashScope）或自定义 OpenAI-compatible API，并设置 API Key、Base URL、常规模型和推理模型。该界面
只在 self-host 实例显示，且只允许已登录的实例 owner 读写。

OpenAI 这里需要的是 OpenAI API Key；ChatGPT Plus/Pro 订阅不等于 API 额度，也不能直接当作 API Key。
AI 默认关闭；即使实例使用 `core-local`，owner 也可显式选择一个 BYOK provider。一旦开启，AI 请求会
离开本机发送到所选 provider，不再属于纯离线运行。

API Key 只会提交到本地 `server`，使用实例 auth secret 派生的 AES-256-GCM key 加密后保存在
PostgreSQL；后续 API 只返回“已配置/未配置”，不会把原文返回浏览器。Owner 配置在保存后优先于
`.env.selfhost`；环境变量只是首次界面保存前的部署级兜底。从环境变量切换到界面管理时，必须重新输入
API Key，server 不会把环境中的 secret 回显给 client。

备份会带上数据库中的密文，但不会带上 `.env.selfhost` 中的 auth secret。恢复时必须同时恢复原始实例认证密钥；
更换密钥会导致已有 AI 凭据和认证状态无法解密，应先确认原始配置再启动。
环境变量兜底示例见 [`.env.example`](./.env.example)。

## 网络模式与地图

默认 `SELF_HOST_HTTP_BIND=127.0.0.1`、`SELF_HOST_HTTP_PORT=43210`、`SELF_HOST_SITE_ADDRESS=http://localhost:43210`。
只发布这一个 Client 端口，不保留内置 HTTPS、Docs 端口或网关配置。

新实例默认使用 `SELF_HOST_MODE=connected` 和 `MAP_PROVIDER=openfreemap`，通过 MapLibre 与 OpenFreeMap
显示基础地图，无需 Mapbox token。地图样式、字体和瓦片由最终用户浏览器直接请求 OpenFreeMap；活动路线与训练数据仍保存在
Self-host 实例中。需要完全离线运行时，可在首次启动前改为 `SELF_HOST_MODE=core-local` 和 `MAP_PROVIDER=none`，
此时地图退回只显示活动路线、起终点和比例尺的本地样式。也可按配置契约使用 OSM-compatible raster/vector
服务或合法的本地图块，并保留对应署名。

AI 仍默认关闭。Owner 可在 onboarding 或“设置 → 自托管 AI”配置自己的 Provider、Base URL 和模型。
无 AI 配置时训练数据、导入、指标和计划仍可使用，AI 返回明确不可用状态。
完整边界见 [地图与高程](docs/self-hosting/maps-and-elevation.zh.md)。

文件导入和 Intervals.icu API Key 是当前支持的导入方式；完整能力边界见
[SELF_HOST_KNOWN_LIMITATIONS.md](./SELF_HOST_KNOWN_LIMITATIONS.md)。
`TELEMETRY_ENABLED=false` 固定关闭官方遥测；公共版本不含官方 GA 项目 ID。Docs 是单独部署的网站源码。

不要把 `.env.selfhost` 提交到 Git，不要公开 `data/`，不要使用 `docker compose down -v`。

## 不使用 Docker Compose 的部署

当前签名 self-host v1 的正式支持路径只有 Docker Compose。这不是因为应用代码必须依赖 Compose，而是
release bundle、验签、迁移门禁、备份/恢复、升级/回滚和 doctor 目前是一个共同的 Compose 生命周期契约。

| 方式                                                           | 当前定位                       | 说明                                                                                    |
| -------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| Docker Compose                                                 | 正式支持                       | 使用签名 bundle 和统一管理 CLI                                                          |
| 本机 Node.js 进程 + PostgreSQL + Caddy/Nginx + systemd/launchd | 技术上可行，尚未作为发行物支持 | 需要独立的 standalone apps/client/server 产物、迁移器、service 定义和同等的数据安全契约 |
| Podman / Kubernetes / Helm                                     | 尚未支持                       | 不能把当前 Compose 文件或原始 `docker run` 组合当成经过验收的生产方案                   |
| 从源码直接运行                                                 | 仅开发/验证                    | 不是正式 release 安装和升级路径                                                         |

因此，现在如果目标是稳定的本地自托管，仍建议使用 Compose。后续若增加 native 方式，应发布独立且可验签的
native bundle，而不是让用户手工组合源码、环境变量和迁移命令。

## 日常管理

```bash
./self-host status --json
./self-host logs --tail 200 --service server --json
./self-host doctor --json
./self-host diagnostics --output support --json
./self-host stop --dry-run --json
./self-host stop --json
./self-host uninstall --dry-run --json
./self-host uninstall --json
```

Diagnostics 即使通过自动脱敏也必须人工检查后才能通过维护者指定的私密渠道分享。稳定 error code 和 remediation
位于 bundle 的 `docs/self-hosting` 目录中；human message 不是自动化判断接口。
`uninstall` 默认保留配置与全部数据；不可逆删除必须改用
`uninstall --delete-data --confirm-data-root <absolute-path>`，先执行同参数 dry-run，并预先完成 verified off-host backup。
实际删除前 CLI 会把已确认的数据根按 inode 身份原子移入同目录、operation-scoped 的隔离名，复核身份未变后才递归删除；
路径在确认后被替换时返回 `SELF_HOST_UNINSTALL_DATA_ROOT_CHANGED`，不会对替换内容执行递归删除。

日常值班与故障处置见 [SELF_HOST_OPERATIONS.md](./SELF_HOST_OPERATIONS.md)，产品边界见
[SELF_HOST_KNOWN_LIMITATIONS.md](./SELF_HOST_KNOWN_LIMITATIONS.md)，备份/恢复见
[BACKUP_RESTORE.md](./BACKUP_RESTORE.md)，升级/回滚见 [UPGRADE.md](./UPGRADE.md)。
发行验收与签名证据验证见 [docs/self-hosting/acceptance-matrix.zh.md](./docs/self-hosting/acceptance-matrix.zh.md)。
RC 证据布局与离线校验见 [docs/self-hosting/release-candidate.zh.md](./docs/self-hosting/release-candidate.zh.md)。

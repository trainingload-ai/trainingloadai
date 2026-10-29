# Self-host 镜像供应链

本文定义 `trainingload-server`、`trainingload-client`、`trainingload-docs` 的构建、验证、签名与
消费边界。镜像层只负责供应链；SH5 的 Compose 与 SH10 的完整 release bundle / 安装 CLI 在其上建立，不能用
单独镜像或 image evidence 代替可安装发行物。

## 1. 镜像契约

机器可读契约位于：

- `docker/selfhost/image-contract.json`：平台、基础镜像、UID/GID、端口、入口、OCI labels；
- `docker/selfhost/supply-chain-contract.json`：工作流、Action SHA、attestation 与 Cosign 版本。

三个镜像共享：

- `linux/amd64` 与 `linux/arm64`；
- 精确 Node 版本和多架构 index digest；
- UID/GID `10001:10001`；
- release version、source revision、config schema version；
- SPDX `AGPL-3.0-only` 许可证标签；
- `SIGTERM` stop signal；
- 无 npm、npx、pnpm、Corepack 或 Yarn 的运行阶段。

基础镜像选择 Debian Bookworm slim，而不是 Alpine。Node 官方镜像说明将 Debian 变体作为支持路径，
而 Alpine 使用 musl；统一 Debian 可以减少 native dependency 在 amd64/arm64 上出现不同 ABI 行为的
概率。基础镜像必须同时写精确版本与 `sha256` index digest，不能只写 tag。

## 2. 默认不发布

`.github/workflows/selfhost-images.yml` 只接受 `workflow_dispatch`，输入 `publish` 默认 `false`：

- `publish=false`：构建 3×2 个本地镜像并验证，不登录 registry、不申请 OIDC、不推送；
- `publish=true`：只有当前 ref 等于 `refs/tags/v<package version>` 才继续；
- 不生成或更新 `latest`；
- checkout 禁止持久化 Git credentials；
- 外部 Actions 全部固定到完整 40 位 commit SHA。

稳定 tag 只在所有候选镜像构建、签名、回拉和证据校验完成后提升。提升工具拒绝把已有 tag 改指向
另一个 digest；相同 digest 的重复执行是幂等的。候选 tag 使用 run ID/attempt 隔离，不能作为稳定
部署依据。

## 3. 两层等价验证

### 3.1 源码构建层

每个 role × platform 独立构建并加载到 runner，随后执行：

1. OCI labels、OS/architecture、非 root UID/GID、workdir、port、exec-form command；
2. Node 入口文件 `--check`；
3. 在目标架构用户态中验证 `process.arch`、UID、GID；
4. 验证运行镜像没有 package manager；
5. 导出镜像，逐 layer 检查敏感路径、高置信 credential marker 与 leak canary。

构建前在 `.env`、`.aws/credentials`、`uploads/`、`data/`、`backups/` 写入唯一 canary。任何
Docker ignore 或 allowlist 退化都会让 layer scan 失败。

### 3.2 Registry 回拉层

发布候选使用同一 revision 构建多架构 index，并启用 BuildKit `sbom: true` 与
`provenance: mode=max`。随后：

1. 对 image index digest 做 Cosign keyless 签名；
2. 以精确 certificate identity 与 GitHub OIDC issuer 立即验证；
3. 验证签名 payload 绑定同一个 digest；
4. 验证 index 恰好包含 amd64/arm64，并且每个平台都有 attestation manifest；
5. 验证至少两个 SPDX 文档与两个 provenance statement；
6. 分别按 digest/平台重新 pull，复用源码构建层的 smoke 与 layer scan。
7. 对三个精确 image digest 的 amd64/arm64 变体运行 Docker Scout；只扫描已有修复的 critical/high
   CVE，任一 finding 立即失败，并把六份 SARIF 绑定回 image digest。

Docker 官方说明 attestation 依附 image index，经典本地 image store 不能保留它们，因此本地
`load` smoke 显式关闭 attestation，正式候选则 push 后从 registry 验证。这不是降级，而是两个不同
导出器能力的明确分工。参见 [Docker build attestations](https://docs.docker.com/build/metadata/attestations/)
和 [GitHub Actions SBOM/provenance](https://docs.docker.com/build/ci/github-actions/attestations/)。

`mode=max` 会记录 build args，所以 Dockerfile 与工作流禁止用 build arg 传 secret；前端 build args
只允许最终会进入浏览器的公开配置或 self-host 本地 URL。secret 必须留在运行期配置边界。

## 4. Release evidence 与可安装 bundle

每个成功发布产生可下载的 Actions artifact：

```text
release-manifest.json
image-digests.txt
vulnerability-result.json
vulnerability/server|client|docs-amd64.sarif.json
vulnerability/server|client|docs-arm64.sarif.json
checksums.txt
checksums.bundle.json
server|client|docs.index.json
server|client|docs.sbom.json
server|client|docs.provenance.json
server|client|docs.signature.json
server|client|docs.result.json
```

`release-manifest.json` 只引用 digest，不把 tag 当作权威标识；每个 image entry 同时记录漏洞策略、平台级 SARIF
路径与 SHA-256。聚合器要求扫描结果恰好覆盖 3 roles × 2 platforms、finding 为零且与同一 digest 绑定；缺失、symlink、
超限、checksum 漂移或重新签名后的阳性报告均 fail-closed。每份 SARIF 只通过一个有界稳定句柄读取一次，零 finding 语义解析与
SHA-256 都基于同一 Buffer，不能在两步之间把报告替换成另一组字节。`checksums.txt` 覆盖除其自身和签名 bundle 外的
全部证据文件。最终发布 job 使用固定版本 Cosign 对 `checksums.txt` 做 keyless blob 签名，
`checksums.bundle.json` 携带可离线验证的证书、签名与透明日志证据。这样 operator 认证的是完整 release inventory，
而不只是可被一起替换的一组普通 checksum。严格树的文件、目录与深度由已验证 manifest 精确推导，额外空目录同样被拒绝；
每个 evidence、checksum 与 signature 文件最多 32 MiB，签名 evidence 集合最多 512 MiB。验证器先把 checksum、signature、
manifest 和 checksum inventory 声明的其余文件逐项稳定复制到随机私有快照；hashing、Cosign 与 evidence 语义校验全部只读取
该快照，结束后删除。调用 Cosign 前还会冻结 checksum payload 的原始字节；Cosign 返回后必须保持逐字节一致，并再次核对
精确树与全部已声明文件摘要，才会进入内容语义校验。因此来源目录或验签期间的工作副本变化都不能形成“内容按 A 校验、签名按 B
验证”。镜像 tag
是发现入口，digest 才是部署和审计依据。Metadata 解析与 SHA-256 均从单一文件句柄完成，并在读取前后复核
device/inode/size/mtime/ctime，避免预检、解析与摘要分别落到不同字节。
生成 release manifest、验证已发布 index/SBOM/provenance/Cosign payload、扫描 Docker save manifest 与执行 tag promotion
前，JSON 输入均受 32 MiB 单文件上限与同句柄稳定性校验；promotion 在第一次 registry 写入前还会执行完整 release manifest
语义验证。静态供应链门禁会拒绝这些入口退回直接 `readFile`，Docker save layer inventory 另外限制为最多 1024 层。
镜像 config 与 layer secret scan 通过同一稳定句柄按 1 MiB chunk 流式处理，单文件上限 8 GiB；扫描前后
device/inode/size/mtime/ctime 必须一致，既不把大 layer 整体载入内存，也不接受扫描期间的 symlink 或内容替换。

最终发布还会把上述内容与固定版本的 Compose、配置模板、管理 runtime、schema、Agent 契约及用户文档装配为
`trainingload-selfhost-<version>`。Bundle 有独立的完整文件 inventory、SHA-256 清单和 Cosign blob signature；配置模板
中的三个 application image 被重写为 manifest 的精确 digest。发布工作流实际执行 bundle installer dry-run，并用相同
时间戳、排序、owner/group 连续生成两份归档逐字节比较后才上传。Operator 应消费该完整 bundle，而不是本节列出的
底层 image evidence artifact。安装后允许顶层 `.env.selfhost`、`.selfhost` 与 data-root 等运行时状态存在，但所有已签名
子树仍按 manifest 精确复验；在 `scripts/`、`schemas/`、`docker/`、`docs/` 或 vulnerability evidence 内插入未签名文件、
目录或中间 symlink 都会失败。Bundle 根目录最多扫描 1024 个条目；已签名条目以外只接受受保护的 `.env.selfhost` 和
作为 `.selfhost`/自定义 data-root 的真实目录，未声明普通文件、symlink 与 special file 都会失败。
Bundle contract 进一步冻结 32 MiB 单文件与 512 MiB 全部签名文件累计上限；builder 在复制源码/证据前记账，verifier
在快照复制、checksum hashing 与 Cosign 前对 manifest 声明的完整签名集合记账，因此最终归档限制不是第一道磁盘与读取资源边界。
Acceptance/RC 解包器还会把 tar 的普通文件展开大小映射回同一预算，在 `tar -xzf` 前拒绝单文件或累计展开超限，避免
高压缩比归档绕过内层 bundle 边界。

## 5. Operator 验证

以下示例中的 `VERSION`、`DIGEST` 和仓库名必须来自同一个 `release-manifest.json`：

```bash
IMAGE=ghcr.io/OWNER/REPOSITORY/trainingload-server
VERSION=1.1.16
DIGEST=sha256:REPLACE_WITH_RELEASE_MANIFEST_DIGEST
SOURCE=https://github.com/OWNER/REPOSITORY

resolved="$(docker buildx imagetools inspect "$IMAGE:$VERSION" \
  --format '{{json .Manifest.Digest}}' | tr -d '"')"
test "$resolved" = "$DIGEST"

cosign verify \
  --certificate-identity "$SOURCE/.github/workflows/selfhost-images.yml@refs/tags/v$VERSION" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  "$IMAGE@$DIGEST"

cosign verify-blob \
  --bundle checksums.bundle.json \
  --certificate-identity "$SOURCE/.github/workflows/selfhost-images.yml@refs/tags/v$VERSION" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  checksums.txt

docker buildx imagetools inspect "$IMAGE@$DIGEST"
docker pull "$IMAGE@$DIGEST"
```

GitHub OIDC job 必须显式授予 `id-token: write`；该权限只存在于签名镜像的发布候选 job，以及在全部候选验证和
tag 提升完成后签名 release inventory 的 finalize job；普通验证 job 不持有它。参见
[GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc) 和
[Cosign verification](https://docs.sigstore.dev/cosign/verifying/verify/)。

漏洞扫描 job 只拥有 `contents: read` 与 `packages: read`，在候选签名验证完成后读取精确 digest，不持有 package write
或 OIDC。它使用固定版本的 Trivy 分别扫描 `linux/amd64` 与 `linux/arm64`，先保留完整 SARIF 证据，再以独立门禁拒绝仍有
修复版本的 Critical/High 漏洞。扫描不依赖商业 SaaS 账户或额外 Secret；参见
[Trivy image command](https://trivy.dev/docs/dev/references/configuration/cli/trivy_image/) 和
[aquasecurity/setup-trivy](https://github.com/aquasecurity/setup-trivy)。

## 6. 更新规则

更新基础镜像或 Action 时必须：

1. 从官方 registry/repository 解析新版本和 digest/SHA；
2. 同时修改机器契约与使用点；
3. 运行 `pnpm selfhost:image-supply-chain`；
4. 运行 `pnpm test:selfhost-image-supply-chain`；
5. 在 Docker-capable runner 上以 `publish=false` 完成全部 3×2 smoke；
6. 发布时使用新的 `v<version>` ref，不能覆盖已有版本 tag。

不得只移动 tag、只更新注释版本、关闭签名验证或把缺失 evidence 当作 warning。

# Self-host v1 Release Candidate

RC 不是重新打包一份未经验证的 release。它是一个签名、不可变、自包含的证据集合，把同一 revision 的可安装 release、
完整 8 格验收、冻结契约、用户文档以及两个显式人工评审绑定在一起。缺少任一输入时不生成候选工件。

## 输入与信任边界

`.github/workflows/selfhost-release-candidate.yml` 只允许在 `refs/tags/v<exact-version>` 手动触发，且
`github.sha` 必须等于输入的 40 位 release revision。输入包括：

- `selfhost-images.yml` 同 revision 运行产生的签名 release artifact；
- `selfhost-acceptance.yml` 同 revision、同 archive digest 产生的签名 aggregate gate；
- 一份满足 `schemas/self-host-release-attestation.schema.json` 的 release attestation；
- 单调递增的 `rc.N` candidate ID。

Release attestation 是不含 secret/用户数据的 allowlist 摘要，并在 workflow 输入中以 canonical base64 提交。它必须绑定精确
version、revision 与 release archive SHA-256，生成时间不超过 30 天，同时包含两类外部证据的 digest 与稳定引用：

- Codex clean-room：只使用签名 release bundle 内契约，在 clean target 上完成 installer dry-run、安装、readiness、核心旅程、
  container recreate、真实主机重启与重启后数据复验；owner bootstrap 必须由 operator 本机完成，diagnostics 已人工审阅且
  secret scan 通过；
- issue review：已审阅已知限制，未解决 P0=0、P1=0，release blocker=0。

引用可以位于权限受控位置；RC 不复制可能含 secret 或用户数据的原始证据，只复制 schema-valid attestation 摘要。Operator
必须确认引用可供 reviewer 访问，digest 与被审阅内容一致。仅提供任意 64 位 hash/URL 不再构成通过证据。

### 准备 release attestation

只有在上述 clean-room 与 issue review 事实都真实完成后，operator 才能按
`schemas/self-host-release-attestation.schema.json` 填写 `release-attestation.json`。`generatedAt` 使用当前 UTC；release 三元组必须
来自已签名 archive；两个 `evidenceSha256` 必须是 reviewer 实际查看的证据内容 digest，而不是随机值。引用必须是稳定的 `https://`
或 `codex://` URL，禁止 userinfo、query 参数、临时签名 URL、secret 和用户数据。

在可信仓库的精确 release tag checkout 中执行：

```bash
pnpm selfhost:release-attestation-prepare \
  --attestation-file 'release-attestation.json' \
  --release-version '<exact-version>' \
  --release-revision '<exact-40-character-revision>' \
  --release-archive-sha256 '<exact-64-character-archive-sha256>' \
  --json
```

命令会验证 schema、精确 release 绑定、30 天时效、platform/architecture、Docker 版本格式、Compose major ≥ 2、桌面平台的
`dockerOperatingSystem` 必须识别为 Docker Desktop、一切 required passing claim、引用安全和常见 secret pattern，并输出 canonical
`releaseAttestationBase64`。它不会替 operator 生成通过声明，也不会证明引用背后的证据真实。将该字段
的值原样填入 RC workflow 的 `release_attestation_base64` 输入；任何未实际完成的字段都必须保持 NO-GO，不能为了通过 schema
填 `true`。

在 checkout release revision 之前，workflow 使用固定 Cosign identity 验证 release 外层 checksum signature 和 aggregate
acceptance signature，逐文件重算 checksum，拒绝 symlink、special file、路径逃逸和不完整 inventory，并从 archive 流式读取
release manifest；checksum 与 signature 必须先通过 16 MiB 普通文件边界，Cosign 子进程有 timeout/output 上限。Acceptance
evidence 最多 64 MiB，完整 RC 最多 4.5 GiB，目录树最多 10,000 个文件、10,000 个目录与 64 层；额外空目录也会被拒绝。
该 bootstrap 只能使用 workflow 内联代码，因此自己实现有界稳定句柄：它在 Cosign 前冻结 acceptance checksum，验签后逐字节比较，
并从同一 Buffer 解析 inventory；release archive 在全部 `tar` 检查后再次重算签名摘要，acceptance manifest 的语义和摘要也来自同一
Buffer。workflow 合约会编译检查这段内联 JavaScript，并拒绝移除这些绑定。
Release archive 的外层 checksum 原始字节与 archive 摘要在 Cosign 前冻结，返回后必须再次一致，之后才会调用 `tar`；验签期间
同步替换 archive 与 checksum 不能改变被解包和执行的 release。
Finalizer 将输入复制进 RC staging 后，还会把 release 的 archive/checksum/signature bundle 以及 acceptance 的
checksum/signature bundle 摘要对回刚才认证的快照，并重新验证复制后 acceptance 的精确 inventory 与全部文件摘要。因此即使下载
目录在“认证完成、候选复制”之间变化，也不会产出一个留待签名后才失败的候选。
该阶段不解包、也不执行 release 内代码。认证成功后才 checkout 相同 revision；后续 release 预处理仍会在真正解包前校验
tar 的 path/type，并按 32 MiB 单文件、512 MiB 累计预算核对声明展开大小，再执行完整内层验证器。

## 输出布局

`trainingload-selfhost-rc-<version>-<candidate>` 包含：

```text
release-candidate-manifest.json
release-candidate-checksums.txt
release-candidate-checksums.bundle.json
release/
  trainingload-selfhost-<version>.tar.gz
  trainingload-selfhost-<version>.tar.gz.sha256
  trainingload-selfhost-<version>.tar.gz.sha256.bundle.json
  release-manifest.json
  bundle-manifest.json
  checksums.txt
  checksums.bundle.json
acceptance/
  acceptance-manifest.json
  acceptance-checksums.txt
  acceptance-checksums.bundle.json
  reports/*
  environments/*
  contracts/*
attestations/
  release-attestation.json
documents/*
contracts/*
```

外层 RC checksum 覆盖 release 外层/内层签名、全部 acceptance evidence、冻结文档和契约；
结构化 release attestation 也在同一 inventory 内；`release-candidate-checksums.bundle.json` 本身由 RC workflow 的 GitHub OIDC
identity 签名。

## 离线验证

在可信仓库 checkout 精确 `v<version>` tag、按 lockfile 安装依赖，并从同一 artifact 下载整个候选目录后，执行完整验证器：

```bash
pnpm selfhost:release-candidate-verify \
  --candidate-directory '<downloaded-candidate-directory>' \
  --release-version '<exact-version>' \
  --release-revision '<exact-40-character-revision>' \
  --json
```

`status=passed` 只在以下链路全部重验后输出：RC workflow identity 与外层签名、精确 checksum inventory、候选 schema 和
tag/revision、release 外层与内层签名、archive digest、8/8 acceptance aggregate 及逐格场景/安全/资源/宿主 runtime 语义、
未过期 release attestation、host restart、P0/P1/blocker=0、冻结文档与契约 hash。验证器对任何缺失、额外、篡改、symlink、special file、identity 或
摘要不一致以非零状态失败；RC workflow 自身也会在上传 artifact 前运行同一验证器。

验证器会先在冻结的文件数、目录数、深度与累计字节预算内把下载目录复制到随机私有工作目录，后续外层验签和全部嵌套复验只读取
该快照；逐文件复制不会读取超过打开时声明的长度，完成后还会重验精确 path/type/size inventory 与累计预算。验证期间替换原下载
目录中的 checksum、archive 或 evidence 不会改变本次验证对象。RC 与 acceptance 的 checksum payload 在调用 Cosign 前以原始字节
冻结，返回后必须逐字节一致，之后才按该载荷重算完整 inventory；验签进程期间同步替换 evidence、manifest 与 checksum 也会被拒绝。

离线验证需要额外临时磁盘保存 candidate 快照、release archive 快照和解包后的 bundle。按冻结的极限输入计算，峰值临时空间约
9 GiB（4.5 GiB candidate + 4 GiB archive snapshot + 512 MiB expanded bundle）；空间不足会 fail closed 并清理随机工作目录。

这些上限在签名验证和逐文件 hashing 前执行，避免让 Cosign 或 checksum traversal 先处理无界输入；它们是发行工件契约的一部分，
不是仅供文档参考的建议值。

如需独立审计最外层信任根，可先手工验证 RC inventory signature：

```bash
version='<exact-version>'
identity="https://github.com/Buerber/trainingloadai/.github/workflows/selfhost-release-candidate.yml@refs/tags/v$version"
cosign verify-blob \
  --bundle release-candidate-checksums.bundle.json \
  --certificate-identity "$identity" \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  release-candidate-checksums.txt
sha256sum -c release-candidate-checksums.txt
```

Windows PowerShell 可用 `Get-FileHash` 逐行重算；手工检查不能只验证 RC 外层后跳过 release archive 自己的外层/内层
signature。标准发布决策应以完整验证器成功为前置，而不是只运行上述两条底层命令。

`release-candidate-manifest.json` 必须同时满足：

- `status=candidate`，workflow ref 是精确 release tag；
- release version、revision 与 archive SHA-256 和 acceptance manifest 完全一致；
- 8/8 matrix cell passed，报告与环境文件 hash 完整；
- `attestations/release-attestation.json` hash 与 manifest 一致，release identity 完全相同，且 attestation 未过期；
- Codex clean-room `status=passed`，`contractSource=signed-release-bundle-only`，真实 host restart 与重启后数据验证均为 `true`；
- unresolved P0/P1 均为 0；
- release blocker 为 0，known limitations 已审阅；
- `databaseRollback=unsupported`，supported source 与 application rollback 是 release manifest 中的精确列表；
- 文档与契约 hash 均由 RC checksum inventory 覆盖。

## 发布决策

生成 RC artifact 不等于发布 stable，也不授权 push、GitHub Release、registry 变更或生产部署。Reviewer 必须核对所有引用，
确认已知限制可接受、没有过期证据，并记录独立发布决策。任何 checksum、identity、revision、run ID、报告或 attestation
不一致都按 NO-GO 处理，不能手工重算 checksum 后继续。

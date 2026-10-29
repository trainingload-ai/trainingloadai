# SH4 镜像供应链证据

日期：2026-10-18

范围：production Dockerfiles、amd64/arm64 contract、non-root/runtime hardening、source/prebuilt
等价 smoke、layer secret scan、fixable critical/high CVE scan、SBOM、provenance、Cosign signature、release manifest 与 immutable
tag promotion。

结论：SH4 实现与当前主机可执行的静态门禁通过；SH4 总退出门禁仍为
`BLOCKED ON RUNNER`。当前主机没有 Docker CLI，且本独立分支没有推送，因此没有伪造多架构构建、
registry 回拉或签名证据。该执行缺口沿用 `B-SH0-001`，并在本阶段记为 `B-SH4-001`。

## 1. 交付映射

| 门禁                   | 实现与证据                                                                        | 状态                        |
| ---------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| production Dockerfiles | 三个镜像精确 pin `node:22.23.3-bookworm-slim@sha256:…`；build/runtime 同源        | 静态通过                    |
| amd64/arm64            | image contract 与 workflow matrix 固定两个平台；官方 index digest 声明两个架构    | 静态通过，实机构建阻塞      |
| non-root runtime       | 三个 runner 均为 `10001:10001`，COPY 固定 ownership，server `/data` 归属明确      | 静态通过，运行验证阻塞      |
| 最小运行面             | runner 移除 npm/npx/pnpm/Corepack/Yarn；`STOPSIGNAL SIGTERM`                      | 静态通过，运行验证阻塞      |
| OCI metadata           | source/revision/version/created/license/base/config schema/role labels            | 通过                        |
| source rebuild test    | role×platform 3×2 matrix，入口语法、arch、UID/GID、labels、commands               | 已实现，执行阻塞            |
| prebuilt equivalence   | 候选 push 后按 index digest/平台回拉，复用同一 smoke 与 layer scan                | 已实现，执行阻塞            |
| layer secret scan      | build-context canary + 全 layer 路径/credential marker scan                       | 单元通过，镜像执行阻塞      |
| fixable CVE gate       | Docker Scout 对 3 roles × 2 platforms 的精确 digest 扫描；critical/high 零容忍    | 合约/证据测试通过，执行阻塞 |
| SBOM/provenance        | BuildKit SPDX SBOM 与 max provenance；按平台校验 attestation                      | 已实现，registry 执行阻塞   |
| signature              | Cosign 3.0.6 keyless，精确 workflow/tag identity 与 GitHub OIDC issuer            | 已实现，OIDC 执行阻塞       |
| digest/checksum        | release manifest、platform digests、evidence checksums、拒绝 symlink              | 通过                        |
| immutable release      | `publish=false` 默认；只允许匹配 `v<version>`；拒绝覆盖异 digest tag；无 `latest` | 通过                        |

## 2. 自动验证

```text
pnpm selfhost:image-supply-chain
  image contract: PASS (3 images, linux/amd64, linux/arm64)
  workflow: PASS (10 pinned actions, publish default off)

pnpm test:selfhost-image-supply-chain
  266 tests passed / 0 failed

pnpm validate:deployment-config
  Deployment configuration is consistent: 288 contract keys, 284 runtime keys.

workflow YAML parse
  PASS; jobs = validate-contracts, smoke-source-images, publish-candidates, vulnerability-scan, finalize-release

embedded workflow shell syntax
  PASS; 24 scripts accepted by bash -n

Prettier + git diff --check
  PASS
```

### 2026-10-18 文档镜像构建复核

文档镜像的完整生产图在 Node `22.22.2`、`NEXT_BUILD_CPUS=1` 和 3 GB V8 heap 下完成 Webpack 编译及 1,010 个静态页面生成；
`pnpm --dir docs test` 为 122 files / 662 tests，`tsc --noEmit` 通过。复核同时确认：2 GB heap 会 OOM，而当前
Turbopack 路径会停在 compile 且不产生有效构建输出。因此 production build 显式选择 Webpack，Dockerfile 默认 heap 为
3 GB，source/publish 两条镜像工作流分别对 docs 设置同一值；机器契约会拒绝降低 heap 或移除显式 bundler。该本机构建证据
验证了 docs Dockerfile 的应用构建入口、standalone API route 与 self-host CSP，但不替代下文仍缺失的真实容器、双架构、
layer scan 与签名证据。

覆盖的失败路径包括：

- floating base image、root runner、错误 license、缺失 COPY owner；
- runtime package manager 残留；
- `.dockerignore` 缺少敏感路径；
- mutable/unapproved GitHub Action、自动 publish、`latest`；
- 缺平台、缺 attestation、缺 SPDX/provenance statement；
- Cosign payload digest 不匹配；
- release 缺 image role/platform digest、降级为 min provenance、未验证签名；
- 漏掉平台 SARIF、扫描可 fail-open、scanner 获得 write/OIDC 权限、阳性 finding、SARIF symlink/checksum 漂移；
- 已有版本 tag 指向另一个 digest；
- checksum 输入为 symlink；
- release evidence 出现额外空目录，或任一 metadata 在 hashing/Cosign 前超过 32 MiB；
- 安装后的 bundle 在已签名子树中插入未签名文件、目录或中间 symlink。

供应链 JSON 与 digest 清单统一通过同目录临时普通文件完成内容与权限落盘、`fsync` 后再 exclusive publish；多文件
release 输出会先确认所有目标均不存在并全部完成 staging，再先发布 digest 清单、最后发布 `release-manifest.json` 就绪标记。
既有证据不会被覆盖，正常失败会回滚本次已发布文件，进程中断也不会暴露半截 JSON。

Release evidence verifier 还会冻结 checksum 与 Cosign bundle 两份签名工件的摘要并在验签后复核；bundle verifier 返回前重新扫描
实际源目录的签名子树、逐文件 checksum、签名工件与权限。验签只覆盖私有快照、但后续执行另一组已被替换源文件的路径会失败。

## 3. 供应链选择依据

- Docker 官方文档确认 build-push-action 支持 `sbom: true` 与 `provenance: mode=max`，attestation
  依附 image index，不能由经典 `load` store 保存。因此源码本地 smoke 与 registry attestation 验证
  是两道门禁，而不是假设一次构建同时满足两个导出器行为。
- GitHub 官方文档确认 keyless signing job 需要 `id-token: write`。权限只授予
  `publish-candidates`，不授予普通验证和 tag promotion。
- Cosign installer、Docker Actions、checkout、artifact Actions 均从官方 GitHub refs 解析到完整 commit
  SHA，并写入机器契约。工作流不信任可移动 major tag。
- 未直接引入 Trivy Action。[Aqua 官方事故说明](https://github.com/aquasecurity/trivy/discussions/10425)
  记录了 2026 年其 Action/发行供应链凭据泄露事件。secret/path layer 检查继续使用仓库内 scanner；CVE gate 使用
  固定完整 commit SHA 的 Docker Scout Action，并隔离在只有 registry read、无 package write/OIDC 的独立 job。

## 4. 未关闭证据与执行命令

本机探针：

```text
docker: unavailable
podman: unavailable
```

因此下列结果仍必须由 Docker-capable、干净的 Linux runner 产生：

1. `publish=false` 的 3 images × 2 platforms 源码构建与 smoke；
2. apps/server/client/docs 每个平台的实际 layer scan；
3. `publish=true` 在匹配 release tag 上的 multiarch index；
4. registry 按 digest 回拉的 3×2 等价 smoke；
5. 实际 SPDX/provenance 数量、Cosign transparency-log-backed verification；
6. 实际 3×2 Docker Scout SARIF 与零 fixable critical/high finding；
7. 最终 digest、checksums 和 `release-manifest.json` artifact。

执行顺序已经编码在 `.github/workflows/selfhost-images.yml`。在缺少这些运行输出前，SH4 的
退出门禁保持未通过；后续 SH5–SH12 可以继续实现，但 self-host v1 Definition of Done 不能宣称完成。

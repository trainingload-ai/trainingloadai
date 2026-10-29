# SH12 Release Candidate 与冻结证据

日期：2026-10-18

revision：本阶段提交生成后以 git revision 为准。

## 交付映射

| 门禁         | 实现/证据                                                                                 | 当前状态          |
| ------------ | ----------------------------------------------------------------------------------------- | ----------------- |
| v1 契约冻结  | `v1-contract.json` 交叉约束配置、Compose、宿主/镜像平台、数据、资源上限、升级与安全事实源 | 机器校验通过      |
| RC 聚合      | release + acceptance + docs + contracts + attestations 的原子 finalizer                   | 合成测试通过      |
| 输入认证     | checkout 前验证 release/acceptance identity、checksum、archive path/type 与 revision      | workflow 合约通过 |
| 完整证据     | 8 格报告、环境记录、release archive、内外签名、文档与契约进入同一 checksum inventory      | 合成测试通过      |
| 人工门禁     | schema-valid attestation 绑定 digest/reference、host restart、P0/P1/blocker=0             | fail-closed       |
| Attestation  | 受支持 CLI 校验 release 绑定、时效、引用安全、secret pattern 并生成 canonical Base64      | 合成测试通过      |
| RC 供应链    | GitHub OIDC 签名、立即 verify、固定 action SHA、90 天 artifact retention                  | workflow 合约通过 |
| 下载后复验   | 单命令重验 RC、release、acceptance、attestation、文档与契约的完整嵌套证据链               | 合成测试通过      |
| 已知限制     | `SELF_HOST_KNOWN_LIMITATIONS.md` 区分可接受 P2 边界与发布 blocker                         | 文档合约通过      |
| 运维 runbook | `SELF_HOST_OPERATIONS.md` 覆盖值班、备份、恢复、升级、故障和支持                          | 文档合约通过      |
| 升级窗口     | release manifest 精确 source/rollback，最多同 major 两 minor，数据库不回滚                | v1 契约通过       |
| 定期文档 CI  | 周一 UTC 03:17 + push/manual；Ubuntu/Windows wrapper 与 31 个命令场景                     | workflow 合约通过 |
| 发行复盘     | `release-retrospective.zh.md` 记录结构决策、修复和未关闭外部门禁                          | 已完成            |

## 不变量

1. RC workflow 只能在精确 release tag/revision 手动运行；没有自动、PR 或 fork 触发。
2. 在认证 release 外层签名、acceptance aggregate 签名和逐文件 checksum 前，不 checkout、解包或执行 release 代码。
3. Acceptance 必须是同一 archive digest 的 8/8 passing aggregate；单格 artifact 或人工拼接目录不能代替。
4. Codex clean-room 和 issue review 不是自由文本或任意 hash：必须提交 schema-valid allowlist attestation，绑定精确 release，
   显式证明 host restart 后数据仍在、owner bootstrap 由 operator 执行，以及 P0/P1/blocker 全为 0；attestation 被 RC 签名覆盖。
5. Candidate manifest 从 release manifest 原样冻结 config/Compose/bundle/database schema 与精确兼容列表，不自行推导兼容。
6. RC checksum 覆盖原始 release archive、release 内外签名、完整 acceptance、文档、契约和 manifest；签名 bundle 除外。
7. 上传 RC artifact 前必须用与下载后相同的完整验证器复验嵌套签名、digest、schema、8 格证据和 attestation 摘要。
8. 生成候选不授权 push、GitHub Release、registry 写入或生产部署。
9. 内层 release 签名 inventory 必须覆盖漏洞聚合结果和 3 roles × 2 platforms SARIF；每份 SARIF 的 finding 校验与 SHA-256
   必须来自同一次有界稳定读取，RC 通过完整 release archive 与嵌套验证继承该门禁。
10. checksum/signature 在调用 Cosign 前必须是有界普通文件；acceptance 与完整 RC 分别受 64 MiB、4.5 GiB 累计预算约束，
    evidence tree 最多 10,000 个文件、10,000 个目录、64 层且不接受 inventory 无法表示的额外空目录。
11. 内层 release bundle 在进入 RC 前已受冻结的 32 MiB 单文件与 512 MiB 累计预算约束，且该约束由 v1 contract
    交叉校验；不能用 RC 的 4.5 GiB 外层预算替代内层装配和验证边界。
12. Acceptance/RC 预处理在 `tar -xzf` 前校验 archive 的条目 path/type，并从 verbose inventory 累加普通文件展开大小；
    32 MiB 单文件或 512 MiB 累计展开上限任一失败都不得落盘解包。
13. 下载后内层 bundle 复验最多扫描 1024 个顶层运行时条目，拒绝签名 inventory 外的普通文件、symlink 和 special file；
    只把真实目录视为潜在自定义 data-root，不递归扫描或消费其中的用户数据。
14. 管理 CLI、Compose smoke 与跨平台 acceptance 共享同一宿主环境隔离器；隔离源同时覆盖 Compose YAML 与实际
    `.env.selfhost` 的嵌套插值，RC 不能接纳由 runner shell 同名变量污染的 Compose stack 证据。
15. Codex clean-room attestation 的 Docker/Compose 版本复用管理核心解析器；畸形 Docker version、Compose major < 2，
    或 macOS/Windows 声明不含 Docker Desktop 的 `dockerOperatingSystem`，即使满足非空字符串 schema，也不能进入 RC；
    三项 runtime 身份都复制到 RC manifest 并由下载验证器与源 attestation 交叉核对。
16. 下载后验证器对每个 acceptance cell 重新执行当前契约的 scenario/security/resource 语义断言和完整宿主 runtime
    断言；即使重新计算 report、manifest 和 aggregate checksum，弱化证据也不能仅凭签名通过。
17. 下载后验证器对每份 report/environment 原始文本重新执行 secret scan，并在调用 `BigInt` 前把环境磁盘证据限制为
    最多 20 位的正整数字符串；签名不能覆盖 secret 泄漏或无界整数输入。
18. 下载后验证器先按 RC 文件数、目录数、深度和 4.5 GiB 累计预算把整个 candidate 复制到随机私有工作目录；RC 外层验签、
    快照复制严格限制为打开时的文件长度，拒绝增长/缩短，并对目的树重新执行精确 path/type/size inventory 与累计预算校验；
    外层验签、release/acceptance 嵌套复验、attestation、文档与契约校验全部只读取该快照。来源下载目录在验签期间变化不能
    形成“验签 A、验收 B”的结论。
19. RC checksum inventory 与其他 metadata 使用同一有界读取结果完成解析，不在预检后按路径重新打开；普通文件身份、精确
    长度和时间戳在句柄读取前后必须一致，确保验签、inventory 解析与后续摘要校验绑定同一组字节。
20. RC release/acceptance 子树复制复用有界 regular-tree snapshot 原语；总预算预检后，每个文件仍绑定初始清单中的精确长度，
    不能在树扫描与逐文件复制之间把单个文件扩展到整棵树的预算上限，目的树 path/type/size/mode 必须再次一致；workflow
    机器门禁拒绝 finalizer 移除该原语或重新引入 `fs.cp`。
21. Clean restore 在首次 bundle 验证后生成 target-owned 私有有界快照，并对完整快照复验及绑定首次 checksum identity；数据库和
    uploads 只消费该快照，源路径后续变化不能形成“校验 A、恢复 B”。快照在 full stack 启动前清理，清理失败保持 fail-closed。
22. Release evidence 的 checksum parsing、逐文件 hashing、Cosign 和内容语义校验共享同一随机私有有界快照；bundle 外层首次
    检查的 manifest/config 原始字节摘要必须命中该快照的签名 inventory；Cosign 前后还会比较 checksum payload 原始字节并重验
    精确树及逐文件摘要，来源目录或验签期间的快照变化不能拆开内容校验与签名认证。
23. Acceptance aggregate 与 RC 外层验证同样在调用 Cosign 前冻结各自 checksum payload；返回后先要求原始字节一致，再解析 inventory、
    重算摘要和执行嵌套语义验证。即使验签进程同时替换 evidence、manifest 与重算后的 checksum，也只能 fail closed。
24. Acceptance/RC 的 release archive 预处理在外层 Cosign 前冻结 checksum 原始字节与 archive SHA-256；Cosign 返回后先重读载荷并
    重算 archive 摘要，二者都不变才允许 `tar` 列表、展开预算检查和解包，不能把“已认证 A”替换成“实际解包 B”。
25. RC finalizer 从原始下载目录复制 release/acceptance 后，必须把 release archive、checksum、signature bundle 与 acceptance
    checksum、signature bundle 的摘要对回各自已认证快照，并对复制后的 acceptance 重验精确 inventory 和逐文件摘要；输入在
    “验证完成、复制开始”之间变化会在生成候选 checksum 前失败。
26. RC workflow 的 checkout 前 bootstrap 不依赖仓库代码，但必须从稳定句柄冻结 release/acceptance checksum 原始字节；Cosign
    返回后 acceptance checksum 必须逐字节一致，archive 在所有 `tar` 检查后必须再次命中签名摘要，acceptance manifest 的解析与
    摘要使用同一 Buffer。静态门禁同时编译检查这段内联 JavaScript，避免语法漂移让信任边界失效。
27. Acceptance matrix 的 checkout 前 bootstrap 对当前版与上一版执行同一控制：checksum/signature 为 16 MiB 有界普通文件，
    archive 为 4 GiB 有界稳定流；Cosign 后复核 checksum，`tar -tvzf` 拒绝 link/special file，manifest 流式读取后再次重算 archive
    摘要。任何一步失败都不能 checkout 或执行 release 代码。
28. v1 management contract 冻结 10 个实际 mutation 的实例级串行化、锁与 reclaim record 路径、两小时陈旧宽限，以及
    15 分钟回收上限和 strict reclaimer record + atomic replace 协议；record 必须绑定回收者 PID/operation/time 与旧锁
    ID/digest。active lock、死亡/超时回收者、畸形 lock、record 冲突和 owner 字节漂移均 fail closed。候选不能通过删掉
    backup/upgrade/restore 互斥、恢复 reclaim rename 空窗或用可覆盖 rename 释放锁来弱化一致性边界。
29. v1 contract 同时冻结管理状态与共享 evidence artifact 的原子发布清理语义：主写入失败时必须关闭句柄并删除私有临时文件，
    仅 `ENOENT` 可视为已清理；close/unlink 的二次失败必须保留原始错误并以 filesystem failure fail closed。RC 不能通过吞掉
    `.tmp` / `.partial` 清理错误而把未完成、可能含 secret 的证据留在发布目录。
30. RC 输入验签快照、acceptance gate 工作目录、candidate staging 与下载后验证快照的删除都是 required cleanup。若主操作与一个或
    多个目录删除同时失败，最终错误必须聚合并保留全部原因；若主操作成功但清理失败，RC 仍不能发布或报告验证通过。v1 静态
    契约冻结共享清理原语及上述全部调用点。

## 当前验证

- `pnpm selfhost:v1-contract`：通过；
- `pnpm selfhost:release-candidate-contract`：通过；
- `pnpm selfhost:docs-contract`：10 份文档、31 组命令场景通过；
- 全部 `scripts/selfhost/*.test.mjs`：以当前 revision 的 CI 汇总为准（本地最新完整运行全部通过）；
- RC finalizer：成功聚合、archive mismatch、checksum tamper、symlink、自动触发、mutable action、checkout 顺序、缺失/过期/
  未完成 host restart 的 attestation、签名顺序、下载后完整链路复验与篡改拒绝 fault tests 通过；
- Release bundle additive compatibility 与新增 v1 文档/契约 inventory 测试通过。
- release manifest、bundle 与 RC 嵌套验证已覆盖六份 SARIF、聚合结果和 digest/checksum binding。
- clean-room attestation runtime 版本、Docker Desktop 平台语义、RC manifest binding 与降级 fault tests 通过。
- 下载后 acceptance 语义重验覆盖重新封装 checksum 的场景弱化与 Compose v1 环境降级 fault tests。
- 下载后 acceptance secret 重扫与有界磁盘字节解析 fault tests 通过。

## 当前 blocker / 发布结论

- `B-SH11-001` / `B-SH8A-001`：当前宿主无 Docker，真实 Compose gates 未执行；
- `B-SH11-002`：没有证据表明专用 macOS Apple Silicon 与 Windows 11/WSL2 runner 已注册并完成 8 格验收；
- `B-SH8B-002`：没有诚实存在的 prior signed self-host release 可做真实 upgrade/rollback；2026-10-19 的已授权远端 tag 只读
  查询成功但返回零条 tag ref；
- `B-SH10-001`：没有真实 Codex clean-room 部署 attestation；
- `B-SH12-001`：没有由 release tag workflow 产生并签名的 release、acceptance aggregate 与 RC artifact。

因此 SH12 的实现面已建立，但环境级退出门禁和第 17 节总完成定义仍为 **NO-GO**。不得把本地合成测试、workflow 文件存在或
exit 77 skip 描述为 self-host v1 RC 已通过。

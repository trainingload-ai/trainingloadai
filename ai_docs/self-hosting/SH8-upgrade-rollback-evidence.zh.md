# SH8-B 升级与回滚证据

日期：2026-10-17

revision：本阶段提交生成后以 git revision 为准。

## 交付映射

| 门禁                   | 实现/证据                                                                              | 状态                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| upgrade preflight      | 签名 release inventory、严格 manifest、schema/epoch/source/migration/disk 检查         | 单元与 tamper 测试通过                                |
| immutable pull         | 三个 image 仅用 digest reference，pull 后检查 `RepoDigests`                            | mocked lifecycle 通过，真实 registry 阻塞             |
| migration policy       | 冻结 baseline、逐 migration checksum、expand/backfill/contract、两 minor contract 窗口 | policy 测试通过                                       |
| automatic backup       | 变更前调用已验证 quiesced backup；report 绑定 backup ID/path                           | mocked lifecycle 通过，真实 Docker 阻塞               |
| application rollback   | 精确声明 source、旧 image retained、数据库 forward-only、migration before/after 等价   | success/failure/retry 测试通过                        |
| failure containment    | pre-mutation marker、durable clear/re-arm、stop app、failed report、start block        | fault injection 通过                                  |
| tamper boundary        | report/marker/current state 严格 key、类型、顺序、checksum 与 OCI ref 校验             | tamper 测试通过                                       |
| release authentication | Cosign 签名 `checksums.txt`，固定 repository/workflow/OIDC/image namespace             | callback/contract/workflow 测试通过，真实 Cosign 阻塞 |
| real drill             | 旧版 → 当前版 → declared application rollback                                          | 尚无旧 self-host release 且当前 host 无 Docker        |

## 不变量

1. 未通过 Cosign blob signature 的普通 checksum 集合不能进入 upgrade plan。
2. Release image 必须是固定官方 namespace 下的 exact digest；tag 不能作为部署权威。
3. 当前 migration 必须是 target inventory 的 checksum 等价前缀；历史 migration 不允许重写。
4. Contract migration 至少等待两个 minor，且不能同时声明回到不兼容 source 的 application rollback。
5. 自动 backup、target image 全部 pull/inspect 成功后，才写 marker 和切换配置。
6. Upgrade 只改 `SELF_HOST_VERSION` 和三个 application image setting，不改 operator 配置或 secret。
7. Application rollback source 也必须是 digest-bound image；它不调用 database downgrade，且成功前后 migration
   inventory 必须相同。
8. Marker、current release state 和 report 只接受 strict schema；本地 tamper 不能被当作恢复依据。
9. Upgrade/rollback failure report 无法持久化时，命令不能把原动作报告成可安全完成。
10. 初始 `1.1.13` 不伪造不存在的旧 self-host release；兼容声明只来自真正发布和演练过的版本。
11. 普通生命周期要求配置版本与 current release 精确一致；失败 upgrade/rollback 的受控中间态只允许 `rollback` 进入，
    且仍必须由 strict marker 与匹配的 upgrade report 证明，不能把该例外扩展到 start/status/backup。
12. Upgrade/rollback 最多扫描 1024 个 report-directory 项与累计 64 MiB report；逐份校验且只保留一个匹配候选，
    项数、字节或内容超限返回 `SELF_HOST_UPGRADE_STATE_INVALID`，不从被截断的 report 集合选择 rollback 依据。
13. Upgrade/rollback 的 completed report 必须先于 marker 清理持久化；marker unlink 后父目录同步失败时原子重建原
    marker、停应用并写 failed report。此故障返回 `SELF_HOST_LIFECYCLE_MARKER_CLEAR_FAILED`，普通 `start` 仍被阻断。
14. Upgrade/rollback 只从 `composeContext` 已完成大小、权限、schema、data-root 与 release binding 校验的 config snapshot
    生成原子替换内容；变更阶段不按路径二次读取 `.env.selfhost`，并在重新校验后同步替换实例配置与本次命令的私有 Compose env
    快照。Docker 始终读取快照路径，避免校验—使用时间窗口。
15. Upgrade marker 与 report history 均通过单一已验证句柄有界读取；累计预算消费的是实际完成校验的字节，读取期间发生身份、
    长度或时间戳变化时返回 `SELF_HOST_UPGRADE_STATE_INVALID`，不能用替换后的同长度文件作为 rollback 依据。
16. Upgrade 的 release evidence 先复制到 32 MiB 单文件、512 MiB 累计和冻结文件数约束下的随机私有快照；checksum hashing、
    Cosign 与 evidence 语义校验只读取该快照。Bundle 外层首次解析的 release/bundle manifest 和配置模板原始字节摘要还必须
    命中同一签名 inventory，不能在验证阶段把来源目录切换为另一组字节。
17. Upgrade/rollback、其内部自动 backup 与所有其他实际 mutation 受同一个实例级 operation lock 保护；锁由外层 CLI 持有到
    结果完成，不在内部 backup 递归获取。并发命令不能在 marker 写入前的备份窗口交错 quiesce/resume 或切换配置。
18. Upgrade/rollback failure containment 的 application stop 必须检查 Docker 返回值；stop 失败作为
    `SELF_HOST_STOP_FAILED` secondary failure 与 audit action 保留。若 required failed report 写入失败并成为顶层
    `SELF_HOST_UPGRADE_REPORT_FAILED`，此前的升级或回滚错误仍以去重后的 secondary failure 保留。

## 当前 blocker

`B-SH8B-001`：当前 host 没有 Docker/Podman，不能拉取正式多架构 digest、运行真实 PostgreSQL migration、验证
Cosign/registry 路径或执行 application rollback。

`B-SH8B-002`：`1.1.13` 是第一份 self-host v1 release policy，仓库中不存在可诚实声明为 supported source 的旧
self-host release artifact。旧版 → 当前版门禁只能在后续真实 release 产生并保留旧 image/evidence 后关闭；不能用
临时改版本号伪造兼容证据。2026-10-19 通过已授权 SSH 对 `origin` 执行只读 tag 查询，命令成功但返回零条 tag ref，确认远端
当前也不存在可作为该演练起点的正式版本标签。

因此 SH8-B 的代码、schema、策略和 fault injection 已实现，但 SH8 总退出门禁仍未通过。

## 已执行验证

- `node --test scripts/selfhost/migration-policy.test.mjs scripts/selfhost/create-image-release-manifest.test.mjs scripts/selfhost/release-artifact.test.mjs scripts/selfhost/upgrade-plan.test.mjs scripts/selfhost/management-core.test.mjs`：以当前 revision 的 CI 汇总为准（本地最新完整运行全部通过）；
- `node scripts/selfhost/verify-image-workflow.mjs`：10 个 pinned action、release inventory blob signature 控制通过；
- `pnpm test:selfhost-image-supply-chain`：以当前 revision 的 CI 汇总为准（本地最新完整运行全部通过）；
- `pnpm selfhost:compose-contract`：6 个 required service、1 个 optional profile 通过；
- `pnpm validate:deployment-config`：288 个 contract key、284 个 runtime key 一致；
- `node scripts/precommit-deployment-config.mjs`：通过；
- `pnpm selfhost:image-supply-chain`：3 个镜像角色、2 个架构、10 个 pinned action 通过；
- `pnpm selfhost:inventory`：inventory 已重建；
- `git ls-remote --tags origin`：exit 0，返回零条 tag ref；`B-SH8B-002` 保持成立；
- `pnpm selfhost:compose-smoke -- --mode=source`：按设计以 exit 77 / `B-SH8A-001` 跳过。

## 阶段判断

Upgrade/rollback 的机器契约、认证边界、自动备份、failure containment 与 application-only rollback 已具备；由于
两个 blocker，不能宣称完成 SH8 退出门禁，也不能将 self-host v1 总体目标标记完成。

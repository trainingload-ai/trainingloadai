# SH8-A 备份与恢复证据

日期：2026-10-17

revision：本阶段提交生成后以 git revision 为准。

## 交付映射

| 门禁                | 实现/证据                                                                   | 状态                                        |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| versioned manifest  | backup manifest v1、restore report v1、逐文件 SHA-256                       | schema/artifact 测试通过                    |
| 一致性备份          | application quiesce + streaming custom pg_dump + UID-safe uploads copy      | mocked lifecycle 通过，真实 Docker 阻塞     |
| secret boundary     | non-secret allowlist、exact secret value 排除、name-only references         | tamper/secret 测试通过                      |
| clean restore       | exact release/schema、空 target、disk check、streaming pg_restore           | mocked lifecycle 通过，真实 Docker 阻塞     |
| 恢复验证            | migration ID/checksum、core count、uploads checksum、full readiness         | mocked lifecycle 通过，真实 core smoke 阻塞 |
| failure containment | pre-mutation marker、durable clear/re-arm、stop、failed report、start block | fault injection 测试通过                    |
| dry-run             | 无 stop/up/run/stream/bundle/target write；只保留 operation record          | 调用轨迹测试通过                            |
| real drill entry    | 随机隔离 project 的 login/activity/file clean-restore smoke                 | 可执行入口完成；当前 host 因 Docker 阻塞    |

## 不变量

1. 未通过完整 checksum 验证的 `.partial-*` 目录不能发布为 backup。
2. Backup 不复制 `.env.selfhost`、bootstrap token、cache、diagnostics 或 TLS private state。
3. `pg_dump`/`pg_restore` 通过 file descriptor streaming，不把大型或 binary payload 放入 Node string/buffer。
4. Restore 不覆盖已有 container 或权威数据，不自动放宽为 cross-version restore。
5. Restore mutation 前 marker 必须先落盘；completed report 先于 marker 删除持久化。marker 删除后的父目录同步失败时必须
   原子重建原 marker、停服务并记录 failed report，不能留下可被普通 `start` 绕过的失败状态。
6. 成功必须同时满足 DB migration/core-count 等价、uploads checksum 和 Compose readiness。
7. Backup quiesce 失败也会走 service resume；未发布 staging 与 lock 被清理。
8. 每个实例使用经过校验的 `SELF_HOST_PROJECT_NAME`；clean target 与源实例不共享 Compose namespace。
9. Backup/restore 的 portable tree 对文件数、目录数、深度和 metadata 字节数都有冻结上限；遍历使用有界目录读取，
   backup 在 quiesce 前先从容器内流式预检，复制后的 checksum 生成与验证共享同一安全边界，超限不发布、不恢复。
10. Portable tree 与 checksum inventory 拒绝大小写不敏感、Unicode NFKC 等价和文件/目录结构冲突；跨平台恢复不会因宿主
    文件系统折叠路径而静默覆盖另一份已校验内容。
11. Backup metadata、checksum inventory 与逐文件 SHA-256 均绑定单一已打开的普通文件句柄；device/inode/size/mtime/ctime
    在读取前后必须一致，symlink、短读、尾随增长或同长度原地改写均使验证失败。
12. Restore 不在预检后重新打开外部 bundle 作为恢复输入；它先在 target 私有 `operations` 目录生成文件数、目录数、深度、
    单文件和累计字节均有界的稳定快照，再次验证完整 bundle，并与首次 backup ID、文件数、总字节数和 checksum inventory
    绑定。`pg_restore` 与 uploads copy 只使用该快照；快照必须在完整服务启动前删除并同步父目录，清理失败保留 marker。
13. Backup/restore 与其他实际 mutation 共用实例级 operation lock；即使 backup output 名称不同，也不能并发 stop/dump/copy/
    resume，或在 upgrade/restore 期间提前恢复 application writers。冲突在任何 Docker 调用前以稳定 exit 6 失败。
14. Backup 收尾验证 `.lock` 仍是当前 operation 的稳定普通文件，再 unlink 并同步 backups 目录；staging、lock 或 durable sync
    清理失败返回 `SELF_HOST_BACKUP_CLEANUP_FAILED`。若已有主错误，主错误保持不变，清理失败作为结构化 secondary failure 与
    audit action 保留。preflight 后发生同名路径竞态时只清理本 operation 已确认创建的 staging/lock，未知占用者路径保持原样并
    返回 `SELF_HOST_BACKUP_ALREADY_EXISTS`。
15. Restore 的 containment stop 必须检查 Docker 返回值；stop 失败以 `SELF_HOST_STOP_FAILED` 进入结构化 secondary failure。
    若 snapshot cleanup、marker re-arm 或 failed report 写入成为新的顶层错误，此前的恢复错误仍以去重后的 secondary failure
    与 audit action 保留，不能被清理或报告故障覆盖。
16. `pg_dump` / `pg_restore` 流式 runner 在子进程结束后逐个关闭全部输入、输出句柄；任一 close 失败都使操作失败。若子进程
    已失败，聚合错误同时保留退出状态或原始 spawn 错误与全部 close 错误，不能用文件收尾故障覆盖数据库命令失败。

## 当前 blocker

`B-SH8A-001`：当前 host 没有 Docker/Podman，不能执行真实 `pg_dump → clean directory → pg_restore → login/activity/file`
演练，也不能验证 rootful/rootless Docker 与 amd64/arm64 的真实 ownership 行为。mocked runner 只证明控制流和
failure policy，不替代退出门禁。

## 已执行验证

- 全部 `scripts/selfhost/*.test.mjs`：以当前 revision 的 CI 汇总为准（本地最新完整运行全部通过）；
- `pnpm selfhost:compose-contract`：6 个 required service、1 个 optional profile 通过；
- `pnpm validate:deployment-config`：288 个 contract key、284 个 runtime key 一致；
- `node scripts/precommit-deployment-config.mjs`：通过；
- `pnpm selfhost:image-supply-chain`：3 个镜像角色、2 个架构、10 个 pinned action 通过；
- `pnpm selfhost:compose-smoke -- --mode=source`：以 exit 77 / `B-SH8A-001` 跳过。

## 阶段判断

备份/恢复代码、schema、静态安全边界和 fault injection 已实现；upgrade/rollback 的后续实现与独立 blocker 见
`SH8-upgrade-rollback-evidence.zh.md`。在 Docker-capable clean-room runner 执行真实恢复和升级/回滚演练前，仍不能
关闭 SH8 阶段门禁。

# SH0 / SH1 evidence log

- Worktree: independent Codex worktree
- Branch: `codex/selfhost-productization`
- Baseline revision: `ec1d4687488401f8a825aff0fce064cbd5a30143`
- Date: 2026-10-17
- Scope: self-host only

## Baseline failures captured before fixes

| ID          | Command / observation                             | Result                                                                           | Meaning                                                                    |
| ----------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `B-SH0-001` | `docker --version`                                | exit 127, Docker CLI unavailable on host                                         | 容器 recreate 证据不能在当前 host 伪造，后续由 CI / clean-room runner 执行 |
| `B-SH1-001` | targeted Jest: config contract                    | `LOCAL_STORAGE_PATH` absent                                                      | 应用默认路径与 `/data/uploads` 契约不一致                                  |
| `B-SH1-002` | targeted Jest: sensor metadata                    | expected `LOCAL`, received `R2`                                                  | 无显式配置时数据库会记录错误 provider                                      |
| `B-SH1-003` | targeted Jest: custom keys                        | `../escape.bin`、absolute 和 Windows traversal 均成功                            | 本地 storage 可写出 root                                                   |
| `B-SH1-004` | production Compose inspection                     | backend volume mounted at `/var/lib/backend/data`，应用默认 `./uploads`          | recreate 后权威文件可能留在容器层                                          |
| `B-SH2-001` | minimal production env, no commercial credentials | startup exits 1 at `ActivityAiReviewService`; `OpenAIError: Missing credentials` | AI 是启动期云强依赖                                                        |
| `B-SH2-002` | same startup                                      | Langfuse SDK starts and emits missing exporter/key warnings                      | 遥测没有默认关闭                                                           |

测试基础设施第一次运行还暴露 worktree 未安装依赖、Prisma client 未生成；依赖按 frozen lockfile 安装并生成
client 后才记录上表行为，避免把基础设施缺失误判为产品行为。

## Current verification

```text
pnpm --dir server test -- --runInBand \
  src/config/spec/self-host-storage-config.spec.ts \
  src/sensor/spec/sensor-data.service.spec.ts \
  src/storage/spec/storage.service.spec.ts \
  src/storage/spec/storage-path.spec.ts

Test Suites: 4 passed, 4 total
Tests:       44 passed, 44 total

pnpm --dir server test -- --runInBand \
  src/storage/spec/storage-error.spec.ts \
  src/filters/spec/business-exception.filter.spec.ts \
  src/commands/reconcile-local-storage-metadata.command.spec.ts

Test Suites: 3 passed, 3 total
Tests:       23 passed, 23 total

pnpm --dir server test -- --runInBand \
  src/storage/spec/storage-path.spec.ts \
  src/storage/spec/storage.service.spec.ts

Test Suites: 2 passed, 2 total
Tests:       30 passed, 30 total
```

```text
ESLINT_USE_FLAT_CONFIG=false pnpm --dir server exec eslint <changed server files>
0 errors
```

```text
NODE_OPTIONS=--max-old-space-size=8192 pnpm --dir server exec tsc --noEmit --pretty false
exit 0

NODE_OPTIONS=--max-old-space-size=8192 pnpm --dir server build
exit 0

pnpm selfhost:inventory:check
self-host inventory: PASS (526 variables, 259 URLs, 241 write sites)
```

2026-10-18 复核时重新生成了当前 worktree inventory，并把无写入的 `--check` 门禁接入每周文档 CI；扫描范围同时覆盖
apps/server/client/docs 的 `src` 运行时代码及三个镜像、Next 配置、docs proxy/security/Sentry 根配置。任何运行时代码导致的变量、
URL literal、写入点或行号漂移都会使 CI 失败，直到机器清单一并更新。分类回归同时固定 telemetry、weather、maps、AI、
mail、auth 与 storage 的代表性环境变量和外联域名，避免规则顺序把 Google Analytics 或 WeatherKit 误归为认证能力。

## Stage gates

| Gate                                       | Status            | Evidence / blocker                                                                           |
| ------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------- |
| SH0 inventory and owner classification     | PASS              | 机器 inventory + capability matrix + ADR + schema；生成器不读取真实 `.env`，定期 CI 拒绝漂移 |
| SH1 LOCAL defaults and metadata semantics  | PASS              | config + sensor regression tests                                                             |
| SH1 path boundary and atomic publication   | PASS              | traversal、symlink、multipart、R2 durability tests                                           |
| SH1 R2 absent does not initialize client   | PASS              | constructor regression test                                                                  |
| SH1 permission / ENOSPC stable diagnostics | PASS              | `EACCES`/`EROFS`/`ENOSPC`/`EDQUOT` fault injection + 稳定业务码                              |
| SH1 DB metadata reconcile                  | PASS              | 默认 dry-run；仅 size + MD5 匹配且 CAS 仍为 R2 的记录可改为 LOCAL                            |
| SH1 container recreate / host restart      | BLOCKED ON RUNNER | Compose contract 与 acceptance recreate 路径已实现；当前 host 无 Docker，仍缺真实执行证据    |
| SH1 public/private local namespace         | PASS              | 新写入物理分区；static root 仅 `/data/uploads/public`；旧 key 内部兼容读取                   |

因此本证据包允许继续完善 SH1，不把阶段标为完成，也不提前声称无云核心旅程通过。

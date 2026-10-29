# Self-host v1 工程发行复盘

本复盘记录从空白自托管基线到 v1 RC 门禁的工程决策。它不替代某次真实候选的 acceptance reports；具体候选是否可发布只由
签名 `release-candidate-manifest.json` 与 reviewer 决策确定。

## 达成的结构性结果

1. 产品模式从“有 Compose 文件”收敛为 Core Local、Connected 与 Extended 三个 capability contract；Core Local 不再把
   Mapbox、R2、SMTP、AI、支付或遥测凭据当作启动前置。
2. PostgreSQL、uploads、cache、elevation、gateway 和 lifecycle state 的权威边界被版本化；备份只包含可恢复的数据库、
   uploads 和非 secret 配置，恢复必须进入干净 target。
3. 镜像、Compose、owner bootstrap、管理 CLI、升级/回滚、doctor、diagnostics、installer 与 Agent 指令共用机器契约，
   Bash/PowerShell wrapper 不复制业务逻辑。
4. 发布供应链固定双架构 digest、SBOM、provenance、Cosign identity、可复现 archive 与内外两层 checksum signature。
   每个平台的 fixable critical/high CVE 扫描 SARIF 也进入相同的签名 inventory。
5. 四平台 × 两模式的验收从文档清单变为 fail-closed workflow；任一 cell 缺失、失败或绑定到另一 archive 时，不产生 aggregate gate。
6. RC 只聚合已经认证的 release 与 acceptance；checkout 前先验证输入，最终 artifact 再由独立 workflow identity 签名，
   上传前与下载后均用同一完整验证器重验嵌套证据链。

## 关键取舍

- 选择单节点 Compose，而不是在 v1 内构建 HA orchestrator。这样能把数据正确性、恢复和升级边界做实，同时明确接受停机升级。
- 选择数据库 forward-only 与声明式 application rollback，而不是承诺不可验证的 database downgrade。
- 选择冻结 required v1 runtime baseline 并允许签名 additive files，避免旧 controller 因新增文档而拒绝升级，也不允许删除
  旧版必需文件。
- 选择显式 operator attestation 记录 Codex clean-room 和 issue review，而不是把无法自动观察的流程伪装成 CI 已验证事实。
- 选择保留阻塞码与 NO-GO 状态，而不是用 mock、静态测试或本机无 Docker 的 skip 代替真实平台证据。

## 发现并修正的问题

- 早期 bundle verifier 要求与当前 inventory 完全相等，会让旧 CLI 拒绝带新增文件的合法新版；已改为 v1 required baseline 加
  signed additions。
- Upgrade 不能依赖旧安装目录被原地覆盖；现在先用 source controller 做兼容认证，再用 target signed bundle 作为升级后
  management controller。
- 验收 runner 的网络恢复、数据库故障 doctor 退出码、端口预留和 provider timeout fixture 曾存在弱断言；均补为可失败的
  fault test。
- Release archive checksum 原先缺少独立外层签名；现在 archive 解压前先认证 checksum identity，再验证 digest，内层 bundle
  仍独立认证。
- 清理逻辑曾有删除 volume 的风险；验收与 smoke 均只删除已校验的 test-owned 临时根，不调用 `down -v`/`--volumes`。
- RC 最初只接受外部证据 hash/reference，却由 finalizer 直接写出 `status=passed`；现已改为版本化 release attestation，强制
  clean target、签名 bundle-only、主机重启后数据复验、operator owner bootstrap 和 P0/P1/blocker=0，并纳入 RC 签名 inventory。
- RC 最初只有底层 Cosign/checksum 手工步骤，容易出现“外层已验、内层漏验”；现在提供单命令完整验证器，并在 artifact 上传前
  强制运行同一路径，逐层重验 release、acceptance、attestation、文档与契约绑定。
- Release attestation 最初要求 operator 手工 Base64，且证据引用可能携带 query token；现在由受支持 CLI 验证、扫描并生成
  canonical workflow 输入，userinfo、query 参数和常见 secret pattern 均 fail-closed。
- 初始 inventory 未覆盖 docs 运行时代码，因而漏掉固定 Sentry DSN、错误 self-host marker 以及预构建镜像中冻结的浏览器
  API 地址；现已扩大机器扫描范围，docs 遥测默认关闭并由 CSP 双重阻断，交互工具改走仅允许 `/public/*` 的运行时同源代理。
- inventory 的通用关键字规则曾把 Google Analytics 与 WeatherKit 误归为 auth，并把 feature-specific worker 统一归为 workers；
  现按真实 capability 优先分类，并用代表性环境变量与外联域名回归固定规则顺序。
- 首轮 lifecycle 对照发现最小命令面缺少 `uninstall`；现提供默认保留数据的安全卸载，只有精确确认专用 data root 后才允许删除，
  并在 `ps` 为空时仍执行无 volume flag 的 `down --remove-orphans`，避免孤儿网络。
- Compose 数据契约曾漏列 docs cache，且 verifier 只检查“已声明 mount 是否存在”，不能发现额外持久 bind mount；现双向校验所有
  application persistent mount，docs cache 与 transient operations 边界也进入 v1 freeze。
- 镜像门禁最初只有 credential/layer scanner，没有覆盖计划要求的已知漏洞扫描；现增加只读、无 OIDC 的 Docker Scout 3×2 gate，
  阳性、缺失或 checksum/digest 漂移的 SARIF 均不能进入 release/RC；SARIF 语义解析和摘要也改为消费同一次有界稳定读取，避免
  “检查 A、记录 B”。
- 验收 runner 曾在认证 release 解包后使用无界递归复制，RC evidence 复制也只限制了每次复制而未绑定树扫描时的精确文件大小；
  现统一为文件数、目录数、深度、单文件和累计字节有界的 regular-tree snapshot，逐文件稳定复制后再核对完整树形与权限。
- Restore 曾在 bundle checksum 验证后让 `pg_restore` 和 uploads helper 按外部原路径重新读取，存在“校验 A、恢复 B”的时序窗口；
  现先生成 target-owned 私有有界快照并复验首次 checksum identity，所有恢复输入只来自该快照，且在 full stack 启动前强制清理。
- Release evidence 曾先按来源目录 checksum 校验，再把同一路径交给 Cosign 和后续语义解析，无法证明三步消费同一组字节；现将
  完整签名集合稳定复制到随机私有有界快照，hashing、Cosign 和语义校验统一在快照内完成，bundle 外层解析也按摘要反向绑定；
  同时冻结验签前 checksum 原始字节，Cosign 返回后重验载荷、树和摘要，避免验签进程期间把整组 evidence 与 checksum 一起替换。
- Acceptance/RC release 解包曾在外层验签前计算 archive 摘要，却没有在 Cosign 返回后重验；现冻结 checksum 原始字节与 archive
  摘要，并在任何 `tar` 操作前双重核对，阻断“验签 A、解包 B”的时序窗口。
- Diagnostics 发布后曾分别按路径执行 JSON 校验、文件大小读取和 SHA-256，返回值理论上可能对应不同字节；现要求落盘内容等于待发布
  Buffer，并用一次稳定读取同时完成复验、大小和摘要，最后复核文件身份与权限。
- RC finalizer 曾先在内部快照验证 release/acceptance，再从原始下载目录复制候选输入；虽然后置完整 verifier 会阻止上传，仍可能先
  生成并签署一个不一致候选。现把复制后的外层签名工件摘要绑定回认证快照，并重验 acceptance inventory，在候选 checksum 生成前失败。
- RC checkout 前的内联认证曾在 Cosign 返回后才读取 acceptance checksum，可能把签名验证与 checkout 决策拆到两组字节；现冻结
  验签前载荷、稳定读取并绑定 manifest Buffer，同时在全部 `tar` 检查后重验 archive，静态门禁还会编译检查 bootstrap JavaScript。
- Acceptance matrix checkout 前的内联认证曾在 archive 摘要校验后才调用 Cosign 和 `tar`，且 metadata 没有真实大小上限；现用稳定
  句柄冻结 checksum、限制 metadata、验签后复核，并在拒绝 link/special file 后再次哈希 archive，当前版与上一版执行相同门禁。
- Acceptance aggregate finalizer 曾直接在最终目录逐项写入，普通异常虽会清理，但进程中断会留下可见半成品；现统一在随机私有
  staging 中汇总，从已验证 Buffer 直接生成单项摘要，完成 manifest 与 checksum 后才以同目录 rename 原子发布。
- Release bundle 与 RC finalizer 曾只在组装开始前检查最终目录不存在；若组装期间出现同名空目录，POSIX rename 可替换该目录。
  现两者都在最终 rename 前再次 fail-closed，并只清理各自随机 staging，不覆盖或删除竞争创建的目标。
- 供应链 JSON、checksum、release preparation 与 acceptance runner 证据曾混用直接覆盖、exclusive `writeFile` 和非原子增量更新；
  现统一为 `fsync` 后的 exclusive hard-link publish 或 atomic replace，并把多文件 release manifest 作为最后发布的就绪标记。
- Acceptance/RC preparer 曾在 Cosign 后复核一次 archive，却未覆盖后续 tar 清单检查与解包窗口；现检查完成后和解包完成后各自重算
  外层摘要，在执行内层代码前拒绝 staging archive 漂移。
- 内层 release verifier 曾只在私有快照内完成 Cosign 与 checksum 复验，Cosign 回调期间改写实际解包目录仍可能让后续 installer
  执行“验签 A、源目录 B”；现同时冻结两份签名工件，并在返回前重验实际源的完整签名子树、摘要与权限。
- 管理 CLI 曾只有 per-backup-name lock 与 restore/upgrade marker；不同名称的 backup 或 backup 与 upgrade 可以交错
  quiesce/resume。现 10 个实际 mutation 共用实例级原子锁，active/畸形锁 fail closed，死亡 PID 的陈旧锁经过两小时宽限与
  二次字节绑定后，再由固定 strict record 绑定回收者身份与旧锁摘要、仲裁唯一回收者并原子替换，消除回收期间的锁路径空窗；
  死亡或超过 15 分钟的回收者可被 Doctor 明确识别。正常释放也改用 exclusive hard-link snapshot，避免 rename 覆盖预占取证文件；
  只读取证命令仍可运行。

## 尚需真实环境关闭的门禁

仓库内实现、合约与合成 fault tests 不能替代以下外部事实：

- 同一签名 archive 在 Ubuntu amd64、Linux arm64、macOS Apple Silicon 和 Windows 11/WSL2 的 8 格真实运行；
- 一个诚实存在的 prior signed self-host release 用于 upgrade 与 declared rollback；
- Codex 在 clean room 中只依据 bundle 内 `AGENTS.md` 和文档完成一次部署；
- release reviewer 对全部报告、已知限制和 issue register 的最终 P0/P1=0 结论。

这些证据缺失时，正确决策是 NO-GO；RC workflow 会因缺少 aggregate gate 或显式 attestation 而无法产出候选。

## 后续改进

- 稳定发行后按 restore drill 与真实容量数据调整资源阈值，不用单次实验外推长期容量。
- 每个后续 release 都积累真实 source/target compatibility，而不是把“两个 minor 窗口”误读为自动兼容。
- 定期审阅 pinned base image、PostgreSQL/Caddy security update、GitHub Action SHA 与 Cosign 版本。
- 只有 v1 完成定义全部有签名证据后，才重新评估拆仓；拆仓不属于当前 self-host 发布范围。

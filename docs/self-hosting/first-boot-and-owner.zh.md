# Self-host 首次启动、owner 与本机恢复

本文定义 self-host v1 的实例所有权边界。owner 不是通过“第一个注册用户”推断：默认 loopback 部署由本机同源首次启动页
创建；LAN/公网部署由一次性 bootstrap token 明确创建。实例进入 `READY` 后，该转换不可逆，重启不会重新开放接管入口。

## 1. 状态机

数据库只有一个 `t_self_host_instance` singleton：

```text
不存在记录
    │ 首次 server 启动
    ▼
PENDING + token hash + expires_at
    │ loopback 同源页面创建 local owner
    │ 或持有本机 token 创建 credential owner
    ▼
READY + owner_user_id + initialized_at
```

数据库约束同时保证：

- `id` 只能为 `1`；
- `PENDING` 必须有 token hash 和过期时间，且不能有 owner；
- `READY` 必须有 owner 和初始化时间，且 token 字段必须为空；
- owner 外键使用 `ON DELETE RESTRICT`，不能把已初始化实例删除成无主状态；
- PostgreSQL advisory transaction lock 串行化 token 轮换、owner claim 与本机恢复。

原始 token 是 256-bit 随机值，只写入 `data/operations/bootstrap-token`；数据库只保存 SHA-256 digest，
普通日志和 HTTP status 都不返回 token。文件目录为 `0700`、文件为 `0600`，只有 server 容器挂载该目录。
默认有效期 24 小时，可用 `SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS` 调整为 600–604800 秒。未初始化且
token 过期时，下一次启动或 status 检查会原子轮换文件与 digest。
如果 operations 目录或 token 文件变得可被其他用户读取，server 不会继续复用旧 token，而会先恢复
`0700/0600` 权限并轮换 token。

## 2. 创建首个 owner

### 2.1 默认 loopback 模式

`SELF_HOST_HTTP_BIND=127.0.0.1` 且 public origin 使用 `localhost`/loopback 时，首次启动页只收集显示用户名。
`POST /api/self-host/bootstrap/local-owner` 只接受 `name`，单事务创建无 credential account 的 Owner，随后 Client 调用
`POST /auth/self-host/local-owner`，由 Better Auth 创建普通数据库 session 并签发正常的 HttpOnly cookie。这里没有空密码，
也没有绕过业务接口的伪 session。

两个 endpoint 都要求配置仍为 loopback、`Origin` 与 public origin 精确相等、`Sec-Fetch-Site=same-origin`，并且
`x-trainingload-client-ip` 是 Caddy/BFF 覆盖写入的 loopback 地址。浏览器自带的同名 IP header 会被网关/BFF 丢弃。
实例进入 `READY` 后，本机登录页可为 singleton Owner 重新建立 session，并继续走既有 auth complete/onboarding 路径。

### 2.2 LAN/公网凭证模式

非 loopback bind/origin 会关闭上述无凭证 endpoint。先完成 Compose 启动并确认 readiness，再在 release 目录通过统一管理
CLI 执行下列本机流程。密码只经 stdin
传给容器，不会出现在命令参数、Compose 环境、CLI 结果、operation record 或正常日志中：

```bash
read -r -p "Owner email: " owner_email
read -r -p "Owner display name: " owner_name
./self-host owner-bootstrap --email "$owner_email" --name "$owner_name" --dry-run --json
read -r -s -p "Owner password: " owner_password
printf '\n'
printf '%s\n' "$owner_password" | ./self-host owner-bootstrap --email "$owner_email" --name "$owner_name" --json
unset owner_password
```

PowerShell 使用 `.\self-host.ps1 owner-bootstrap --email $ownerEmail --name $ownerName ...`；完整的 `SecureString`
输入和清理示例见 release 根目录 `SELF_HOSTING.md`。

密码必须为 8–20 个非空白字符，并至少包含一个字母和一个数字。成功输出不含 secret 的 JSON，token 文件
随即删除。再次运行返回 `SELF_HOST_ALREADY_INITIALIZED`；即使手工重新创建 token 文件、重启容器或重跑
permissions job，数据库 `READY` 状态仍会拒绝接管。

自动化也可调用：

- `GET /api/self-host/bootstrap/status`：只返回 `PENDING/READY`、access mode、是否可用浏览器初始化、过期时间和邮件恢复能力；
- `POST /api/self-host/bootstrap/owner`：接受 `token/email/password/name`，且只在 `PENDING` 有效。
- `GET /api/self-host/session/policy`：要求真实浏览器 session，返回当前用户是否为 Owner，以及当前会话能否退出或删除账户。

这两个 endpoint 仅在 `SELF_HOST_MODE` 下存在。claim 受全局 public throttle、常量时间 digest 比较、
advisory lock 和数据库单事务保护。人工流程使用 `owner-bootstrap`，由管理 CLI 隔离宿主 Compose 环境并调用容器内命令，
避免把 token 或密码交给 shell 参数、浏览器扩展或远程日志系统。

## 3. 无 SMTP 密码恢复与网络模式升级

`MAIL_PROVIDER=none` 时，登录仍可用，但注册、邮件验证码和邮件重置入口会被 capability/UI 关闭；Better Auth
对应写 endpoint 也会在创建 verification state 前返回 `SELF_HOST_MAIL_DISABLED`。owner 忘记密码时，在
release 主机通过统一管理 CLI 执行恢复。先执行同参数 dry-run：

```bash
owner_email='owner@example.com'
./self-host owner-recovery --email "$owner_email" --dry-run --json
read -r -s -p "New owner password: " OWNER_PASSWORD
printf '\n'
printf '%s\n' "$OWNER_PASSWORD" | ./self-host owner-recovery --email "$owner_email" --json
unset OWNER_PASSWORD
```

管理 CLI 不读取或缓存密码，而是把 stdin 直接继承给容器内 recovery command。对于已有凭证的 Owner，恢复只接受数据库
singleton 当前指向的 owner email；它使用 Better Auth 同一 password KDF 更新 credential，并在同一事务中撤销该 owner 的
全部 session。对于 loopback 页面创建、尚无用户可见邮箱的 Owner，第一次 `owner-recovery` 允许 operator 指定一个未被占用的
真实邮箱，同时创建 credential；这也是把实例切换到 LAN/公网之前的必需步骤。它不能修改普通用户，也不会生成公开恢复链接。
配置完整 SMTP 后，runtime capability 会重新显示邮件注册和恢复入口。

## 4. 网络与 cookie 安全

- production self-host 只信任 Express `loopback`、`linklocal`、`uniquelocal` 代理范围，不再按固定 hop 数信任
  任意直接客户端写入的 forwarded headers；默认 Caddy bridge 属于可信私网。
- self-host cookie 始终 host-only；HTTPS 使用 `Secure`，loopback/LAN HTTP quickstart 使用非 Secure cookie。
- app/api public URL 必须同源，且 `TRUSTED_ORIGINS` 必须包含该 origin。
- `127.0.0.1` 默认 bind 配合 `http://localhost:43210`；非 loopback bind 不能继续声明 localhost public origin。
- 私网 IP、`.local` 与 `.home.arpa` 可以使用 LAN HTTP，但启动时强警告凭据明文传输。
- 公网 hostname 默认强制 HTTPS。只有显式设置 `SELF_HOST_ALLOW_INSECURE_HTTP=true` 才允许危险例外，并持续
  输出强警告。
- HTTPS public origin 要求 `SELF_HOST_GATEWAY_ADDRESS` 使用完全相同的 HTTPS origin，防止 Caddy 为错误域名
  申请证书或实际只监听 HTTP。

## 5. 默认关闭的管理面

- `/operations/**` 在 self-host 未显式配置 console 和独立高熵 token 时返回 404；
- `/mail/internal/**` 受 `mail` capability 和 HMAC 双重保护，Core Local 默认关闭；
- billing webhook replay 受 `billing` capability 保护，并只接受独立的
  `BILLING_INTERNAL_API_SECRET`，不再回退到 session/auth secret；
- managed daily admin report 在 self-host 默认不调度；即使显式设置
  `ADMIN_DAILY_USER_STATS_ENABLED=true`，也必须同时提供收件人，不能回退到 managed 默认地址；
- owner 账户删除返回 `SELF_HOST_OWNER_DELETION_REQUIRES_TRANSFER`，当前 v1 不提供隐式 owner 转移。

`local-owner` 是受可信本机访问策略保护的自动会话，不是普通账号密码会话。Client 在此模式下不展示退出登录和删除账户入口：
退出后下一次可信本机请求仍会恢复同一个 Owner，会造成“退出后又自动登录”的假交互；删除 Owner 则会让仍处于 `READY` 的实例失去
所有者。重新进入首次设置不是普通账户删除的副作用。若未来支持清空后重建，应提供独立的“重置本地实例”生命周期操作，明确处理数据清理、
`SelfHostInstance` 状态和 bootstrap 凭据，并通过管理入口执行。

凭证模式下退出登录仍然可用。Client 通过认证后的 session policy 区分 Owner 与普通用户：Owner 不展示删除入口，普通用户可以使用既有
账户删除流程；Server 的 `SELF_HOST_OWNER_DELETION_REQUIRES_TRANSFER` 检查继续作为不可绕过的最终保护。

## 6. 稳定错误码

| code                                         | 含义                                     |
| -------------------------------------------- | ---------------------------------------- |
| `SELF_HOST_ONLY`                             | endpoint/command 不在 self-host runtime  |
| `SELF_HOST_ALREADY_INITIALIZED`              | 实例已进入 `READY`，不能再次 claim       |
| `SELF_HOST_BOOTSTRAP_TOKEN_INVALID`          | token 不匹配                             |
| `SELF_HOST_BOOTSTRAP_TOKEN_EXPIRED`          | token 已过期，需轮换后重试               |
| `SELF_HOST_BOOTSTRAP_EMAIL_IN_USE`           | owner email 已被现有账户使用             |
| `SELF_HOST_BOOTSTRAP_INPUT_INVALID`          | email/name/password/token 格式不符合契约 |
| `SELF_HOST_LOCAL_ACCESS_DISABLED`            | 当前 bind/origin 不是 loopback           |
| `SELF_HOST_LOCAL_ACCESS_FORBIDDEN`           | 请求不是可信本机同源浏览器请求           |
| `SELF_HOST_OWNER_MISMATCH`                   | 本机恢复指定的 email 不是当前 owner      |
| `SELF_HOST_RECOVERY_EMAIL_IN_USE`            | 升级本机 Owner 时指定邮箱已被占用        |
| `SELF_HOST_RECOVERY_PASSWORD_INVALID`        | 新密码不符合统一 password policy         |
| `SELF_HOST_MAIL_DISABLED`                    | 未配置 SMTP 的邮件注册或恢复请求         |
| `SELF_HOST_OWNER_DELETION_REQUIRES_TRANSFER` | 删除 owner 会使实例无主，操作被拒绝      |

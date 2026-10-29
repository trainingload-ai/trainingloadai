# Web Client 认证端到端（E2E）测试规范

## 目标

本流程验证仓库 `client`（Next.js Web Client）的真实邮箱注册和登录链路，不将页面渲染、接口单测或 mobile App 测试替代为 Client E2E。每个业务用例同时校验浏览器 UI、真实本地 API 和 PostgreSQL 状态。

## 模块结构

| 文件 | 职责 |
| --- | --- |
| `e2e/auth/auth-e2e-support.ts` | 唯一邮箱、随机密码、fixture、OTP、数据库状态、页面公共操作 |
| `e2e/auth/login.spec.ts` | 登录成功、密码错误和限流恢复提示 |
| `e2e/auth/registration.spec.ts` | 注册页、正确注册及注册错误路径 |
| `playwright.config.ts` | Client auth Chromium 项目、Web Server 和共享 bridge 编排 |
| `../scripts/auth-e2e-fixture-bridge.mjs` | Web Client 与 mobile 共用的 localhost-only fixture/OTP/DB bridge |

## 当前自动化矩阵

| ID | 场景 | UI 预期 | 数据库预期 |
| --- | --- | --- | --- |
| CLIENT-LOGIN-001 | 已有账号正确登录 | 最终进入 `/zh/onboarding` | user/account 唯一，session 增加 |
| CLIENT-LOGIN-002 | 密码错误 | 显示“邮箱或密码错误”，停留登录页 | session 不增加 |
| CLIENT-LOGIN-SEC-001 | 10 秒窗口内前 3 次登录失败后再次提交 | 显示“尝试次数过多”，停留登录页 | 返回 429，session 不增加 |
| CLIENT-REG-001 | 注册页结构 | 邮箱、OTP、密码、确认密码、条款、发码和注册入口存在 | 不改数据 |
| CLIENT-REG-002 | 正确 OTP 注册 | 自动登录并进入 onboarding | 创建 user/account/session，OTP 被消费 |
| CLIENT-REG-ERR-001 | 错误 OTP | 显示验证码无效 | 不创建用户，attempts 加 1，OTP 保留 |
| CLIENT-REG-ERR-002 | 5 位 OTP | 浏览器端显示长度错误 | 不调用注册 API，不创建数据 |
| CLIENT-REG-ERR-003 | 两次密码不一致 | 浏览器端显示密码不匹配 | 不调用注册 API，不创建数据 |

## 环境与数据安全

- Client：`http://localhost:3002`
- API：`http://localhost:3001`
- fixture bridge：`http://127.0.0.1:3103`
- PostgreSQL 必须是 localhost。
- 测试邮箱只能匹配 `victor+client-e2e-...@trainingload.ai`。
- 密码每个用例运行时随机生成，不写入报告。
- OTP 仅由本地 bridge 从 `t_user_verifications` 读取，不写入日志或报告。
- teardown 按完整邮箱精确永久清理，不允许模糊删除基础邮箱。

## 执行命令

前置条件：本地 API 和 PostgreSQL 已启动。

```bash
E2E_DATABASE_URL='<本地 PostgreSQL URL>' \
pnpm --dir client test:e2e:auth
```

Playwright 会自动启动或复用 `client` dev server，并启动共享认证 bridge。

定向执行：

```bash
E2E_DATABASE_URL='<本地 PostgreSQL URL>' \
pnpm --dir client exec playwright test \
  --project=client-auth-chromium \
  -g 'CLIENT-LOGIN-002'
```

## 三层证据与退出标准

每个用例必须满足：

1. 浏览器可见状态、URL、错误提示与预期一致。
2. 真实本地 API 完成认证请求，没有对应 `5xx`。
3. user/account/session/verification 计数与用例预期一致。
4. 整套执行结束后所有 `victor+client-e2e-*` 数据计数为 `0`。

当前未覆盖：重复邮箱、OTP 过期和尝试上限、session 重启恢复、网络中断恢复、第三方登录、Firefox/WebKit 桌面矩阵、无障碍专项和多语言矩阵。

认证安全的 API 级并发、重放、OTP 耗尽和发码防刷由仓库级 `pnpm test:auth-security-e2e` 覆盖，不在浏览器中重复构造并发请求。

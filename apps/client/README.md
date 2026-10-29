# Trainingload.ai Client

`apps/client` 是 Trainingload.ai 的 Next.js 产品端。它承载训练首页、计划、日历、活动、智能教练、设置和 Onboarding，并通过同源 BFF 访问 Server。

## 运行与验证

在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev:selfhost
```

默认地址为 Client `http://localhost:3002`、Server `http://localhost:3001`。只调试 Client 时可运行：

```sh
pnpm --dir apps/client dev:selfhost
```

提交前至少执行与改动范围对应的检查：

```sh
pnpm --dir apps/client typecheck
pnpm --dir apps/client lint
pnpm --dir apps/client test:selfhost
pnpm design-tokens:check
pnpm messages:check
pnpm boundary:check
```

涉及布局、主题或交互时，还要在真实页面检查桌面端和相关移动端尺寸，以及浅色、暗色、键盘焦点和加载状态。

## 视觉与文案约定

产品端颜色以 `@trainingloadai/design-tokens` 和 `src/app/globals.css` 的语义 token 为准。组件表达用途，不直接绑定某个灰阶：

- 页面和正文：`bg-background`、`text-foreground`；
- 次级层级：`bg-muted`、`text-muted-foreground`；
- 容器和分隔：`bg-card`、`border-border`；
- 主操作：`bg-primary`、`text-primary-foreground`；
- 错误、警告和图表可以使用对应状态色或专用图表色。

除第三方品牌色、图表序列或明确状态含义外，不应在业务组件中新增十六进制颜色、`bg-white`、`bg-black` 或具体 `neutral` 灰阶。这样主题调整只改 token，浅色与暗色不会各自形成一套散落的颜色规则。

界面文案使用 `next-intl` message key，基线词典位于 `packages/messages/client-core/<locale>.json`。新增或修改文案时应同步所有受支持语言，并运行 `pnpm messages:check`；不要在组件中硬编码面向用户的中文或英文。

## Self-host 构建边界

`dev:selfhost` 默认设置 `NEXT_PUBLIC_SELF_HOST_MODE=core-local`；`build:selfhost` 会保留镜像构建传入的 Self-host 模式标记，未传入时同样回退到 `core-local`。两者都从 `src/deployment/` 选择 Self-host 实现。跨 package 依赖必须通过声明的 exports 使用，不能引用未公开的内部路径。

## 环境变量

自托管变量的公开契约以仓库根目录的 [`.env.example`](../../.env.example) 和 [`docs/self-hosting/inventory/environment-variables.json`](../../docs/self-hosting/inventory/environment-variables.json) 为准。

- `NEXT_PUBLIC_*` 会进入浏览器包，只能放可公开配置；
- secret 只能由 Server 或服务端 Route Handler 读取，不能使用 `NEXT_PUBLIC_*` 前缀；
- 浏览器请求统一走同源 `/api/proxy`，服务端上游地址由 `CLIENT_INTERNAL_API_URL` 等服务端配置解析；
- `NEXT_PUBLIC_SELF_HOST_MODE` 是构建边界标记，由仓库脚本设置，不是用户 secret；
- 新增或删除变量时必须同步环境契约与文档，并通过 `pnpm selfhost:inventory:check` 和 `pnpm selfhost:docs-contract`。

## 目录提示

- `src/app/[locale]`：路由与页面组合；
- `src/components`：共享产品组件；
- `src/deployment`：Self-host 部署适配层；
- `src/api`、`src/lib`：BFF、运行时能力与配置；
- `packages/messages/client-core`：多语言基线；
- `packages/design-tokens`：Web、Native 和图表 token 的唯一生成源。

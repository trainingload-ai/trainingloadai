# Trainingload.ai Docs

独立的 Next.js/Fumadocs 站点，包含公开产品文档、定价、法律内容和工具页面。不参与 Self-host Compose 或应用镜像。

在公共仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm docs:dev
pnpm docs:build
```

使用 Node.js 22、pnpm 9。生产站点按需配置 `NEXT_PUBLIC_BASE_URL`（站点 canonical URL）、`NEXT_PUBLIC_API_URL` 或 `DOCS_INTERNAL_API_URL`（工具 API）。
遥测默认不配置；启用时必须自行提供项目 ID。内部设计、Provider 配置和运营文档由私有仓库维护。

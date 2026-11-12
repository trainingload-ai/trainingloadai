# Desktop 图标

正式品牌源文件为 `apps/desktop/assets/app-icon-source.svg`，桌面端只做平台导出，不另画 Logo。

```sh
pnpm --filter @trainingloadai/desktop icons:generate
```

- `icon.png`：通用方形图标。
- `macos/icon.png`、`macos/icon@2x.png`：Mac Dock、原生对话框使用，包含透明留白和圆角，图形占画布 824/1024。
- `icon.icns`：同一 Mac 图标的多分辨率安装包资源，覆盖 16–1024 px。

修改源文件或导出规则后统一运行生成命令，不手工修改 PNG。

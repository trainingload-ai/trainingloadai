# SH3 开放地图证据

日期：2026-10-17

范围：MapLibre renderer、runtime `MapProvider`、本地路线缩略图、elevation provider、署名与
OSM tile policy、地图失败降级。

结论：SH3 退出门禁通过；self-host v1 总门禁仍未通过，Docker/Compose 实机门禁继续由
`B-SH0-001` 跟踪。

## 1. 交付映射

| 门禁              | 实现与证据                                                                                                      | 结果 |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| MapLibre renderer | client 直接依赖 `maplibre-gl@6.14.0`，worker 使用 ESM URL；源码不再导入 `mapbox-gl`                             | 通过 |
| Provider 边界     | capability registry 输出 `none/openfreemap/osm-raster/custom-raster/custom-style/local/mapbox` 的安全浏览器配置 | 通过 |
| 无 token 地图     | route-only 无远程 source，保留路线、起终点、比例尺；桌面与移动端真实浏览器验证                                  | 通过 |
| 本地缩略图        | Sharp 输出 light/dark PNG；StorageService public namespace；renderer v3                                         | 通过 |
| elevation         | `none/local-dem/mapbox`；local manifest provenance；缺瓦片/失败保留原始样本                                     | 通过 |
| attribution       | OpenFreeMap/OSM 固定署名；custom/local 必填署名；mini/share 不加载外部底图                                      | 通过 |
| tile policy       | OSM 仅浏览器 GET、准确 URL、Referer、正常 cache，无服务端代理/预取；首屏实测 44 个请求                          | 通过 |
| 失败隔离          | style 503 后回退 route-only；缩略图 enqueue failure 被 best-effort 边界吸收                                     | 通过 |

## 2. 自动测试

```text
server focused: 7 suites / 40 tests passed
client focused: 4 files / 11 tests passed
```

覆盖点：

- OSM URL、署名和 `browserOnly/bulkDownloadAllowed=false` 不可被环境覆盖；
- custom raster/style/local 缺 URL 或 attribution 时为 `misconfigured`；
- 私有 `sk.*` Mapbox token 永不进入 runtime snapshot；
- Core Local 拒绝远程地图、远程缩略图和 Mapbox elevation；
- route-only style 没有 remote source；
- Mapbox protocol 兼容转换；
- route endpoint 首尾语义；
- 本地缩略图确定性、PNG 尺寸、跨日界线、坏 polyline；
- local DEM provenance、路径/覆盖缺失、无 token 不访问缓存或网络；
- Terrain-RGB 123.4m 解码与原始海拔保留；
- 缩略图调度失败不向活动导入后处理路径抛出。

## 3. 真实浏览器证据

在 1440×960 desktop 与 390×844 mobile 上，以 mock auth/API 驱动真实 Next 页面和 MapLibre
Web Worker：

```text
route-only desktop: maplibregl canvas=1, mapboxgl canvas=0, scale=1, console errors=0
route-only mobile:  maplibregl canvas=1, mapboxgl canvas=0, scale=1, console errors=0
```

截图（本机临时证据）：

```text
/private/tmp/sh3-final-route-only-desktop.png
/private/tmp/sh3-final-route-only-mobile.png
/private/tmp/sh3-final-osm-policy.png
/private/tmp/sh3-route-light.png
/private/tmp/sh3-route-dark.png
```

OSM 请求使用本地生成的 256×256 PNG 响应拦截，未访问公共服务：

```json
{
  "tileCount": 44,
  "exactOfficialUrl": true,
  "getOnly": true,
  "refererPresent": true,
  "explicitNoCache": false,
  "attribution": "© OpenStreetMap contributors",
  "consoleErrors": 0
}
```

最初实现因“世界视图 → 1 秒 fitBounds 动画”产生 191 个请求；修改为构造期直接使用活动边界、
相同边界不重复 fit 后降到 44。这个测量结果是本次验收条件的一部分，而不是只看 UI 是否出图。

外部 custom style 返回 HTTP 503 的浏览器验证：

```text
10 秒后仍停留 /zh/map
maplibregl canvas=1
scale control=1
route-only 路线可见
page errors=0
仅记录预期的 style 503 console errors
```

## 4. 构建与静态检查

```text
pnpm --dir client typecheck                              PASS
pnpm --dir client build                                  PASS
NODE_OPTIONS=--max-old-space-size=8192 pnpm --dir server build  PASS
changed client ESLint                                    PASS
changed server ESLint                                    PASS
git diff --check                                         PASS
```

## 5. 已知边界

- 当前执行主机没有 Docker CLI，无法在此阶段重复 SH0/SH1 的容器重建门禁；该阻塞不改变 SH3
  代码、浏览器与构建门禁结果。
- `local-dem` 的 manifest、配置 zoom 目录和 bounded tile sample 已进入 `self-host doctor` 主动诊断；失败是
  cataloged warning，仍不得阻塞核心启动或活动导入。
- 基础发行不携带全球 tiles 或 DEM；这两类大型数据只允许 operator 显式提供。
- OSM 44 请求是固定 viewport 与活动边界的回归证据，不是对任意数据规模的流量承诺；高流量实例
  必须使用第三方或自建 tile provider。

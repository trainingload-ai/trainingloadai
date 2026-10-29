# 自托管地图、路线缩略图与海拔

本文定义 self-host v1 的地图运行边界。地图渲染器是 MapLibre GL JS；地图数据、瓦片服务和
Mapbox 是不同能力。基础镜像不包含全球地图，也不会因为地图或海拔 provider 不可用而拒绝
活动导入。

## 1. 推荐配置

### 1.1 Core Local

```dotenv
SELF_HOST_MODE=core-local
MAP_PROVIDER=none
ELEVATION_PROVIDER=none
```

此模式没有地图外部请求。主地图、活动详情、mini map 和分享图使用本地 route-only 样式；
路线、起终点、比例尺和活动统计仍可用。路线缩略图由服务端 Sharp renderer 生成，并通过
`StorageService` 写入当前 `LOCAL` public namespace。

### 1.2 Connected Self-host + OpenFreeMap（推荐）

```dotenv
SELF_HOST_MODE=connected
MAP_PROVIDER=openfreemap
ELEVATION_PROVIDER=none
```

`openfreemap` 无需 API Key，运行时固定使用 OpenFreeMap 的 Liberty 矢量样式：

```text
https://tiles.openfreemap.org/styles/liberty
© OpenMapTiles © OpenStreetMap contributors
```

Style、sprite、glyph 和 vector tile 由最终用户的浏览器直接向 OpenFreeMap 请求，不经
Trainingload.ai Server 代理。该公共服务不提供 SLA，因此加载失败时客户端会退回
route-only，活动路线和统计仍可查看。公共服务仅用于正常交互浏览；不得把它当作离线地图
下载源。部署者需要 SLA、固定数据版本或离线能力时，应选择本地 tile/style 服务。

OpenFreeMap 会在最终用户浏览器中形成明确的外部网络请求；因此 `core-local` 不允许此
provider，默认仍为 `MAP_PROVIDER=none`。启用前应复核
[OpenFreeMap Terms](https://openfreemap.org/tos/) 和
[OpenFreeMap Quick Start](https://openfreemap.org/quick_start/)。

### 1.3 Connected Self-host + OSM 官方瓦片（兼容）

```dotenv
SELF_HOST_MODE=connected
MAP_PROVIDER=osm-raster
ELEVATION_PROVIDER=none
```

`osm-raster` 的 URL 和署名由运行时固定为：

```text
https://tile.openstreetmap.org/{z}/{x}/{y}.png
© OpenStreetMap contributors
```

该 provider 仅允许浏览器正常交互请求：不经服务端代理、不批量抓取、不预取、不生成离线包，
也不强制 `no-cache`。高流量、重度使用或离线场景必须改用第三方或自建 provider。使用前应
复核 [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)。

主地图会直接以活动边界初始化，避免先加载世界视图再动画跳转造成额外瓦片请求。mini map、
分享图和服务端路线缩略图始终使用 route-only，不消耗公共瓦片。

### 1.4 自定义 raster/style

```dotenv
SELF_HOST_MODE=connected
MAP_PROVIDER=custom-raster
MAP_TILE_URL=https://tiles.example.test/{z}/{x}/{y}.png
MAP_ATTRIBUTION=© Example Maps contributors
MAP_MAX_ZOOM=18
```

或：

```dotenv
SELF_HOST_MODE=connected
MAP_PROVIDER=custom-style
MAP_STYLE_URL=https://maps.example.test/style.json
MAP_ATTRIBUTION=© Example Maps contributors
```

`MAP_ATTRIBUTION` 对 `custom-raster`、`custom-style` 和 `local` 均为必填项。style、sprite、font
和 tile URL 必须能从最终用户的浏览器访问并满足 CORS；不要把私有服务端 secret 放进这些
URL，因为 runtime capability 响应会把浏览器渲染所需配置发送给已登录客户端。

### 1.5 本地 tile/style 服务

```dotenv
SELF_HOST_MODE=core-local
MAP_PROVIDER=local
MAP_STYLE_URL=/maps/style.json
MAP_ATTRIBUTION=© Operator supplied map data
```

也可以使用 `MAP_TILE_URL`。`local` 表示数据由 operator 管理，不表示基础镜像自动携带地图
数据。浏览器必须能够解析 URL；Compose 内部服务名通常不能直接作为公网浏览器 URL。

### 1.6 显式 Mapbox 兼容模式

```dotenv
SELF_HOST_MODE=extended
MAP_PROVIDER=mapbox
MAP_PUBLIC_TOKEN=pk.public-browser-token
```

`MAP_PUBLIC_TOKEN` 会发送到浏览器，只能使用 `pk.*` public token。签名 v1 的路线缩略图固定为 local renderer，
不开放 `MAPBOX_ACCESS_TOKEN` 或服务端 Mapbox provider；Core Local 拒绝浏览器 Mapbox provider。

## 2. 本地路线缩略图

默认 `ACTIVITY_MAP_THUMB_PROVIDER=local`：

- 解码并验证 polyline，最多渲染 4,000 个采样点；
- 处理跨日界线路线并使用 Web Mercator 投影；
- 生成 light/dark PNG、路线 casing 和起终点；
- 不访问地图、tile 或商业 API；
- 使用 renderer version 3 和 `route-only-v1` key，避免与旧 Mapbox 结果混淆；
- 生成或上传失败只使派生任务失败，活动的 canonical 数据与导入结果不回滚。

应用 runtime 仍保留 `mapbox` 缩略图实现，但签名 v1 Compose 与 instance schema 不开放它。缩略图是可重建派生数据，
当前对象仍通过统一存储和垃圾回收边界管理。

## 3. 海拔 provider

### 3.1 `none`

```dotenv
ELEVATION_PROVIDER=none
```

不访问网络，不覆盖 FIT/TCX 等源文件中的原始海拔。批处理返回输入样本的副本。

### 3.2 `local-dem`

```dotenv
ELEVATION_PROVIDER=local-dem
ELEVATION_TILE_ZOOM=13
```

容器内路径固定为 `/data/elevation`，由 `SELF_HOST_DATA_ROOT` 下的 `elevation/` 只读挂载；operator 不应在
`.env.selfhost` 中加入 `ELEVATION_DATA_PATH`。

目录布局：

```text
/data/elevation/
├── source.json
└── 13/<x>/<y>.png
```

`source.json` 必须声明数据来源与许可：

```json
{
  "schemaVersion": 1,
  "format": "mapbox-terrain-rgb",
  "source": "数据集名称和版本",
  "attribution": "必须保留的署名",
  "license": "许可证标识或 URL"
}
```

瓦片必须是 Mapbox Terrain-RGB 编码的 PNG。单瓦片上限 16 MiB，路径只允许安全的
`{z}/{x}/{y}.png`。覆盖范围外的瓦片返回空结果，样本保留原始海拔；manifest 无效或 provider
失败也只降级海拔增强，不破坏普通活动导入。基础发行不附带 DEM；operator 必须自行确认
来源、许可证、区域覆盖和更新周期。`self-host doctor --json` 会在 bounded scan 内验证 manifest、配置 zoom 目录和
一个非空、≤16 MiB 的安全瓦片样本；失败返回 warning `SELF_HOST_DOCTOR_LOCAL_DEM_INVALID`。

### 3.3 签名 v1 不开放 `mapbox`

应用 runtime 保留 Mapbox elevation provider，但签名 v1 没有暴露所需服务端 token，instance schema 只接受 `none` 与
`local-dem`。不要把 `MAPBOX_ACCESS_TOKEN` 或 `ELEVATION_PROVIDER=mapbox` 加入 `.env.selfhost`；未来发行版只有在凭据、
缓存、诊断和备份边界完整纳入版本化契约后才会开放。

## 4. 失败语义

- 外部 style 在 8 秒内未加载时，客户端切换到 route-only 并继续显示路线；
- 地图 capability 配置错误是可选能力错误，不应伪装成可用 provider；
- 缩略图调度与渲染是 best-effort 派生流程；失败不会使活动导入失败；
- 海拔瓦片缺失或 provider 失败时保留原始样本；
- OpenFreeMap、OSM、custom 和 commercial provider 不会被 mini/share/thumbnail 路径隐式调用。

实现依据：[MapLibre GL JS 文档](https://maplibre.org/maplibre-gl-js/docs/)、
[MapLibre Style sources](https://maplibre.org/maplibre-style-spec/sources/)、
[OpenFreeMap Quick Start](https://openfreemap.org/quick_start/)、
[OpenFreeMap Terms](https://openfreemap.org/tos/)、
[OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)。

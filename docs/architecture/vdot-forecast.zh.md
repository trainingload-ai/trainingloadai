# 最大摄氧量四周预测运行说明

预测入口为首页最大摄氧量卡片、指标详情和 AI 教练的 `metric.forecast`。它们读取 `GET /pmc/vdot-forecast` 的同一份用户快照。

用户端统一使用“最大摄氧量”名称。“问教练”预填整个指标的解读问题，覆盖当前水平、历史变化、可用预测和近期训练建议；无预测时仍保留入口。教练先查询当前值与相关历史，再解释可用预测，建议依赖相关活动、负荷、恢复及计划证据。

首页卡片和详情以当前值为主数字，并将四周预计值并列展示。详情在桌面端将数值、区间说明与教练入口放在同一横排，移动端分为上下两行。方向箭头比较当前界面值与四周点预测，按一位小数判断：预计较高用绿色上升箭头，较低用红色下降箭头，相同用中性横线；当前值缺失时不推断方向。不展示精确提升差值，颜色也不表示区间内确定提升。

模型使用 12 个历史周窗的最大摄氧量中位数，预测随后四周。缺失周保留间隔，来源或修正口径改变时从最新可比段建立序列。默认使用内置个人历史模型，无需配置或下载模型文件。

## 默认个人历史模型

个人模型在请求时拟合该用户截止日之前的历史。它在水平模型和带阻尼趋势的状态空间模型之间选择：共 21 组候选，通过只使用目标周之前数据的滚动单周预测误差选择。无趋势和噪声较大的历史可以选择水平模型，不强制输出改善或下降。周变化斜率的稳健离差用于估计观测噪声，常数或舍入数据保留非零噪声下限。趋势的阻尼系数为 0.8、0.9 或 0.98，未来变化逐步减弱。

该选择延续了[阻尼趋势预测](https://otexts.com/fpp3/holt.html)的思路，但具体参数和最大摄氧量预测效果仍需独立回测及前瞻评估。个人数据上的滚动拟合不等同于跨用户验证。

接口返回 `modelKind=PERSONAL_HISTORY`、`intervalKind=REFERENCE`，页面及图表提示统一标为“参考范围”。范围根据状态及观测方差计算，使用正态模型的 1.281552 倍标准差；没有实测覆盖率保证，不能解释为已经校准的 80% 预测区间。AI 教练必须遵循同一标记。它仅外推历史指标，不能估算某个新训练计划的因果效果。

以下跨用户训练流程是可选的模型升级，不是首版运行的前置条件。

## 导出与训练

导出命令启动最小只读依赖模块，读取调用者明确指定的用户范围，并将用户标识转换为摘要。数据库连接强制使用只读选项。输出文件应保存在受控的本地目录。

```bash
DOTENV_CONFIG_PATH=/absolute/path/to/development.env pnpm --dir apps/server vdot:export \
  --user-id USER_ID --from 2025-01-01 --through 2026-10-31 \
  --output /private/tmp/vdot-series.json
```

使用 `--all` 可在授权的开发或分析数据库导出所有有记录的用户。JSON 输入为数组，每项含 `id` 和 `observations`，每条观测含 `date`、`value`、`source` 和 `seriesKey`。日期采用用户时区的自然日，来源采用 `FACTOR` 或 `RACE`。

训练命令在独立的选择、校准和最终测试时间段执行滚动预测。前三个日期依次划分参数选择与最终验证，目标窗口必须在各自区间内结束。

```bash
pnpm --dir apps/server vdot:fit --input /private/tmp/vdot-series.json \
  --selection-start 2025-05-01 --training-end 2025-08-01 \
  --calibration-end 2025-11-01 --test-end 2026-02-01 \
  --output /private/tmp/vdot-model.json
```

程序将评估报告写入输出路径追加 `.report.json` 的文件；数据无法组成回测时段时，报告包含稳定错误码与不含用户标识的覆盖汇总。模型满足样本量、相对基线误差、区间覆盖率、区间评分与用户级配对验证门槛后，生成模型文件。验证未通过时退出码为 `2`，运行错误为 `1`。

源码运行的在线服务可通过 `VDOT_FORECAST_MODEL_PATH` 显式选择跨用户模型。新的验证通过模型可原子替换到配置路径，服务按文件修改时间重新加载。模型的最终测试日期不得晚于当前预测截止日。此模式返回 `modelKind=VALIDATED_MODEL`、`intervalKind=CALIBRATED_80`。

未配置路径时，源码服务和签名 Self-host bundle 都使用内置个人模型。显式配置路径但工件缺失、校验失败或日期超出截止日时返回 `MODEL_UNAVAILABLE`，不会静默替换已指定的模型。签名 bundle 尚未提供可选工件的安装入口，不应手工改写可信部署配置。

## 结果状态

两种模式都要求历史至少覆盖 6 个有效周窗和 8 个观测日，最新观测最多间隔 7 天。资格不足、数据过期、口径变化、明确指定的工件不可用或计算结果超出有效范围时，接口返回对应状态与历史覆盖，预测数组为空。

可选跨用户模型的发布门槛要求至少 50 位有第四周标签的测试用户、每个周距至少 200 个样本。最终测试中，第四周 MAE 至少优于开发期选定基线 5%，前三周最多退化 5%，80% 区间的覆盖率为 75%–85%，区间评分不劣于基线，按用户配对自举的误差差值 95% 上界小于零。新用户的迁移效果需要单独验证。

`READY` 结果通过输入、拟合参数与版本指纹保存到 `VdotForecastSnapshot`。历史活动变化会形成新快照，原快照用于追溯当时的预测。用户删除通过外键级联清理其快照。

## 验证

```bash
pnpm --dir apps/server exec jest --config jest.core.config.cjs --no-watchman --runInBand \
  --runTestsByPath src/algorithm/spec/vdot-forecast.spec.ts src/training-load/spec/vdot-forecast.service.spec.ts
pnpm --dir apps/client exec vitest run --config vitest.selfhost.config.ts src/components/vdot-forecast-summary.test.tsx
pnpm --dir apps/client exec playwright test --config playwright.vdot.config.ts
```

浏览器测试使用明确标识的模拟会话与预测结果，检查真实首页、详情曲线、桌面及移动端，以及教练问题预填。数值准确性由真实历史回测和前瞻预测样本评价。

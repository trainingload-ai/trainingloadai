import type {
  ExplorationPanel,
  ExplorationQuery,
  TrainingVisualizationV2,
} from "../../../../packages/shared/training-exploration";

// Explicitly simulated evidence, used only by visual and interaction tests.
export function explorationFixtures(): TrainingVisualizationV2[] {
  const card = (
    title: string,
    query: ExplorationQuery,
    panels: ExplorationPanel[],
    notes: TrainingVisualizationV2["notes"],
  ): TrainingVisualizationV2 => ({
    kind: "training_visualization",
    schemaVersion: 2,
    title,
    subtitle: "模拟数据 · 仅用于展示效果",
    panels,
    notes,
    provenance: {
      query,
      timezone: "Asia/Shanghai",
      complete: true,
      truncated: false,
      matchedCount: 12,
      missingCount: 1,
      fingerprint: `fixture-${title}`,
    },
  });
  const signal = (id: string, duration: number, shift: number) => ({
    id,
    activityHashId: id,
    label: id === "a" ? "9 月 24 日 · 轻松跑" : "9 月 26 日 · 稳态跑",
    points: Array.from({ length: duration / 30 }, (_, i) => ({
      x: i * 30,
      y:
        i >= 20 && i < 24
          ? null
          : 128 + i * 0.32 + Math.sin(i * 0.32) * 7 + shift,
      from: i * 30,
      to: (i + 1) * 30,
      min: 125 + i * 0.32 + Math.sin(i * 0.32) * 7 + shift,
      max: 131 + i * 0.32 + Math.sin(i * 0.32) * 7 + shift,
      coverage: i >= 20 && i < 24 ? 0 : 0.98,
    })),
  });
  const line: ExplorationPanel = {
    id: "hr",
    view: "LINE",
    measure: "HEART_RATE",
    x: { kind: "ELAPSED_TIME", unit: "s" },
    y: { kind: "NUMBER", measure: "HEART_RATE", unit: "bpm" },
    series: [signal("a", 1800, 0)],
  };
  const fixtures = [
    card(
      "一次跑步的心率与配速",
      {
        source: "ACTIVITY_SERIES",
        activityHashIds: ["a"],
        measures: ["HEART_RATE", "PACE"],
      },
      [
        line,
        {
          ...line,
          id: "pace",
          measure: "PACE",
          y: { kind: "NUMBER", measure: "PACE", unit: "s/km", reverse: true },
          series: [
            {
              id: "a",
              label: "9 月 24 日 · 轻松跑",
              points: line.series[0].points.map((p) => ({
                x: p.x,
                y:
                  p.y == null
                    ? null
                    : 420 - (p.y - 125) * 1.3 + Math.sin(p.x / 150) * 6,
              })),
            },
          ],
        },
      ],
      ["TIME_WEIGHTED", "GAPS"],
    ),
    card(
      "两次跑步 · 按经过时间对齐",
      {
        source: "ACTIVITY_SERIES",
        activityHashIds: ["a", "b"],
        measures: ["HEART_RATE"],
      },
      [{ ...line, series: [signal("a", 1800, 0), signal("b", 2700, 3)] }],
      ["TIME_WEIGHTED", "GAPS"],
    ),
    card(
      "最近两周的心率区间分布",
      {
        source: "ZONE_DISTRIBUTION",
        from: "2026-09-20",
        to: "2026-09-26",
        compareFrom: "2026-09-13",
        compareTo: "2026-09-19",
        zoneType: "HEART_RATE",
        zoneUnit: "PERCENT",
      },
      [
        {
          id: "zones",
          view: "BAR",
          x: {
            kind: "CATEGORY",
            categories: [
              "Z1 · 90–120 bpm",
              "Z2 · 120–140 bpm",
              "Z3 · 140–160 bpm",
              "Z4 · 160–175 bpm",
              "Z5 · 175–190 bpm",
            ],
          },
          y: { kind: "NUMBER", unit: "%", domain: [0, 100] },
          series: [
            {
              id: "this",
              label: "本周",
              points: [20, 45, 24, 9, 2].map((y, x) => ({ x, y })),
            },
            {
              id: "last",
              label: "上周",
              points: [27, 38, 23, 10, 2].map((y, x) => ({ x, y })),
            },
          ],
        },
      ],
      ["ZONE_SNAPSHOTS", "ZONE_COVERAGE"],
    ),
    card(
      "本周训练 · 计划与实际",
      {
        source: "PLAN_EXECUTION",
        from: "2026-09-21",
        to: "2026-09-27",
        measures: ["DURATION_MIN"],
        groupBy: "DAY",
      },
      [
        {
          id: "plan",
          view: "BAR",
          measure: "DURATION_MIN",
          x: {
            kind: "CATEGORY",
            categories: [
              "9/21",
              "9/22",
              "9/23",
              "9/24",
              "9/25",
              "9/26",
              "9/27",
            ],
          },
          y: { kind: "NUMBER", unit: "min", measure: "DURATION_MIN" },
          series: [
            {
              id: "plan",
              role: "PLANNED",
              points: [35, 0, 50, 30, 0, 45, 60].map((y, x) => ({ x, y })),
            },
            {
              id: "actual",
              role: "ACTUAL",
              points: [38, 0, 46, 32, null, 42, null].map((y, x) => ({ x, y })),
            },
          ],
        },
      ],
      ["LINKED_ONLY", "MISSING_ACTUAL", "PLAN_DATE"],
    ),
    card(
      "跑步速度与平均心率的关系",
      {
        source: "RELATIONSHIP",
        from: "2026-08-28",
        to: "2026-09-26",
        measures: ["SPEED", "HEART_RATE"],
      },
      [
        {
          id: "scatter",
          view: "SCATTER",
          x: { kind: "NUMBER", measure: "SPEED", unit: "km/h" },
          y: { kind: "NUMBER", measure: "HEART_RATE", unit: "bpm" },
          pairedCount: 28,
          series: [
            {
              id: "RUN",
              label: "跑步",
              points: Array.from({ length: 28 }, (_, i) => ({
                x: 7.5 + i * 0.15 + Math.sin(i) * 0.3,
                y: 130 + i * 0.8 + Math.sin(i * 2) * 6,
                label: `9 月 ${i + 1} 日 · 跑步`,
              })),
            },
          ],
        },
      ],
      ["PAIRED_ONLY", "NOT_CAUSAL"],
    ),
    card(
      "体重与最大摄氧量 · 同日记录",
      {
        source: "RELATIONSHIP",
        relationshipBasis: "METRIC_HISTORY",
        from: "2026-08-28",
        to: "2026-09-26",
        measures: ["WEIGHT", "VO2_MAX"],
      },
      [
        {
          id: "history",
          view: "SCATTER",
          x: { kind: "NUMBER", measure: "WEIGHT", unit: "kg" },
          y: { kind: "NUMBER", measure: "VO2_MAX", unit: "ml/kg/min" },
          pairedCount: 8,
          series: [
            {
              id: "history",
              points: [74, 73.8, 74.1, 73.5, 73.7, 73.4, 73.1, 73.2].map(
                (x, i) => ({
                  x,
                  y: 42 + i * 0.3 + Math.sin(i) * 0.5,
                  label: `9 月 ${i * 3 + 1} 日`,
                }),
              ),
            },
          ],
        },
      ],
      ["HISTORY_PAIRS", "NOT_CAUSAL"],
    ),
  ];
  const multi = structuredClone(fixtures[0]);
  multi.title = "心率、配速与海拔 · 三轴趋势";
  multi.provenance.query.measures = ["HEART_RATE", "PACE", "ELEVATION"];
  multi.provenance.fingerprint = "fixture-three-axes";
  multi.panels.push({
    ...line,
    id: "elevation",
    measure: "ELEVATION",
    y: { kind: "NUMBER", measure: "ELEVATION", unit: "m" },
    series: [
      {
        id: "a",
        activityHashId: "a",
        label: line.series[0].label,
        points: line.series[0].points.map((p, i) => ({
          x: p.x,
          y: 35 + Math.sin(i / 7) * 18 + i * 0.9,
        })),
      },
    ],
  });
  return [...fixtures, multi];
}

export type McpTerminalScenario = {
  question: string;
  calls: readonly (readonly [name: string, detail: string])[];
  answer: string;
};

export type McpTerminalCopy = {
  scenarios: readonly [McpTerminalScenario, ...McpTerminalScenario[]];
  accessibleSummary: string;
};

const MCP_TERMINAL_COPY = {
  en: {
    scenarios: [
      {
        question: "Why does this week feel harder than last week?",
        calls: [
          [
            "get_training_snapshot",
            "Current load, form, recent sessions, next workouts",
          ],
          ["compare_training_periods", "Compare this week with last week"],
          ["list_planned_workouts", "Check what is still scheduled"],
        ],
        answer:
          "Your 7-day load is 468 versus 397 last week (+18%), while form moved from +4 to −9. Two harder sessions landed within 48 hours, and tomorrow still contains 6 × 3 minute intervals. The higher recent load plus compressed recovery explains the heavier feeling; the data does not establish a medical cause.",
      },
      {
        question: "My race is four weeks away. Should I adjust the plan?",
        calls: [
          ["list_competitions", "Find the next race and target date"],
          ["get_plan_adherence", "Review four weeks of planned execution"],
          ["get_training_readiness", "Check current load and form signals"],
        ],
        answer:
          "Race day is 28 days away. You completed 16 of 18 planned sessions (89%); current form is −5 and 7-day load remains inside your recent range. The data does not support a large plan change now. Keep the recovery day, then review again after the weekend key session. This is not a medical or safe-to-race decision.",
      },
      {
        question: "Has my running fitness actually improved?",
        calls: [
          ["get_fitness_trends", "Read the 12-week running fitness trend"],
          ["get_activity_statistics", "Compare pace, duration, and volume"],
          ["get_personal_bests", "Check recent running bests"],
        ],
        answer:
          "Running effective VO₂max rose from 49.2 to 51.0 over 12 weeks, while pace in the same heart-rate band improved from 4:58/km to 4:46/km. Your 5 km best is unchanged. That supports better aerobic efficiency, but not yet a new 5 km race-performance claim.",
      },
    ],
    accessibleSummary:
      "Three animated MCP examples rotate through week-over-week fatigue, race preparation, and running fitness. Each example shows the real TrainingLoad tools used before a plain-text answer.",
  },
  zh: {
    scenarios: [
      {
        question: "为什么这周感觉比上周累？",
        calls: [
          ["get_training_snapshot", "获取当前负荷、状态、近期训练与接下来课程"],
          ["compare_training_periods", "比较本周与上周"],
          ["list_planned_workouts", "检查仍待执行的计划"],
        ],
        answer:
          "你最近 7 天负荷为 468，上周为 397（+18%），同时状态从 +4 降到 −9。两次高负荷训练间隔不足 48 小时，明天仍有 6 × 3 分钟间歇。近期负荷升高和恢复被压缩可以解释更累的感觉，但这些数据不能证明医疗原因。",
      },
      {
        question: "距离比赛还有 4 周，需要调整计划吗？",
        calls: [
          ["list_competitions", "找到下一场比赛和目标日期"],
          ["get_plan_adherence", "检查近 4 周计划执行情况"],
          ["get_training_readiness", "查看当前负荷与状态信号"],
        ],
        answer:
          "比赛还有 28 天。最近 4 周完成了 18 节计划中的 16 节（89%）；当前状态为 −5，7 天负荷仍在近期常见区间。现有数据不支持立刻大幅改计划，先保留恢复日，周末关键课后再复核。这不是医疗判断或安全参赛结论。",
      },
      {
        question: "最近跑步能力真的进步了吗？",
        calls: [
          ["get_fitness_trends", "读取近 12 周跑步体能趋势"],
          ["get_activity_statistics", "比较配速、时长与训练量"],
          ["get_personal_bests", "核对近期跑步最佳成绩"],
        ],
        answer:
          "近 12 周跑步 effective VO₂max 从 49.2 升到 51.0，同一心率区间的配速从 4:58/km 提升到 4:46/km；5 km 最佳成绩没有变化。这支持有氧效率正在改善，但还不能断言 5 km 比赛能力已经刷新。",
      },
    ],
    accessibleSummary:
      "三个 MCP 动画示例依次展示周间疲劳、赛前准备和跑步能力变化。每个示例都会先显示真实使用的 TrainingLoad 工具，再返回纯文本结论。",
  },
} as const satisfies Record<"en" | "zh", McpTerminalCopy>;

export function getMcpTerminalCopy(lang: string): McpTerminalCopy {
  return lang === "zh" ? MCP_TERMINAL_COPY.zh : MCP_TERMINAL_COPY.en;
}

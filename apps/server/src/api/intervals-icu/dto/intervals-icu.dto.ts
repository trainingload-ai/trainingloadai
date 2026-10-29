/** API Key 连接 / 更新连接设置。新连接必须带 apiKey；已连接可只改开关。 */
export class ConnectIntervalsIcuDto {
  /** Intervals.icu 个人 API Key；留空表示沿用已存凭证。 */
  apiKey?: string;
  /** 是否同步已完成活动。 */
  syncActivities?: boolean;
  /** 是否开启每日定时活动同步。 */
  syncScheduledActivities?: boolean;
  /** 是否从 Intervals.icu 拉计划课表。 */
  syncPlannedWorkouts?: boolean;
  /** 是否同步 wellness（睡眠/HRV 等）。 */
  syncWellness?: boolean;
  /** 是否把本地活动上行到 Intervals.icu。 */
  exportActivities?: boolean;
  /** 是否把本地计划课表推到 Intervals.icu。 */
  exportPlannedWorkouts?: boolean;
  /** 预留：wellness 上行（当前产品侧可能未开放）。 */
  exportWellness?: boolean;
  /** 是否同步远端运动设置（FTP/LTHR 等正式设置）。 */
  syncSportSettings?: boolean;
  /** 兼容旧字段；服务端会强制为 false，不再上行运动设置。 */
  exportSportSettings?: boolean;
  /** 更换 API Key 时的二次确认；未确认且 fingerprint 变化会要求确认。 */
  replaceCredentialConfirmed?: boolean;
  /** 连接后可选：计划课同步窗口起点（YYYY-MM-DD）。 */
  plannedWorkoutWeekStart?: string;
}

/** 发起 OAuth 授权时携带的同步偏好与回跳地址。 */
export class StartIntervalsIcuOAuthDto {
  /** 是否同步已完成活动。 */
  syncActivities?: boolean;
  /** 是否开启每日定时活动同步。 */
  syncScheduledActivities?: boolean;
  /** 是否从 Intervals.icu 拉计划课表。 */
  syncPlannedWorkouts?: boolean;
  /** 是否同步 wellness（睡眠/HRV 等）。 */
  syncWellness?: boolean;
  /** 是否把本地活动上行到 Intervals.icu。 */
  exportActivities?: boolean;
  /** 是否把本地计划课表推到 Intervals.icu。 */
  exportPlannedWorkouts?: boolean;
  /** 预留：wellness 上行（当前产品侧可能未开放）。 */
  exportWellness?: boolean;
  /** 是否同步远端运动设置（FTP/LTHR 等正式设置）。 */
  syncSportSettings?: boolean;
  /** 兼容旧字段；服务端会强制为 false，不再上行运动设置。 */
  exportSportSettings?: boolean;
  /** 连接后可选：计划课同步窗口起点（YYYY-MM-DD）。 */
  plannedWorkoutWeekStart?: string;
  /** 授权完成后回跳 URL（同源 web 或已配置的移动端 scheme）。 */
  returnUrl?: string;
}

/** 仅更新同步/导出开关，不改凭证。 */
export class UpdateIntervalsIcuSettingsDto implements ThirdPartySettingsPatch {
  importActivitiesAutomatically?: boolean;
  exportActivitiesAutomatically?: boolean;
  importPlannedWorkouts?: boolean;
  exportPlannedWorkouts?: boolean;
  importWellness?: boolean;
  exportWellness?: boolean;
  importAthleteProfile?: boolean;
  exportAthleteProfile?: boolean;
  syncScheduledActivities?: boolean;
  syncPlannedWorkouts?: boolean;
  syncWellness?: boolean;
  exportActivities?: boolean;
  syncSportSettings?: boolean;
  exportSportSettings?: boolean;
}

/** 手动立即同步参数。 */
export class SyncIntervalsIcuDto {
  /** 活动同步窗口终点日期（YYYY-MM-DD）；默认今天，向前 60 天。 */
  newest?: string;
  /** 计划课同步窗口起点；不传则按 trigger 规则推算。 */
  plannedWorkoutWeekStart?: string;
}
import type { ThirdPartySettingsPatch } from '@shared/third-party-integration';

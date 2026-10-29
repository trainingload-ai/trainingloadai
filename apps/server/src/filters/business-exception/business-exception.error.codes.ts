export const BUSINESS_ERROR_CODE = {
  // 公共错误码
  COMMON: 10001,
  // 特殊错误码
  TOKEN_INVALID: 10002,
  // 禁止访问
  ACCESS_FORBIDDEN: 10003,
  // 权限已禁用
  PERMISSION_DISABLED: 10003,
  // 用户已冻结
  USER_DISABLED: 10004,
  // 用户不存在
  USER_NOT_FOUND: 10005,
  // 未登录
  UNAUTHORIZED: 10006,
  // 活动未找到
  ACTIVITY_NOT_FOUND: 10007,
  // 系统内部错误
  INTERNAL_SERVER_ERROR: 10008,
  // 上传文件为空
  UPLOAD_NO_FILE: 10009,
  // 文件解析失败
  FILE_PARSE_FAILED: 10010,
  // 无有效功率数据
  NO_VALID_POWER_DATA: 10011,
  // 通用资源未找到
  RESOURCE_NOT_FOUND: 10012,
  // 资源状态冲突
  CONFLICT: 10013,
  // 请求语义无法处理
  UNPROCESSABLE_ENTITY: 10014,
  // AI 数据共享尚未获得用户同意
  AI_DATA_CONSENT_REQUIRED: 10015,
  // 计划课时已开始、完成、绑定活动或属于不可写计划
  WORKOUT_IMMUTABLE: 10016,
  // 计划提案已过期
  PLAN_PROPOSAL_EXPIRED: 10017,
  // 计划或区间在确认前发生变化
  PLAN_PROPOSAL_CONFLICT: 10018,
  // 计划提案语义或覆盖范围无效
  PLAN_PROPOSAL_INVALID: 10019,
  // 本地存储 object key 非法或越过配置根目录
  STORAGE_INVALID_PATH: 10020,
  // 本地存储对象不存在
  STORAGE_FILE_NOT_FOUND: 10021,
  // 本地存储目录不可写、只读或权限不足
  STORAGE_NOT_WRITABLE: 10022,
  // 本地存储空间或 inode 已耗尽
  STORAGE_NO_SPACE: 10023,
  // 可选 capability 未启用或当前模式禁止
  CAPABILITY_DISABLED: 10024,
  // capability 已选择但 provider 配置不完整
  CAPABILITY_MISCONFIGURED: 10025,
};
